import { expect, test } from 'claude-code/testing'

const OK = { result: { stdout: 'ok', stderr: '' } as never, text: 'ok' }

test('a harmless command goes straight through', async ($, on) => {
  on('tool.call', () => OK)

  const outcome = await $.tool.call({ tool: 'Bash', command: 'ls -la' })

  expect(outcome.deny).toBeUndefined()
  expect(outcome.text).toBe('ok')
})

test('a recursive delete is refused when nobody presses Proceed', async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'build/a.js\nbuild/b.js\n', stderr: '' } }) as never)
  on('tool.call', () => OK)

  const outcome = await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })

  expect(outcome.deny).toContain('blast-radius')
  expect(outcome.text).toBeUndefined()
})

test('git reset --hard is also held', async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 0, stdout: ' a.ts | 2 +-\n', stderr: '' } }) as never)
  on('tool.call', () => OK)

  const outcome = await $.tool.call({ tool: 'Bash', command: 'git reset --hard HEAD~1' })

  expect(outcome.deny).toContain('blast-radius')
})
