import { expect, mock, test } from 'claude-code/testing'

test('a prompt after the cache has gone cold is held with an estimate', async ($, on) => {
  const clock = mock.clock(on)
  on('session.usage', () => ({ value: { context: { tokens: 150_000, window: 1_000_000 }, startedAt: 0, rateLimits: [] } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('prompt.fill', () => ({ isFilled: true }))

  // A first prompt establishes activity.
  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
  await clock.advance(2 * 60 * 60 * 1000)
  const cold = await $.prompt.submit({ text: 'continue', wait: false, origin: { kind: 'composer' } })

  expect(JSON.stringify(cold)).toContain('Cache is cold')
})

test('a prompt soon after the last one goes through', async ($, on) => {
  const clock = mock.clock(on)
  on('prompt.submit', (_$, e) => ({ text: e.text }))

  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
  await clock.advance(5 * 60 * 1000)
  const warm = await $.prompt.submit({ text: 'again', wait: false, origin: { kind: 'composer' } })

  expect(JSON.stringify(warm)).not.toContain('Cache is cold')
})
