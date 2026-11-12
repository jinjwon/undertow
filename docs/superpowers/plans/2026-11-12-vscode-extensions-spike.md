# VS Code Extensions Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove or disprove, on a throwaway branch, that Evoke can run real Open VSX extensions (a language server, a linter, a theme, an icon theme) inside its own UI, the way Cursor does, before any production code changes.

**Architecture:** A second page (`spike.html`) in the same Electron app hosts Monaco from `@codingame/monaco-vscode-api` with VS Code's services. Extensions that need Node run in a VS Code server process (openvscode-server, MIT) that the main process starts on `127.0.0.1` with a connection token; the page talks to it as a remote extension host. Web-only extensions run in the worker extension host. Nothing in `App.tsx` changes; the spike's findings decide the production plan.

**Tech Stack:** Electron 45, Vite 6, `@codingame/monaco-vscode-api` and its service-override packages (version matching one VS Code release, 1.145 as of 2026-11-10), openvscode-server for the same VS Code version, Open VSX.

**Spec:** `docs/EVOKE_ARCHITECTURE_AUDIT.md` sections 4, 5 (Option C), 10 (Phase 0) and 11 (risks 1–4).

## Global Constraints

- Branch `spike/vscode-engine` from `main`. The branch is never merged. Its only lasting output is a findings section appended to `docs/EVOKE_ARCHITECTURE_AUDIT.md`, carried to `main` in its own small PR.
- Timebox: 3 working days. When a check cannot pass within it, record "not reached" with what blocked it; do not stretch.
- Extensions come from Open VSX only (`https://open-vsx.org`). Never download from the Visual Studio Marketplace (its terms limit offerings to Microsoft products; audit section 4.2).
- Every `@codingame/monaco-vscode-*` package is pinned to one exact version, the same for all of them. openvscode-server must be the build for the VS Code version that release targets.
- The server listens on `127.0.0.1` only, with a random connection token generated per start, and only for folders already allowed by `roots` in `main.cjs`.
- The renderer keeps `sandbox: true` and `contextIsolation: true`. If a check needs either turned off, that check fails; record it.
- Never quit `/Applications/Evoke.app`. QA with `--user-data-dir="$TMPDIR/evoke-spike"` and `--remote-debugging-port=9461`.
- Measurements (time to first edit, memory, bundle size) are taken on this Mac and written with the command used.

## Review Focus

1. The page loads under the app's CSP without `unsafe-eval`; any CSP change needed is written down exactly.
2. Killing the server process mid-session leaves the editor usable and the extension host comes back on its own or with one action.
3. Opening a second project does not need a page reload, or the reload cost is measured.
4. An extension with platform-specific binaries (rust-analyzer or clangd) gets the darwin-arm64 build.
5. Claude Code's IDE link (`ide.cjs`) still answers `getDiagnostics` with the language server's diagnostics.

---

## File Structure (spike branch only)

| File | Responsibility |
|---|---|
| `desktop/spike.html`, `desktop/src/spike/main.ts` | Second page: initialise VS Code services, open one file, list extensions |
| `desktop/vite.config.mjs` | Second input, VSIX plugin, CSS-as-string rule from the library's README |
| `desktop/spike-server.cjs` | Start and stop openvscode-server for one folder, with a token |
| `desktop/main.cjs` | `EVOKE_SPIKE=1` opens `spike.html` instead of `index.html` |
| `docs/EVOKE_ARCHITECTURE_AUDIT.md` | Findings table (the deliverable) |

---

### Task 1: Editor services in a second page

**Files:** Create `desktop/spike.html`, `desktop/src/spike/main.ts`. Modify `desktop/vite.config.mjs`, `desktop/main.cjs`, `desktop/package.json`.

- [ ] **Step 1:** Install, pinned to one version `V` (the latest release that targets one VS Code version; write `V` in the findings):
  `npm i -E @codingame/monaco-vscode-api@V vscode@npm:@codingame/monaco-vscode-extension-api@V monaco-editor@npm:@codingame/monaco-vscode-editor-api@V @codingame/monaco-vscode-extensions-service-override@V @codingame/monaco-vscode-textmate-service-override@V @codingame/monaco-vscode-theme-service-override@V @codingame/monaco-vscode-languages-service-override@V @codingame/monaco-vscode-files-service-override@V @codingame/monaco-vscode-remote-agent-service-override@V` and `npm i -DE @codingame/monaco-vscode-rollup-vsix-plugin@V`.
- [ ] **Step 2:** Add `spike.html` as a second Vite input, the `load-vscode-css-as-string` plugin and `vsixPlugin()` exactly as the library README shows. Keep `base: './'` and `tsconfigRaw`.
- [ ] **Step 3:** In `src/spike/main.ts`, call `initialize()` from `@codingame/monaco-vscode-api` with the textmate, theme, languages, files and extensions overrides, then create one editor on a file read through `window.evoke.read`.
- [ ] **Step 4:** In `main.cjs`, load `dist/spike.html` when `process.env.EVOKE_SPIKE === '1'`.
- [ ] **Step 5: Check A — loads in the sandboxed renderer.** Run `cd desktop && npx vite build && EVOKE_SPIKE=1 env -u ELECTRON_RUN_AS_NODE npx electron . --remote-debugging-port=9461 --user-data-dir="$TMPDIR/evoke-spike"`. Expected: editor shows a `.ts` file with TextMate colours; DevTools console has no CSP error. If a CSP change was needed, record the exact directive.
- [ ] **Step 6:** Record bundle size (`du -sh dist`) against main's `dist`, and time from window shown to editor ready (CDP `performance.now()` mark). Commit.

### Task 2: Node extensions through a local VS Code server

**Files:** Create `desktop/spike-server.cjs`. Modify `desktop/main.cjs`, `desktop/src/spike/main.ts`.

- [ ] **Step 1:** Download the openvscode-server release whose VS Code version matches `V` for darwin-arm64 into `$TMPDIR/evoke-spike/server` (from github.com/gitpod-io/openvscode-server releases). If no matching build exists, record the nearest one and its version gap, and try it.
- [ ] **Step 2:** `startServer(folder: string) → Promise<{ port: number; token: string; stop(): void }>` in `spike-server.cjs`: spawn `bin/openvscode-server --host 127.0.0.1 --port 0 --connection-token <random 32 hex> --without-browser-env-var`, read the chosen port from its output, refuse folders outside `roots`.
- [ ] **Step 3:** Pass `remoteAuthority` `127.0.0.1:<port>` and the token to the page through `preload.cjs` (one new `spike:server` invoke), and add the remote-agent override in `initialize()`.
- [ ] **Step 4: Check B — a Node extension runs.** Install from Open VSX into the server: `dbaeumer.vscode-eslint`, then open `desktop/src/App.tsx`. Expected: ESLint diagnostics appear as squiggles. Record the install path the server used and whether it chose Open VSX by default.
- [ ] **Step 5: Check C — a language server across files.** Install `rust-lang.rust-analyzer` (platform-specific build) or, if no Rust project is at hand, rely on the built-in TypeScript extension: go to definition from `App.tsx` into `layout.ts` (a different file). Expected: the jump lands in `layout.ts`. Record which extension proved it.
- [ ] **Step 6: Check D — kill and recover.** `kill -9` the server pid while a file is open. Expected: the editor stays usable; record whether the extension host reconnects after `startServer` runs again, and what the user sees meanwhile.
- [ ] **Step 7:** Commit.

### Task 3: Themes, icon themes and views inside Evoke's own layout

**Files:** Modify `desktop/src/spike/main.ts`, `desktop/spike.html`.

- [ ] **Step 1: Check E — colour and icon themes.** Install `PKief.material-icon-theme` and one colour theme from Open VSX. Expected: the theme applies to the editor; record whether the file icon theme can be read as data (an icon per file name) for Evoke's own tree, so Evoke's badges could come from it.
- [ ] **Step 2: Check F — a VS Code view in an Evoke panel.** Render the Extensions view and the Problems view into two plain `<div>`s that Evoke positions itself (no VS Code workbench grid). Expected: both render, are usable, and follow the div's size. Record the API used. This is the check that decides whether Evoke's own layout survives the engine change.
- [ ] **Step 3: Check G — Claude Code link.** Point `getDiagnostics` (the tool in `ide.cjs`, answered by `ideTools` in `App.tsx`) at the new editor's markers in the spike page with the same mapping. Expected: from a Claude Code session started in the spike window, asking for diagnostics returns the ESLint findings from Check B.
- [ ] **Step 4: Check H — a second project.** Open another trusted folder. Expected: either it works in the same page, or record the reload time and what state is lost.
- [ ] **Step 5:** Commit.

### Task 4: Findings and the decision

**Files:** Modify `docs/EVOKE_ARCHITECTURE_AUDIT.md` (on a branch from `main`, its own PR).

- [ ] **Step 1:** Append "Phase 0 results" with one row per check A–H: passed / failed / not reached, the evidence (command, screenshot path, measurement) and anything that needed a security setting changed.
- [ ] **Step 2:** Write the decision with its rule:
  - A, B, C, F pass → Option C stands. Next: production plan "Editor engine behind an interface" (audit Phase 1 items 1b, 1c, 1e) then "Extension host and Open VSX" (Phase 2 items 2a–2c).
  - B or C fails → Option C is dropped for Node extensions. Re-run the comparison for Theia and a Code - OSS fork with the measured gaps.
  - Only F fails → keep Option C, and plan Evoke-drawn versions of the views the user needs (extensions list, problems, SCM) instead of VS Code's.
- [ ] **Step 3:** Commit, open the PR with the findings, and list the open questions for the user (licence wording for "VS Code extensions", bundling a ~100 MB server per platform).

---

## After the spike (not in this plan)

The production work is planned only after Task 4, from its findings: the editor behind an interface so `App.tsx` stops importing Monaco directly, the server's lifecycle and workspace trust in `main.cjs`, an Extensions panel drawn in Evoke's style, settings and keybindings files the extensions can read, and Windows builds of the server.
