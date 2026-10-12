import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Flag } from '../types'

// Steer what the watcher looks for. This mod makes one extra model call per
// long answer, so it counts against your usage. Short answers are skipped.
const FOCUS = 'unexpected costs, destructive or irreversible actions, security risks, and decisions the user must make'
const MIN_CHARS = 600
const MODEL = 'haiku'

const flag = atom({ plugin: 'you-should-know', key: 'flag' } as const, null as Flag | null)

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const shown = await next(e)

    if (e.agentId !== undefined || e.reason !== 'answer' || shown.text.length < MIN_CHARS) {
      return shown
    }

    const result = await $.model.complete({
      model: MODEL,
      maxTokens: 150,
      system:
        'You review an AI coding assistant reply for the person who may not have read all of it. ' +
        `Look only for: ${FOCUS}. ` +
        'If something important is buried in the text, answer with one plain sentence, under 25 words. ' +
        'If nothing needs attention, answer exactly NONE.',
      prompt: shown.text.slice(0, 12000),
    })

    if (result.isAnswered) {
      const text = result.text.trim()
      if (text !== '' && !/^none\b/i.test(text)) {
        await update($, flag, () => ({ text, at: Date.now() }))
        $.ui.toast(`You should know: ${text}`, { timeoutMs: 15000 })
      }
    }

    return shown
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, flag, () => null)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, flag)
    if (e.props.hasSurvey || current === null) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color="warning">You should know: {current.text} </Text>
        <Button key="dismiss" label="Dismiss" onPress={() => update($, flag, () => null)} />
      </Box>
    )
  })
}
