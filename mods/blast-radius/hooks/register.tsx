import type { Register } from 'claude-code'

const MAX_LISTED = 25

type Risk = { kind: string; preview: readonly string[] | undefined; targets: string[] }

const unquote = (s: string) => s.replace(/^['"]|['"]$/g, '')

// Split a simple command into words. Good enough to spot the dangerous forms;
// anything cleverer than this is shown to the person as the raw command.
const words = (segment: string) => segment.trim().split(/\s+/).map(unquote).filter(Boolean)

const classify = (command: string): Risk | undefined => {
  for (const segment of command.split(/&&|\|\||;|\|/)) {
    const w = words(segment.replace(/^\s*sudo\s+/, ''))
    const [cmd, ...rest] = w
    const flags = rest.filter(a => a.startsWith('-'))
    const args = rest.filter(a => !a.startsWith('-'))

    if (cmd === 'rm' && flags.some(f => /^-[a-zA-Z]*[rR]/.test(f) || f === '--recursive')) {
      return { kind: 'recursive delete', preview: undefined, targets: args }
    }
    if (cmd === 'rmdir' || cmd === 'shred') {
      return { kind: cmd, preview: undefined, targets: args }
    }
    if (cmd === 'find' && rest.includes('-delete')) {
      return { kind: 'find -delete', preview: ['find', ...rest.filter(a => a !== '-delete'), '-type', 'f'], targets: [] }
    }
    if (cmd === 'git' && rest[0] === 'clean' && flags.some(f => /f/.test(f))) {
      return { kind: 'git clean', preview: ['git', 'clean', '-n', '-d', '-x'], targets: [] }
    }
    if (cmd === 'git' && rest[0] === 'reset' && rest.includes('--hard')) {
      return { kind: 'git reset --hard', preview: ['git', 'diff', '--stat', 'HEAD'], targets: [] }
    }
    if (cmd === 'git' && rest[0] === 'checkout' && (rest.includes('.') || rest.includes('--'))) {
      return { kind: 'git checkout (discards edits)', preview: ['git', 'diff', '--stat'], targets: [] }
    }
  }

  return undefined
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const risk = classify(e.command)
    if (risk === undefined) {
      return next(e)
    }

    let listing: string[] = []
    let note = ''
    try {
      if (risk.preview !== undefined) {
        const ran = await $.process.run(risk.preview, { timeoutMs: 10000 })
        listing = ran.stdout.split('\n').filter(Boolean)
      } else if (risk.targets.some(t => t.includes('$') || t.includes('`'))) {
        note = 'The paths use variables, so the file list cannot be shown here.'
      } else {
        // Unquoted $t expands globs but never runs substitutions in the text.
        const ran = await $.process.run(
          ['sh', '-c', 'for t; do find $t -type f 2>/dev/null; done', 'sh', ...risk.targets],
          { timeoutMs: 10000 },
        )
        listing = ran.stdout.split('\n').filter(Boolean)
      }
    } catch {
      note = 'The preview could not run.'
    }

    const shown = listing.slice(0, MAX_LISTED).map(f => `  ${f}`).join('\n')
    const more = listing.length > MAX_LISTED ? `\n  ... and ${listing.length - MAX_LISTED} more` : ''
    const question =
      `Blast radius: ${risk.kind}\n${e.command}\n\n` +
      (listing.length > 0 ? `${listing.length} file(s) affected:\n${shown}${more}` : note || 'No files found to list.')

    const answer = await $.ui.ask(question, { options: ['Cancel', 'Proceed'], header: 'Blast radius' })

    return answer === 'Proceed'
      ? next(e)
      : { deny: `blast-radius: the person cancelled "${risk.kind}". Nothing was changed.` }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'blast-radius: could not check this command, so it was held back.' },
  )
}
