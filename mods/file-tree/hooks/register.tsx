import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { FileState } from '../types'

const PANE = 'file-tree'
const files = atom({ plugin: 'file-tree', key: 'files' } as const, {} as Record<string, FileState>)
const root = atom({ plugin: 'file-tree', key: 'root' } as const, '')

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

const COLORS: Record<FileState, string> = {
  reading: 'suggestion',
  read: 'inactive',
  editing: 'warning',
  changed: 'claude',
  committed: 'success',
}

const pathOf = (e: unknown): string | undefined => {
  const i = e as { file_path?: unknown; notebook_path?: unknown }
  const p = i.file_path ?? i.notebook_path

  return typeof p === 'string' ? p : undefined
}

const mark =
  (path: string, state: FileState) =>
  (list: Record<string, FileState>): Record<string, FileState> => ({ ...list, [path]: state })

type Node = { children: Map<string, Node>; path?: string }

const build = (paths: string[], base: string): Node => {
  const top: Node = { children: new Map() }
  for (const full of paths) {
    const rel = base !== '' && full.startsWith(base + '/') ? full.slice(base.length + 1) : full
    let node = top
    for (const part of rel.split('/').filter(Boolean)) {
      if (!node.children.has(part)) node.children.set(part, { children: new Map() })
      node = node.children.get(part)!
    }
    node.path = full
  }

  return top
}

const flatten = (node: Node, depth: number, out: Array<{ name: string; depth: number; path?: string }>) => {
  const names = [...node.children.keys()].sort()
  for (const name of names) {
    const child = node.children.get(name)!
    out.push({ name, depth, path: child.path })
    flatten(child, depth + 1, out)
  }

  return out
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, root, () => '')
    const cwd = await $.session.cwd()
    await update($, root, () => cwd)
    await $.command.register({ name: 'file-tree', description: 'Open the file tree pane' })
    void $.ui.open({ id: PANE, title: 'Files' })

    return next(e)
  })

  on('command.run', { command: 'file-tree' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Files' })

    return { text: 'File tree opened.' }
  })

  // Watch: shimmer while a file is being touched, then settle.
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const path = pathOf(e)

    if (path !== undefined && (tool === 'Read' || EDIT_TOOLS.has(tool))) {
      const isEdit = EDIT_TOOLS.has(tool)
      await update($, files, mark(path, isEdit ? 'editing' : 'reading'))
      const ran = await next(e)
      const hasFailed = ran.deny !== undefined || ran.isError === true
      await update($, files, (list): Record<string, FileState> => {
        const was = list[path]
        const settled: FileState = hasFailed ? 'read' : isEdit || was === 'changed' ? 'changed' : 'read'

        return hasFailed && was === undefined ? list : { ...list, [path]: settled }
      })

      return ran
    }

    if (tool === 'Bash' && /\bgit\s+commit\b/.test((e as { command?: string }).command ?? '')) {
      const ran = await next(e)
      if (ran.deny === undefined && ran.isError !== true) {
        await update($, files, list =>
          Object.fromEntries(
            Object.entries(list).map(([p, s]) => [p, s === 'changed' ? 'committed' : s]),
          ) as Record<string, FileState>,
        )
      }

      return ran
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, files)
    const base = await read($, root)
    const rows = flatten(build(Object.keys(list), base), 0, [])
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 4)

    return (
      <Box flexDirection="column">
        {rows.length === 0 && <Text dimColor>No files touched yet.</Text>}
        {rows.slice(0, room).map(r => {
          const state = r.path === undefined ? undefined : list[r.path]

          return (
            <Text
              color={state === undefined ? undefined : COLORS[state]}
              bold={state === 'editing' || state === 'reading'}
              dimColor={state === undefined}
            >
              {'  '.repeat(r.depth)}
              {state === undefined ? r.name + '/' : r.name}
              {state === 'committed' ? '  committed' : ''}
            </Text>
          )
        })}
        {rows.length > room && <Text dimColor>+{rows.length - room} more</Text>}
      </Box>
    )
  })
}
