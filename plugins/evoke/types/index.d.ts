export type Last = { menu: string; tool: string }
export type Usage = { context: number | null; limits: { kind: string; percent: number; resetsAt?: string }[]; usd: number | null }
export type Project = { name: string; path: string }
export type Skill = { name: string; description: string; plugin: string }

declare module 'claude-code' {
  interface PluginState {
    'evoke': {
      counts: Record<string, number>
      last: Last | null
      day: string
      usage: Usage | null
      projects: Project[]
      place: { cwd: string; branch: string; art?: boolean }
      page: number
      skills: Skill[]
      uses: Record<string, number>
      log: Record<string, string[]>
    }
  }
}
