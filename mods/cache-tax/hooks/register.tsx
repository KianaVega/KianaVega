import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

// The cache lives about an hour on a subscription plan (5 minutes on the plain API).
const CACHE_TTL_MS = 60 * 60 * 1000
const WARN_AFTER_MS = 55 * 60 * 1000 // ping this long after the last request
const KEEP_WARM_BY_DEFAULT = false
const MIN_TOKENS_TO_WARN = 20_000
const INPUT_USD_PER_MTOK = 3 // rough price for reloading uncached context
const CACHE_WRITE_MULTIPLIER = 1.25

const warning = atom({ plugin: 'cache-tax', key: 'warning' } as const, null as string | null)

let lastActivity: number | undefined
let isKeepingWarm = KEEP_WARM_BY_DEFAULT
let isHeld = false
let timer: { cancel: () => void } | undefined

function arm($: EngineInterface) {
  timer?.cancel()
  if (!isKeepingWarm) return
  timer = $.clock.after(WARN_AFTER_MS, async () => {
    // A tiny message so the cache entry is read, and renewed, before it expires.
    await $.prompt.submit({ text: 'Reply with the single word: warm.' })
  })
}

export const register: Register = on => {
  lastActivity = undefined
  isHeld = false

  on('session.start', async ($, e, next) => {
    lastActivity = await $.clock.now()
    await $.command.register({ name: 'keepwarm', description: 'Toggle pinging the session to keep the prompt cache warm' })
    arm($)

    return next(e)
  })

  on('command.run', { command: 'keepwarm' }, async $ => {
    isKeepingWarm = !isKeepingWarm
    arm($)

    return { text: `Keep-warm is ${isKeepingWarm ? 'on' : 'off'}.` }
  })

  // Change: hold a prompt that would reload a cold cache until the person sends it again.
  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    const idle = lastActivity === undefined ? 0 : now - lastActivity
    const isCold = lastActivity !== undefined && idle > CACHE_TTL_MS

    if (isCold && !isHeld) {
      const usage = await $.session.usage()
      const tokens = usage.context.tokens ?? 0
      if (tokens === 0 || tokens >= MIN_TOKENS_TO_WARN) {
        const cost = (tokens / 1_000_000) * INPUT_USD_PER_MTOK * CACHE_WRITE_MULTIPLIER
        const size = tokens === 0 ? 'the whole conversation' : `about ${tokens.toLocaleString()} tokens`
        const text = `Cache is cold (${Math.round(idle / 60000)} min idle). Sending reloads ${size}${tokens === 0 ? '' : `, roughly $${cost.toFixed(2)}`}. Send again to continue.`
        isHeld = true
        await update($, warning, () => text)
        $.ui.toast(text, { timeoutMs: 20000 })

        await $.prompt.fill({ text: e.text, mode: 'replace' })

        return { drop: text }
      }
    }

    isHeld = false
    lastActivity = now
    await update($, warning, () => null)
    arm($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    lastActivity = await $.clock.now()
    arm($)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const text = await read($, warning)
    if (e.props.hasSurvey || text === null) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color="warning">{text}</Text>
      </Box>
    )
  })
}
