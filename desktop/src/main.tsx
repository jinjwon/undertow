import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './style.css'
import { App } from './App'
import { langFrom, tr } from './i18n'
import { prefs, toMigrate } from './prefs'


// A render error must leave a way back, not a blank window. Retry remounts rather than reloads: the window refuses navigation.
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    const lang = langFrom(navigator.language)
    return (
      <div className="state-error" role="alert">
        <h1>{tr(lang, 'error.title')}</h1>
        <pre>{this.state.error.message}</pre>
        <button onClick={() => this.setState({ error: null })}>{tr(lang, 'error.retry')}</button>
      </div>
    )
  }
}

// Settings move from localStorage to the main process's files once; localStorage stays as it was.
for (const [key, value] of toMigrate(window.evoke.store.snapshot, key => localStorage.getItem(key))) prefs.setItem(key, value)

createRoot(document.getElementById('root')!).render(<Boundary><App /></Boundary>)
