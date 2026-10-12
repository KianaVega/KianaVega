export type Candidate = { feedback: string; context: string }

declare module 'claude-code' {
  interface PluginState {
    reflect: { candidate: Candidate | null; status: string }
  }
}
