import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Page } from '../types'

const PANE = 'browser'
const SHOT_DIR = '/tmp/terminal-browser'
const BROWSERS = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']
const MAX_TEXT = 6000

const page = atom({ plugin: 'terminal-browser', key: 'page' } as const, null as Page | null)

const toText = (html: string): { title: string; text: string } => {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
  const text = html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, (_m, tag: string, inner: string) => `\n${'#'.repeat(Number(tag[1]))} ${inner}\n`)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<(br|\/p|\/div|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { title, text: text.slice(0, MAX_TEXT) }
}

export const register: Register = on => {
  let lastHtml: string | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'browse',
      description: 'Open a URL or local HTML file in a pane beside the chat',
      argumentHint: '<url | file>',
    })

    return next(e)
  })

  // Remember the last HTML file Claude wrote so a bare /browse can open it.
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    if (e.file_path.endsWith('.html')) lastHtml = e.file_path

    return next(e)
  })

  on('command.run', { command: 'browse' }, async ($, e) => {
    const target = e.args.trim() || lastHtml
    if (target === undefined || target === '') {
      return { text: 'Usage: /browse <url or html file>. With no argument it opens the last HTML file Claude wrote.' }
    }
    const isUrl = /^https?:\/\//i.test(target)
    const cwd = await $.session.cwd()
    const abs = target.startsWith('/') ? target : `${cwd}/${target}`
    const url = isUrl ? target : `file://${abs}`

    let body = ''
    let note = ''
    try {
      body = isUrl ? (await $.http.fetch(target)).text : String(await $.fs.read(abs))
    } catch {
      note = 'Could not load the page text.'
    }
    const { title, text } = toText(body)

    let shot: string | null = null
    try {
      const found = await $.process.run(['sh', '-c', `command -v ${BROWSERS.join(' ')} | head -1`])
      const browser = found.stdout.trim()
      if (browser !== '') {
        const out = `${SHOT_DIR}/shot-${await $.clock.now()}.png`
        await $.fs.write(`${SHOT_DIR}/.keep`, '')
        const ran = await $.process.run(
          [browser, '--headless', '--no-sandbox', '--disable-gpu', `--screenshot=${out}`, '--window-size=1280,800', url],
          { timeoutMs: 30000 },
        )
        if (ran.exitCode === 0) shot = out
      }
    } catch {
      note = `${note} No screenshot (no headless browser available).`.trim()
    }

    await update($, page, () => ({ url, title, text, shot, note }))
    await $.ui.open({ id: PANE, title: 'Browser' })

    return { text: `Opened ${url} in the Browser pane.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const current = await read($, page)

    if (current === null) {
      const { Text } = $.ui.resolve(e)

      return <Text dimColor>Nothing open. Try /browse https://example.com</Text>
    }

    // Only the terminal surface draws pictures; others get the text alone.
    const picture =
      e.surface === 'terminal' && current.shot !== null
        ? (() => {
            const { Image } = $.ui.resolve(e)

            return (
              <Image
                source={{ file: current.shot, format: 'png' }}
                columns={Math.max(20, e.props.bodyColumns)}
                rows={14}
                alt="Page screenshot"
              />
            )
          })()
        : null
    const { Box, Text, Markdown } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text bold>{current.title || current.url}</Text>
        <Text dimColor>{current.url}</Text>
        {current.note !== '' && <Text color="warning">{current.note}</Text>}
        {picture}
        <Markdown text={current.text} />
      </Box>
    )
  })
}
