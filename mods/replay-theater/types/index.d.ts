export type EditStep = { path: string; tool: string; before: string; after: string }

declare module 'claude-code' {
  interface PluginState {
    'replay-theater': { current: EditStep[]; last: EditStep[]; index: number }
  }
}
