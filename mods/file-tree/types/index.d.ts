export type FileState = 'reading' | 'read' | 'editing' | 'changed' | 'committed'

declare module 'claude-code' {
  interface PluginState {
    'file-tree': { files: Record<string, FileState>; root: string }
  }
}
