export type Warning = string | null

declare module 'claude-code' {
  interface PluginState {
    'cache-tax': { warning: Warning }
  }
}
