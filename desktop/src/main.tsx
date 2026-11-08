import { createRoot } from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import '@xterm/xterm/css/xterm.css'
import './style.css'
import { App } from './App'

// Monaco from the bundle, not a CDN: the app runs offline and under a strict CSP.
// shortcut: one generic worker, so no TypeScript/JSON language service; add their workers when IntelliSense matters.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
loader.config({ monaco })

createRoot(document.getElementById('root')!).render(<App />)
