import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Crab, Progress } from '../types'

// Edit these to restyle the mod. Each helper crab gets a look by agent type.
const LOOKS: Record<string, string> = {
  'general-purpose': '(o_o)',
  Explore: '(o.O)',
  Plan: '(-_-)',
  designer: '(^_~)',
  developer: '(>_<)',
}
const DEFAULT_LOOK = '(o_o)'
const BAR_WIDTH = 24

// Rough USD per million tokens: input, output, cache read, cache write.
const PRICES: Array<[RegExp, [number, number, number, number]]> = [
  [/opus|fable/i, [15, 75, 1.5, 18.75]],
  [/sonnet/i, [3, 15, 0.3, 3.75]],
  [/haiku/i, [1, 5, 0.1, 1.25]],
]

const progress = atom({ plugin: 'savvy-progress', key: 'progress' } as const, {
  steps: 0,
  created: 0,
  done: 0,
} satisfies Progress)
const crabs = atom({ plugin: 'savvy-progress', key: 'crabs' } as const, [] as Crab[])

const costOf = (
  model: string,
  u: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  },
): number => {
  const row = PRICES.find(([re]) => re.test(model))?.[1] ?? [3, 15, 0.3, 3.75]
  return (
    (u.input_tokens * row[0] +
      u.output_tokens * row[1] +
      (u.cache_read_input_tokens ?? 0) * row[2] +
      (u.cache_creation_input_tokens ?? 0) * row[3]) /
    1_000_000
  )
}

const bar = (done: number, total: number): string => {
  const filled = total === 0 ? 0 : Math.round((done / total) * BAR_WIDTH)
  return '#'.repeat(filled) + '-'.repeat(BAR_WIDTH - filled)
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    await update($, progress, () => ({ steps: 0, created: 0, done: 0 }))
    await update($, crabs, () => [])

    return next(e)
  })

  // Watch: every main-loop tool call is a step; task tools say how far along we are.
  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) {
      const input = e as unknown as Record<string, unknown>
      const tool = String(e.tool)

      await update($, progress, p => {
        const out: Progress = { ...p, steps: p.steps + 1 }
        if (tool === 'TaskCreate') out.created += 1
        if (tool === 'TaskUpdate' && input.status === 'completed') out.done += 1
        if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
          const todos = input.todos as Array<{ status?: string }>
          out.created = todos.length
          out.done = todos.filter(t => t.status === 'completed').length
        }

        return out
      })
    }

    return next(e)
  })

  // Watch: every subagent turn adds its model, tokens and cost to its crab.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined && e.usage !== undefined) {
      const id = e.agentId
      const usage = e.usage
      const info = (await $.agent.list()).find(a => a.id === id)
      const tokens = usage.input_tokens + usage.output_tokens
      const cost = costOf(usage.model, usage)

      await update($, crabs, list => {
        const known = list.find(c => c.id === id)
        if (known === undefined) {
          const fresh: Crab = {
            id,
            label: info?.description ?? info?.name ?? id.slice(0, 8),
            type: info?.type ?? 'general-purpose',
            model: usage.model,
            tokens,
            cost,
            isDone: false,
          }

          return [...list, fresh]
        }

        return list.map(c =>
          c.id === id ? { ...c, model: usage.model, tokens: c.tokens + tokens, cost: c.cost + cost } : c,
        )
      })
    }

    return next(e)
  })

  // Change: draw the band above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await read($, progress)
    const list = await read($, crabs)
    const isQuiet = e.props.hasSurvey || (!e.props.isWorking && list.length === 0)

    if (isQuiet) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const total = p.created
    const line =
      total > 0
        ? `[${bar(p.done, total)}] ${p.done}/${total} tasks, ${p.steps} steps`
        : `[${'~'.repeat(BAR_WIDTH)}] ${p.steps} steps`
    const spend = list.reduce((sum, c) => sum + c.cost, 0)

    return (
      <Box flexDirection="column">
        <Text color="claude">{line}</Text>
        {list.map(c => (
          <Text dimColor={c.isDone}>
            {LOOKS[c.type] ?? DEFAULT_LOOK} {c.label} | {c.model} | {c.tokens.toLocaleString()} tok | ~${c.cost.toFixed(3)}
          </Text>
        ))}
        {list.length > 1 && <Text dimColor>helpers total ~${spend.toFixed(3)} (estimate)</Text>}
      </Box>
    )
  })
}
