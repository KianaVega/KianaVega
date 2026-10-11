export type Crab = {
  id: string
  label: string
  type: string
  model: string
  tokens: number
  cost: number
  isDone: boolean
}

export type Progress = { steps: number; created: number; done: number }

declare module 'claude-code' {
  interface PluginState {
    'savvy-progress': {
      progress: Progress
      crabs: Crab[]
    }
  }
}
