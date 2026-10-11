import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { EditStep } from '../types'

const PANE = 'replay'

const current = atom({ plugin: 'replay-theater', key: 'current' } as const, [] as EditStep[])
const last = atom({ plugin: 'replay-theater', key: 'last' } as const, [] as EditStep[])
const index = atom({ plugin: 'replay-theater', key: 'index' } as const, 0)

const diffOf = (step: EditStep): string => {
  const before = step.before === '' ? [] : step.before.split('\n')
  const after = step.after.split('\n')

  return [
    `--- ${step.path}`,
    `+++ ${step.path}`,
    `@@ -1,${before.length} +1,${after.length} @@`,
    ...before.map(l => `-${l}`),
    ...after.map(l => `+${l}`),
  ].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'replay', description: 'Step through the edits from the last turn' })

    return next(e)
  })

  on('command.run', { command: 'replay' }, async $ => {
    const steps = await read($, last)
    if (steps.length === 0) return { text: 'No edits to replay yet.' }
    await update($, index, () => 0)
    await $.ui.open({ id: PANE, title: 'Replay' })

    return { text: `Replaying ${steps.length} edit(s).` }
  })

  // Watch: record each file edit as it is made, in the main loop only.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const tool = String(e.tool)
    const ran = await next(e)
    const hasFailed = ran.deny !== undefined || ran.isError === true

    if (!hasFailed) {
      const i = e as unknown as Record<string, unknown>
      const path = String(i.file_path ?? i.notebook_path ?? '')
      let step: EditStep | undefined
      if (tool === 'Edit') {
        step = { path, tool, before: String(i.old_string ?? ''), after: String(i.new_string ?? '') }
      } else if (tool === 'Write') {
        step = { path, tool, before: '', after: String(i.content ?? '') }
      } else if (tool === 'MultiEdit' && Array.isArray(i.edits)) {
        const edits = i.edits as Array<{ old_string?: string; new_string?: string }>
        step = {
          path,
          tool,
          before: edits.map(x => x.old_string ?? '').join('\n...\n'),
          after: edits.map(x => x.new_string ?? '').join('\n...\n'),
        }
      }
      if (step !== undefined) {
        const s = step
        await update($, current, list => [...list, s].slice(-200))
      }
    }

    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, current, () => [])

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const steps = await read($, current)
      if (steps.length > 0) {
        await update($, last, () => steps)
        await update($, index, () => 0)
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const steps = await read($, last)
    if (e.props.hasSurvey || e.props.isWorking || steps.length === 0) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>{steps.length} edit(s) last turn </Text>
        <Button
          key="replay"
          label="Replay"
          onPress={async () => {
            await update($, index, () => 0)
            await $.ui.open({ id: PANE, title: 'Replay' })
          }}
        />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const steps = await read($, last)
    const i = Math.min(await read($, index), Math.max(0, steps.length - 1))
    const step = steps[i]
    const { Box, Button, Code, Text } = $.ui.resolve(e)

    if (step === undefined) {
      return <Text dimColor>Nothing to replay.</Text>
    }

    return (
      <Box flexDirection="column">
        <Box>
          <Button key="prev" label="Prev" hotkey="p" onPress={() => update($, index, n => Math.max(0, n - 1))} />
          <Text> </Text>
          <Button key="next" label="Next" hotkey="n" onPress={() => update($, index, n => Math.min(steps.length - 1, n + 1))} />
          <Text>
            {' '}
            {i + 1}/{steps.length} {step.tool} {step.path}
          </Text>
        </Box>
        <Code source={diffOf(step)} format="diff" path={step.path} />
      </Box>
    )
  })
}
