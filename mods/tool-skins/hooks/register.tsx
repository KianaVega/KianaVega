import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

type Palette = { read: string; edit: string; run: string; search: string; other: string; fail: string }

// Add your own design system here: one palette per skin, any hex colors.
const SKINS: Record<string, Palette> = {
  nord: { read: '#88c0d0', edit: '#a3be8c', run: '#ebcb8b', search: '#81a1c1', other: '#b48ead', fail: '#bf616a' },
  tokyo: { read: '#7dcfff', edit: '#9ece6a', run: '#e0af68', search: '#7aa2f7', other: '#bb9af7', fail: '#f7768e' },
  dracula: { read: '#8be9fd', edit: '#50fa7b', run: '#f1fa8c', search: '#bd93f9', other: '#ff79c6', fail: '#ff5555' },
  gruvbox: { read: '#83a598', edit: '#b8bb26', run: '#fabd2f', search: '#8ec07c', other: '#d3869b', fail: '#fb4934' },
  solarized: { read: '#2aa198', edit: '#859900', run: '#b58900', search: '#268bd2', other: '#6c71c4', fail: '#dc322f' },
  catppuccin: { read: '#89dceb', edit: '#a6e3a1', run: '#f9e2af', search: '#89b4fa', other: '#cba6f7', fail: '#f38ba8' },
  mono: { read: 'white', edit: 'white', run: 'white', search: 'white', other: 'white', fail: 'red' },
}
const DEFAULT_SKIN = 'tokyo'

const ICONS: Record<string, string> = {
  Read: '[R]',
  Edit: '[E]',
  MultiEdit: '[E]',
  Write: '[W]',
  Bash: '[$]',
  Grep: '[?]',
  Glob: '[?]',
  WebFetch: '[@]',
  WebSearch: '[@]',
  Agent: '[A]',
}

const skin = atom({ plugin: 'tool-skins', key: 'skin' } as const, DEFAULT_SKIN)

const kindOf = (tool: string): keyof Palette => {
  if (tool === 'Read') return 'read'
  if (['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(tool)) return 'edit'
  if (tool === 'Bash') return 'run'
  if (['Grep', 'Glob', 'WebSearch', 'WebFetch'].includes(tool)) return 'search'
  return 'other'
}

const summarize = (input: unknown): string => {
  const i = (input ?? {}) as Record<string, unknown>
  const pick = i.file_path ?? i.command ?? i.pattern ?? i.query ?? i.url ?? i.description ?? ''

  return String(pick).split('\n')[0]!.slice(0, 80)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('skin')
    if (typeof saved === 'string' && saved in SKINS) {
      await update($, skin, () => saved)
    }
    await $.command.register({
      name: 'skin',
      description: `Pick a tool-call skin: ${Object.keys(SKINS).join(', ')}`,
      argumentHint: '<name>',
    })

    return next(e)
  })

  on('command.run', { command: 'skin' }, async ($, e) => {
    const name = e.args.trim()
    if (!(name in SKINS)) {
      return { text: `Skins: ${Object.keys(SKINS).join(', ')}. Current: ${await read($, skin)}.` }
    }
    await update($, skin, () => name)
    await $.store.set('skin', name)

    return { text: `Skin set to ${name}.` }
  })

  // Change: draw each tool row with its own icon and color. Display only.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const palette = SKINS[await read($, skin)] ?? SKINS[DEFAULT_SKIN]!
    const tool = e.props.tool
    const color = e.props.isErrored ? palette.fail : palette[kindOf(tool)]

    return (
      <Box>
        <Text color={color} bold>
          {ICONS[tool] ?? '[*]'} {tool}{' '}
        </Text>
        <Text dimColor={!e.props.isRunning}>{summarize(e.props.input)}</Text>
        {e.props.isRunning && <Text color={color}> ...</Text>}
      </Box>
    )
  })
}
