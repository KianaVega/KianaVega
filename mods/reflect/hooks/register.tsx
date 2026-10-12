import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Candidate } from '../types'

// Edit to taste: phrases that signal a correction worth remembering.
const TRIGGERS = [
  /^\s*(no|nope|nah)\b/i,
  /\bthis (doesn't|does not|isn't|is not) (look|work|right|good)/i,
  /\bthat'?s (wrong|not (right|what))/i,
  /\bi wish (we|you)('d| had| would)/i,
  /\b(don't|do not|never|stop) (do|use|add|write|make)\b/i,
  /\binstead\b.*\b(use|do|write)\b/i,
]

const candidate = atom({ plugin: 'reflect', key: 'candidate' } as const, null as Candidate | null)
const status = atom({ plugin: 'reflect', key: 'status' } as const, '')

async function save($: EngineInterface, scope: 'project' | 'global') {
  const c = await read($, candidate)
  if (c === null) return

  await update($, status, () => 'Writing the rule...')
  const drafted = await $.model.complete({
    model: 'haiku',
    maxTokens: 120,
    system:
      'Turn the person\'s feedback into one short, imperative rule for a CLAUDE.md file. ' +
      'Output only the rule as a single line starting with "- ". No preamble.',
    prompt: `Assistant's previous reply:\n${c.context}\n\nPerson's feedback:\n${c.feedback}`,
  })
  const rule = drafted.isAnswered && drafted.text.trim().startsWith('-')
    ? drafted.text.trim().split('\n')[0]!
    : `- ${c.feedback.trim()}`

  const home = (await $.env.get('HOME')) ?? ''
  const path = scope === 'global' ? `${home}/.claude/CLAUDE.md` : `${await $.session.cwd()}/CLAUDE.md`
  let existing = ''
  try {
    existing = String(await $.fs.read(path))
  } catch {
    existing = ''
  }
  const sep = existing === '' || existing.endsWith('\n') ? '' : '\n'
  const heading = existing.includes('## Learned rules') ? '' : '\n## Learned rules\n'
  await $.fs.write(path, `${existing}${sep}${heading}${rule}\n`)

  await update($, candidate, () => null)
  $.ui.toast(`Saved to ${path}: ${rule}`)
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (e.text.length > 3 && e.text.length < 800 && TRIGGERS.some(t => t.test(e.text))) {
      const rows = await $.session.messages()
      const lastReply = [...rows].reverse().find(r => r.role === 'assistant')?.text ?? ''
      await update($, candidate, () => ({ feedback: e.text, context: lastReply.slice(0, 1500) }))
      await update($, status, () => '')
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const c = await read($, candidate)
    if (e.props.hasSurvey || e.props.isWorking || c === null) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const note = await read($, status)

    return (
      <Box flexDirection="column">
        <Text color="remember">Save this feedback as a permanent rule? {note}</Text>
        <Box>
          <Button key="project" label="Save to project CLAUDE.md" hotkey="1" onPress={() => save($, 'project')} />
          <Text> </Text>
          <Button key="global" label="Save to global CLAUDE.md" hotkey="2" onPress={() => save($, 'global')} />
          <Text> </Text>
          <Button key="skip" label="Dismiss" hotkey="3" onPress={() => update($, candidate, () => null)} />
        </Box>
      </Box>
    )
  })
}
