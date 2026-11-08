# Evoke Editor 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Evoke desktop app the one place to work: the editor features people install VS Code/Cursor extensions for, the Ghostty/Terminal setups' features moved in, and real installers (Windows shortcuts) built by CI.

**Architecture:** Electron main (`desktop/main.cjs`) keeps every machine access behind guarded IPC; pure, testable helpers live in `desktop/paths.cjs` (main) and `desktop/match.cjs` (shared). The React window (`desktop/src/App.tsx`) gains sidebar tabs (FILES / GIT / SKILL), right-panel tabs (CLAUDE / SHELL), a quick-open/search sheet, and a diff view, all reusing the existing `Cut`, `.sheet`, `.row` styles and both themes.

**Tech Stack:** Electron 45, React 18, Monaco 0.52 (`@monaco-editor/react`), xterm 5, node-pty 1.1, Vite 5, electron-builder 26, GitHub Actions. No new runtime dependencies.

**Spec:** this conversation (2026-11-08). Pain points from the user: needing extensions in Cursor/VS Code, and inconvenient UI. Extensions the user had installed: prettier, gitlens, auto-close-tag, auto-rename-tag, html-css, indent-rainbow, material-icon-theme, live server, pdf, claude-sessions, remote-ssh, containers. The user handed scope selection to Claude and said the terminal setups may be retired, with their design and features moved into the app.

## Global Constraints

- No new npm dependencies; Monaco's own workers and formatters replace prettier.
- File access only through `guard()` in `main.cjs` (real path inside an open project).
- Every new IPC input from the window is validated in main (strings, enums, ids by regex).
- Both themes (TIDE, REBEL) style every new surface through the existing CSS vars.
- Shortcuts use `⌘` on macOS and `Ctrl` on Windows (`MOD` in App.tsx; Monaco `CtrlCmd`).
- Out of scope (Claude's call): remote-ssh, containers, debugger, notebooks, extension system, live server/PDF preview, Ghostty water shader.
- Plugin `plugins/evoke` stays: it draws the MENU inside the Claude pane and feeds the usage HUD.

## Review Focus

- A huge repo (node_modules, 100k files): quick open and search must skip ignored dirs and stop at a cap, not freeze. Test: `walkSkip` skips `node_modules`, `.git`, `dist`, `release`; search caps results at 500.
- Binary or large files in search: skipped (NUL byte or > 1 MB). Test: `searchText` on text with `\0` returns `[]`.
- File names with spaces/Korean/renames in git status: `parseStatus` handles `-z` output, including `R` entries. Test with a rename and a Korean path.
- A file new since HEAD opened in diff: original side is empty, not an error. Test: `git:head` returns `''` on failure (main), covered in manual check.
- Session ids from disk passed to `claude --resume`: only UUIDs pass. Test: `isSessionId`.

---

### Task 1: Editor intelligence (replaces prettier, auto-close/rename-tag, html-css, indent-rainbow)

**Files:** Modify `desktop/src/main.tsx`, `desktop/src/App.tsx` (Editor options, ⌘S).

- [ ] Load Monaco's `ts.worker`, `json.worker`, `css.worker`, `html.worker` in `MonacoEnvironment.getWorker(_, label)`; remove the one-worker shortcut comment.
- [ ] Editor options: `bracketPairColorization.enabled`, `guides.bracketPairs`, `guides.indentation`, `linkedEditing`, `autoClosingTags` (default), `formatOnPaste`.
- [ ] ⌘S runs `editor.action.formatDocument` when a formatter exists for the language, then saves.
- [ ] Verify in the running app: `.ts` shows a type error squiggle; `.html` renames the closing tag with the opening one; ⌘S formats a messy `.json`.
- [ ] Commit.

### Task 2: Quick open (⌘P) and project search (⌘⇧F)

**Files:** Create `desktop/match.cjs`, `desktop/match.test.cjs`; modify `desktop/main.cjs`, `desktop/preload.cjs`, `desktop/src/App.tsx`, `desktop/src/style.css`, `desktop/package.json` (test script, `files`).

**Interfaces:**
- Produces (`match.cjs`): `walkSkip(name: string): boolean`; `fuzzy(query: string, path: string): number` (0 = no match, higher = better; consecutive and basename hits score more); `searchText(text: string, query: string, limit: number): {line: number, col: number, preview: string}[]` (case-insensitive, `[]` for text containing `\0`).
- Produces (IPC): `fs:files(root) -> string[]` (relative paths, cap 20000); `fs:search(root, query) -> {path, line, col, preview}[]` (cap 500, skip files > 1 MB).

- [ ] Tests in `match.test.cjs`: `walkSkip('node_modules') === true`, `walkSkip('src') === false`; `fuzzy('apx','src/App.tsx') > 0`, `fuzzy('zzz','src/App.tsx') === 0`, `fuzzy('app','src/App.tsx') > fuzzy('app','a/p/p.txt')`; `searchText('a\nfoo bar\nFOO', 'foo', 10)` gives lines 2 and 3 with col 1; `searchText('x\0foo','foo',10)` is `[]`; limit respected.
- [ ] Run `npm test`: fails (module missing). Implement. Run: passes.
- [ ] Main handlers use `guard(root)`, walk with `fs.readdir` iteratively, `walkSkip` on dir names.
- [ ] UI: one `.sheet` overlay with an input; mode `files` (⌘P, top 50 by `fuzzy`) or `search` (⌘⇧F, debounced 250 ms, grouped by file). Enter / click opens the file and reveals the line.
- [ ] Commit.

### Task 3: Git changes and diff (the gitlens core)

**Files:** Modify `desktop/match.cjs` (+ test), `desktop/main.cjs`, `desktop/preload.cjs`, `desktop/src/App.tsx`, `desktop/src/style.css`.

**Interfaces:**
- Produces: `parseStatus(z: string): {path: string, code: string}[]` for `git status --porcelain=v1 -z` (rename entries consume the extra NUL field; `code` is the two-letter XY trimmed).
- IPC: `git:status(root)`; `git:head(root, file) -> string` (`git show HEAD:<rel>` with forward slashes; `''` on failure).

- [ ] Tests: `parseStatus(' M a.ts\0?? 새 파일.md\0R  new.ts\0old.ts\0')` → `[{path:'a.ts',code:'M'},{path:'새 파일.md',code:'??'},{path:'new.ts',code:'R'}]`; `parseStatus('')` → `[]`.
- [ ] Fail, implement, pass.
- [ ] Sidebar tabs FILES / GIT (GIT shows count). Clicking a change opens a diff tab: Monaco `DiffEditor`, original = HEAD text, modified = disk text (read-only in diff; editing stays in the normal tab). Status refreshes on window focus and after save.
- [ ] Commit.

### Task 4: Shell terminal and Claude session resume (replaces claude-sessions)

**Files:** Modify `desktop/paths.cjs` (+ test), `desktop/main.cjs`, `desktop/preload.cjs`, `desktop/src/App.tsx`.

**Interfaces:**
- Produces (`paths.cjs`): `isSessionId(s: string): boolean` (UUID v4-ish `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`); `slugOf(path: string): string` (Claude Code's project folder name: every char not `[A-Za-z0-9]` becomes `-`).
- IPC: `pty:spawn(id, cwd, cols, rows, kind: 'claude'|'shell', resume?: string)`; `sessions:list(root) -> {id, title, mtime}[]` (newest 10, title = first user message text, 60 chars).

- [ ] Tests: `isSessionId` true for a real UUID, false for `--help` and `x; rm`; `slugOf('/Users/a/my proj')` === `-Users-a-my-proj`.
- [ ] Fail, implement, pass.
- [ ] Main: unknown `kind` throws; `resume` must pass `isSessionId` or is dropped; shell = `$SHELL -il` / `powershell.exe`.
- [ ] Right panel tabs CLAUDE / SHELL; terminal ids `claude:<root>`, `shell:<root>`. A SESSIONS button lists past sessions; picking one restarts the Claude terminal with `--resume <id>`.
- [ ] Commit.

### Task 5: The terminal's features, moved in; retire the terminal setups

**Files:** Modify `desktop/main.cjs`, `desktop/preload.cjs`, `desktop/src/App.tsx`, `desktop/src/style.css`; move `ghostty/background.png` → `desktop/src/background.png`; delete `ghostty/`, `terminal/`; update `README.md`, `README.ko.md`, `CHANGELOG.md`, `SECURITY.md` if it names them.

- [ ] IPC `skills:list() -> {name, uses}[]`: names from `~/.claude/skills/*/SKILL.md` dirs plus every key in the evoke store `uses`, sorted by uses desc; reuse `rank()` from `plugins/evoke/hooks/data`.
- [ ] Sidebar SKILL tab: rows `name · RANK n`; clicking types `/<name> ` into the Claude terminal.
- [ ] Usage toast: when any meter crosses 85%, show a slanted toast once per limit per reset.
- [ ] File icons: a colored extension badge in the tree (CSS only, per theme).
- [ ] Remove `ghostty/` and `terminal/`; README leads with the desktop app; plugin install stays.
- [ ] Verify both themes in the running app (CDP screenshots), commit.

### Task 6: Real installers from CI

**Files:** Create `.github/workflows/release.yml`; modify `desktop/package.json` (`build.nsis`, per-platform `files` excludes).

- [ ] `nsis`: `oneClick: false`, `allowToChangeInstallationDirectory: true`, `createDesktopShortcut: true`, `createStartMenuShortcut: true`, `shortcutName: "Evoke"`.
- [ ] Exclude other platforms' `node-pty/prebuilds/*` from each build.
- [ ] Workflow on tag `v*`: matrix `macos-latest` (`dist:mac`) and `windows-latest` (`dist:win`), `npm ci` in `desktop`, upload artifacts to the tag's GitHub release (`gh release upload --clobber`).
- [ ] Bump version 2.0.0, tag, push; watch the run; confirm `.dmg` and `Setup.exe` attached; write release notes; point v1.8.0 notes to 2.0.0.
- [ ] Commit.
