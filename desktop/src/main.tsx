import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import '@xterm/xterm/css/xterm.css'
import './style.css'
import { App } from './App'
import { langFrom, tr } from './i18n'

// Monaco from the bundle, not a CDN: the app runs offline and under a strict CSP.
// Language workers give completion, errors and formatting for TS/JS, JSON, CSS and HTML without extensions.
const WORKERS: Record<string, new () => Worker> = { json: JsonWorker, css: CssWorker, scss: CssWorker, less: CssWorker, html: HtmlWorker, handlebars: HtmlWorker, typescript: TsWorker, javascript: TsWorker }
self.MonacoEnvironment = { getWorker: (_: string, label: string) => new (WORKERS[label] ?? EditorWorker)() }
// Files open one at a time, so imports cannot resolve: hide only those errors, keep the rest.
const ts = monaco.languages.typescript
for (const d of [ts.typescriptDefaults, ts.javascriptDefaults]) {
  d.setCompilerOptions({ target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, allowJs: true, allowNonTsExtensions: true, esModuleInterop: true })
  d.setDiagnosticsOptions({ diagnosticCodesToIgnore: [2307, 2792, 7016, 2875] })
}
loader.config({ monaco })

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

createRoot(document.getElementById('root')!).render(<Boundary><App /></Boundary>)
