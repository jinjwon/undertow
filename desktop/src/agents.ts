// Which coding agents the window offers: Claude Code, Codex, or both. One stored value, read through these three.
export type Agent = 'claude' | 'codex'
export type Agents = 'both' | 'claude' | 'codex'

export const agentsOf = (mode: Agents): Agent[] => (mode === 'both' ? ['claude', 'codex'] : [mode])
export const parseAgents = (raw: unknown): Agents => (raw === 'claude' || raw === 'codex' ? raw : 'both')
// Where a skill or a selection goes: the agent on screen if it is one and is enabled, else the first enabled one.
export const targetOf = (mode: Agents, pane: string): Agent => agentsOf(mode).find(a => a === pane) ?? agentsOf(mode)[0]
