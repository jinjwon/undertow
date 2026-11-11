// The window's settings, read from the snapshot the main process hands over at start and written back through it.
// Same shape as localStorage, so every caller keeps its own parsing.
type Snapshot = { keys: string[]; values: Record<string, string> }

const store = () => (window as any).evoke.store as { snapshot: Snapshot; set: (key: string, value: string) => void }
// contextBridge hands the snapshot over frozen, so the page keeps its own copy to write into.
let values: Record<string, string> | undefined
const own = () => (values ??= { ...store().snapshot.values })

export const prefs = {
  getItem: (key: string): string | null => own()[key] ?? null,
  setItem: (key: string, value: string) => {
    own()[key] = value
    store().set(key, value)
  },
}

// What 2.4.0 left in localStorage and the store does not have yet. localStorage is never cleared, so an older build still finds it.
export const toMigrate = (snapshot: Snapshot, local: (key: string) => string | null): [string, string][] =>
  snapshot.keys.flatMap((key): [string, string][] => {
    if (snapshot.values[key] !== undefined) return []
    try {
      const value = local(key)
      return value === null ? [] : [[key, value]]
    } catch { return [] }
  })
