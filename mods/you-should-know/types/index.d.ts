export type Flag = { text: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'you-should-know': { flag: Flag | null }
  }
}
