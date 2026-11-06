export type Source = 'spotify' | 'music' | 'youtube'
export type Track = { isPlaying: boolean; title: string; artist: string; album: string; position: number; duration: number; volume: number; art: string }

declare module 'claude-code' {
  interface PluginState {
    'undertow-player': { track: Track | null; didStart: boolean; note: string; cover: string; isChanging: boolean; source: Source; pick: string }
  }
}
