# Evoke (undertow)

Two things ship from this repo:

- `desktop/`: the Evoke desktop app (Electron + React + Vite). One window: file tree, Monaco editor, and terminals running Claude Code, Codex, a shell or ssh.
- `plugins/evoke/`: a Claude Code plugin (mod) that draws the MENU pane, HUD and skill book inside the terminal. The desktop app imports its `hooks/tokens.js` and `hooks/data.ts`.

Design rules live in [DESIGN.md](DESIGN.md). Read it before changing colours, layout or the pane.

## Commands

Run from `desktop/` unless noted.

| What | Command |
|---|---|
| Desktop tests | `npm test` |
| Dependency audit (CI fails on high) | `npm audit --audit-level=high` |
| Build the page | `npm run build` |
| Run from source | `npm start` |
| Package for macOS | `npm run dist:mac` |
| Plugin tests (from repo root) | `claude plugin test plugins/evoke` |

CI (`.github/workflows/ci.yml`) runs test, audit and build on every PR. There is no `tsc` in the project: types are only checked by the editor.

## Things that bite

- **Source changes do not reach the installed app.** `/Applications/Evoke.app` is a packaged build. To update it: `npx vite build && npx electron-builder --mac dir`, copy `release/mac-arm64/Evoke.app` out with `ditto --norsrc --noextattr`, `codesign --force --deep --sign -`, move the old app away, then `ditto` the signed copy in. The user restarts the app themselves.
- **Never quit the installed Evoke.** The user's Claude session may be running inside it. QA with a separate instance: `env -u ELECTRON_RUN_AS_NODE npx electron . --remote-debugging-port=9461 --user-data-dir=<scratch dir>`, and kill only that profile's processes. Port 9333 is the user's own Chrome.
- **The installed plugin is a copy.** Claude Code runs `~/.claude/plugins/cache/evoke/evoke/<version>`, installed from GitHub. Edits in `plugins/evoke/` show up only after they are merged and the plugin is updated.
- **A plugin render hook is pure.** Inside `ui.render`, read state and return a tree. Writing state there makes the engine skip the hook. Write from events (`session.start`, `session.measure`, `command.run`, `onPress`).
- **The pane can be drawn without `session.start` having run** (a resumed session, a failed start). Anything the pane needs must have a safe fallback at draw time, not only a default set at start.
- **xterm.js draws no images.** `main.cjs` removes `TERM_PROGRAM` from the terminal's environment so the plugin falls back to plain rows. Keep that.
- **The plugin's `tsconfig.json` extends a gitignored file.** `vite.config.mjs` passes `tsconfigRaw` so the build works on a clean checkout. Do not remove it.
- **Finder/iCloud makes ` 2` duplicates** (`layout 2.ts`, even inside `.git`). Do not commit them.
- **Three languages.** Every UI string goes in `desktop/src/i18n.ts` in English, Korean and Japanese. A test fails if a key is missing in one.

## Working agreements

- Work on a feature branch and open a PR. Merge only when asked.
- Commit messages and code comments are in English. Chat replies to the user are in Korean.
- Layout rules are plain functions in `desktop/src/layout.ts` with tests in `layout.test.ts`. Add geometry there, not in components.
- New shortcuts go in the one `keydown` handler in `App.tsx`, the list in the settings "Shortcuts" tab, and `key.*` strings in `i18n.ts`.
