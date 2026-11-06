export type Last = { menu: string; tool: string }
export type Usage = { context: number | null; limits: { kind: string; percent: number }[]; usd: number | null }
export type Project = { name: string; path: string }

declare module 'claude-code' {
  interface PluginState {
    'undertow': {
      counts: Record<string, number>
      last: Last | null
      day: string
      usage: Usage | null
      projects: Project[]
      place: { cwd: string; branch: string }
    }
  }
}
