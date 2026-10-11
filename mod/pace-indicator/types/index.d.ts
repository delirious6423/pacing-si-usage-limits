export type Reading = { pct: number; reset: string }
export type Rate = { h5: Reading | null; wk: Reading | null }

declare module 'claude-code' {
  interface PluginState {
    'pace-indicator': { rate: Rate | null; isHidden: boolean }
  }
}
