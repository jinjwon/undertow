# Evoke Layout Docks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move settings out of `localStorage` into files the main process owns, then let the agent panel split into two groups whose tools (Claude, Chat, Codex, Shell, SSH) can be dragged, reordered, hidden and saved in layouts and built-in presets, so two agents can run side by side.

**Architecture:** A small JSON store in the main process (`store.cjs`) replaces `localStorage`; the renderer reads one synchronous snapshot at start and writes through IPC, keeping every existing parse function. The agent panel's arrangement is a pure model (`docks.ts`) stored inside the existing `Layout`; the right section becomes a CSS grid so terminals never remount when a tool changes group. The rect-based layout editor (`layout.ts`, `LayoutEdit.tsx`) is extended, not replaced.

**Tech Stack:** Electron 45, React 18, Vite 6, xterm.js 5, `node --test` (Node 24 type stripping). No new dependencies.

**Spec:** `docs/EVOKE_ARCHITECTURE_AUDIT.md` (sections 6 "저장소 분리", 8, 9.2 and appendix A items 2 and 5) and `DESIGN.md`.

## Global Constraints

- Branch `feat/layout-docks` from `main`; open a PR; merge only when asked.
- No new npm dependencies. Tests run with `npm test` from `desktop/` (`node --test`); add every new test file to the `test` script in `desktop/package.json`.
- A `.ts` file imported by another `.ts` file that a test loads must import it with the `.ts` extension (`import … from './docks.ts'`), because `node --test` does not resolve extensionless paths. Vite accepts the extension.
- Every new main-process `.cjs` file goes into `build.files` in `desktop/package.json`, or the packaged app fails to start.
- Every UI string goes in `desktop/src/i18n.ts` in `en`, `ko` and `ja`; the existing test fails on a missing key.
- Colours only through the theme variables (`--sel`, `--edge`, `--chip`, `--hi`, `--line`, …) outside a theme block. REBEL has one red (`--blood`). Border radius 0. Motion 80–260ms, on entry or pick only, off under `[data-motion='reduce']` and `prefers-reduced-motion`.
- TIDE borrows the Persona 3 Reload menu's design language and REBEL the Persona 5 menu's, as `DESIGN.md` "References" records: shapes, slants, hard offset shadows, cut-letter chips. No logo, character, screen or asset from either game is copied.
- Code comments and commit messages in English.
- Never quit the installed `/Applications/Evoke.app`. QA with a separate instance: `cd desktop && npx vite build && env -u ELECTRON_RUN_AS_NODE npx electron . --remote-debugging-port=9461 --user-data-dir="$TMPDIR/evoke-qa"`; stop it with `pkill -f "user-data-dir=$TMPDIR/evoke-qa"`. Port 9333 is the user's Chrome.
- Do not commit Finder duplicates (`* 2.ts`, `* 2.tsx`).

## Review Focus

1. Someone upgrading from 2.4.0 opens the new build: theme, language, agents, terminal size, motion, layout, divider widths and saved presets are all as they left them. (Task 1, `toMigrate` test)
2. A layout or preset saved by 2.4.0 has no `docks` field: it loads with the default dock and nothing else changes. (Task 3, `parseLayout` test)
3. Agents set to "Codex only" while group 2 holds only Claude and Chat: group 2 has nothing to show, so it disappears and group 1 takes the whole panel instead of leaving an empty half. (Task 2, `dockGrid` test)
4. A store file that is empty, truncated or hand-edited: the app starts with defaults for that file only. (Task 1, store test)
5. A shell with 500 lines of output is dragged to the other group: the same session and scrollback are there, not a fresh shell. (Task 4, QA step)

---

## File Structure

| File | Responsibility |
|---|---|
| `desktop/store.cjs` (new) | Which key lives in which file; load, validate, atomic write |
| `desktop/store.test.cjs` (new) | Store tests |
| `desktop/main.cjs` | Create the store before the window; `store:load`, `store:set` |
| `desktop/preload.cjs` | `evoke.store` |
| `desktop/src/prefs.ts` (new) | `prefs.getItem/setItem` over the snapshot; `toMigrate` |
| `desktop/src/prefs.test.ts` (new) | Migration test |
| `desktop/src/docks.ts` (new) | Dock model: groups, tools, ratio, grid, drop side |
| `desktop/src/docks.test.ts` (new) | Dock tests |
| `desktop/src/layout.ts` | `Layout.docks`, `PRESETS` |
| `desktop/src/Dock.tsx` (new) | One group's head: chips, drag, tools |
| `desktop/src/App.tsx` | Right section as a grid, per-group active tool |
| `desktop/src/LayoutEdit.tsx` | Agent panel controls, built-in presets |
| `desktop/src/style.css` | Grid, drag and drop states in TIDE and REBEL |
| `desktop/src/i18n.ts` | New strings |
| `DESIGN.md` | Agent panel section |

---

### Task 1: Settings store in the main process

**Files:**
- Create: `desktop/store.cjs`, `desktop/store.test.cjs`, `desktop/src/prefs.ts`, `desktop/src/prefs.test.ts`
- Modify: `desktop/main.cjs` (require at top; IPC near the other handlers; `app.whenReady` at line 352), `desktop/preload.cjs`, `desktop/src/main.tsx`, `desktop/src/App.tsx` (lines 39–61, 109–126, 189, 297, 301, 469), `desktop/src/LayoutEdit.tsx:9-14`, `desktop/package.json` (`test`, `build.files`)

**Interfaces:**
- Produces (main): `createStore(dir: string) → { load(): Promise<void>; snapshot(): { keys: string[]; values: Record<string, string> }; set(key: string, value: string): Promise<void> }` and `KEYS: Record<string, 'settings' | 'layout' | 'theme'>` from `store.cjs`.
- Produces (renderer): `prefs.getItem(key: string): string | null`, `prefs.setItem(key: string, value: string): void`, `toMigrate(snapshot: { keys: string[]; values: Record<string, string> }, local: (key: string) => string | null): [string, string][]` from `src/prefs.ts`.
- `KEYS` is exactly: `lang, agents, terminal, motion → 'settings'`; `layout, split, layoutPresets → 'layout'`; `theme → 'theme'`.
- File format: `<dir>/<name>.json` = `{ "version": 1, "values": { "<key>": "<string>" } }`. Values are the same strings `localStorage` held, so every existing parser stays.

- [ ] **Step 1: Write the failing store tests** in `desktop/store.test.cjs` (use `fs.mkdtemp(path.join(os.tmpdir(), 'evoke-store-'))` per test)

```js
test('a value survives a reload and lands in its own file', async () => {
  const s = createStore(dir); await s.load()
  await s.set('theme', 'rebel'); await s.set('layout', '{"main":null}')
  const again = createStore(dir); await again.load()
  assert.deepStrictEqual(again.snapshot().values, { theme: 'rebel', layout: '{"main":null}' })
  assert.deepStrictEqual(JSON.parse(await fs.readFile(path.join(dir, 'theme.json'), 'utf8')), { version: 1, values: { theme: 'rebel' } })
})
test('unknown keys, non-strings and values over 1e6 characters are refused', async () => {
  const s = createStore(dir); await s.load()
  await assert.rejects(s.set('token', 'x')); await assert.rejects(s.set('theme', 3)); await assert.rejects(s.set('layout', 'x'.repeat(1e6 + 1)))
})
test('a broken file loads as empty and leaves the other files alone', async () => {
  await fs.writeFile(path.join(dir, 'layout.json'), '{"version":1,"values":')
  await fs.writeFile(path.join(dir, 'theme.json'), JSON.stringify({ version: 1, values: { theme: 'rebel', bogus: 'x', lang: 'ko' } }))
  const s = createStore(dir); await s.load()
  assert.deepStrictEqual(s.snapshot().values, { theme: 'rebel' }) // keys are read only from the file they belong to
})
test('writes leave no temporary file behind and keep the last of two quick writes', async () => {
  const s = createStore(dir); await s.load()
  await Promise.all([s.set('lang', 'en'), s.set('lang', 'ja')])
  assert.deepStrictEqual(await fs.readdir(dir), ['settings.json'])
  const again = createStore(dir); await again.load()
  assert.strictEqual(again.snapshot().values.lang, 'ja')
})
test('snapshot lists every key', async () => {
  const s = createStore(dir); await s.load()
  assert.deepStrictEqual(s.snapshot().keys.sort(), ['agents', 'lang', 'layout', 'layoutPresets', 'motion', 'split', 'terminal', 'theme'])
})
```

- [ ] **Step 2: Write the failing migration test** in `desktop/src/prefs.test.ts`

```ts
test('toMigrate copies only keys the store lacks and localStorage has', () => {
  const local = (k: string) => ({ theme: 'rebel', lang: 'ko', split: '{"pane":300}' } as Record<string, string>)[k] ?? null
  assert.deepStrictEqual(toMigrate({ keys: ['theme', 'lang', 'split', 'motion'], values: { lang: 'en' } }, local), [['theme', 'rebel'], ['split', '{"pane":300}']])
})
test('toMigrate survives a localStorage that throws', () => {
  assert.deepStrictEqual(toMigrate({ keys: ['theme'], values: {} }, () => { throw new Error('blocked') }), [])
})
```

- [ ] **Step 3: Add both files to the `test` script and run**

Run: `cd desktop && npm test`
Expected: FAIL, `Cannot find module './store.cjs'` and `./prefs.ts`.

- [ ] **Step 4: Implement `store.cjs`**

`load` reads each of the three files; a file that fails to parse, or whose `values` is not an object, counts as empty; only keys whose `KEYS[key]` names that file and whose value is a string are kept. `set` validates (known key, string, `length <= 1e6`), updates memory, then writes the whole file as `<name>.json.tmp` and renames it. Writes to one file are chained on one promise per file so they finish in call order. `fs.mkdir(dir, { recursive: true })` before the first write.

- [ ] **Step 5: Implement `src/prefs.ts`**

`getItem` reads `window.evoke.store.snapshot.values[key] ?? null`; `setItem` updates that object and calls `window.evoke.store.set(key, value)`. Access `window` inside the functions only, so the test can import the file. `toMigrate` wraps each `local(key)` call in try/catch.

- [ ] **Step 6: Wire main and preload**

`main.cjs`: `const store = createStore(path.join(app.getPath('userData'), 'store'))`; in `whenReady`, `await store.load()` before `new BrowserWindow`. `ipcMain.on('store:load', e => { e.returnValue = store.snapshot() })` and `ipcMain.on('store:set', (_, key, value) => { store.set(key, value).catch(() => {}) })`.
`preload.cjs`: `store: { snapshot: ipcRenderer.sendSync('store:load'), set: (key, value) => ipcRenderer.send('store:set', key, value) }`.
`package.json`: add `"store.cjs"` to `build.files`.

- [ ] **Step 7: Switch the renderer**

Replace every `localStorage.getItem` / `localStorage.setItem` in `App.tsx` and `LayoutEdit.tsx` with `prefs.getItem` / `prefs.setItem` (keep the surrounding try/catch). In `main.tsx`, before `createRoot`: `for (const [k, v] of toMigrate(window.evoke.store.snapshot, k => localStorage.getItem(k))) prefs.setItem(k, v)`. `localStorage` is never cleared, so downgrading still works.

- [ ] **Step 8: Run tests**

Run: `cd desktop && npm test && npm run build`
Expected: all pass (61 old + 7 new), build succeeds.

- [ ] **Step 9: QA the upgrade path**

Start the installed-version-compatible profile: run the QA instance once on `main` (before this task), switch theme to REBEL, language to 日本語, drag the left divider, save one layout preset named `old`, stop it. Check out this branch, build, start the QA instance with the same `--user-data-dir`.
Expected: REBEL, Japanese, the divider where it was, preset `old` listed in UI edit mode; `$TMPDIR/evoke-qa/store/` holds `settings.json`, `layout.json`, `theme.json`.

- [ ] **Step 10: Commit**

```bash
git add desktop/store.cjs desktop/store.test.cjs desktop/src/prefs.ts desktop/src/prefs.test.ts desktop/main.cjs desktop/preload.cjs desktop/src/main.tsx desktop/src/App.tsx desktop/src/LayoutEdit.tsx desktop/package.json
git commit -m "Keep settings in files the main process owns, copied once from localStorage"
```

---

### Task 2: Dock model

**Files:**
- Create: `desktop/src/docks.ts`, `desktop/src/docks.test.ts`
- Modify: `desktop/package.json` (`test`)

**Interfaces:**
- Produces:
  - `type ToolId = 'claude' | 'chat' | 'codex' | 'shell' | 'ssh'`, `TOOL_IDS: ToolId[]` in that order
  - `type Docks = { groups: ToolId[][]; dir: 'row' | 'col'; ratio: number; hidden: ToolId[] }`
  - `DOCKS: Docks = { groups: [TOOL_IDS], dir: 'row', ratio: 0.5, hidden: [] }`
  - `parseDocks(raw: unknown): Docks`
  - `moveTool(d: Docks, tool: ToolId, group: number, index: number): Docks`
  - `splitDocks(d: Docks, tool: ToolId, dir: 'row' | 'col'): Docks`
  - `groupOf(d: Docks, tool: ToolId): number`
  - `pickActive(d: Docks, active: (ToolId | null)[], visible: ToolId[]): (ToolId | null)[]`
  - `dockGrid(d: Docks, shown: number[]): { columns: string; rows: string; areas: string }`
  - `dropSide(x: number, y: number, w: number, h: number): 'row' | 'col' | null`
- Rules: at most 2 groups (`// shortcut: two groups cover side-by-side agents; a tree when someone needs three`). Every tool appears exactly once across groups. `ratio` is group 0's share, clamped to `[0.2, 0.8]`.

- [ ] **Step 1: Write the failing tests** in `desktop/src/docks.test.ts`

```ts
test('parseDocks repairs whatever storage holds', () => {
  assert.deepStrictEqual(parseDocks(null), DOCKS)
  assert.deepStrictEqual(parseDocks({ groups: [['shell', 'shell', 'nope'], [], ['claude']], dir: 'diag', ratio: 0.95, hidden: ['codex', 'x'] }),
    { groups: [['shell', 'chat', 'codex', 'ssh'], ['claude']], dir: 'row', ratio: 0.8, hidden: ['codex'] })
})
test('moveTool reorders inside a group, opens a second one, and closes an emptied one', () => {
  const two = moveTool(DOCKS, 'shell', 1, 0)
  assert.deepStrictEqual(two.groups, [['claude', 'chat', 'codex', 'ssh'], ['shell']])
  assert.deepStrictEqual(moveTool(two, 'ssh', 0, 0).groups[0], ['ssh', 'claude', 'chat', 'codex'])
  assert.deepStrictEqual(moveTool(two, 'shell', 0, 9).groups, [['claude', 'chat', 'codex', 'ssh', 'shell']])
  assert.deepStrictEqual(moveTool(two, 'claude', 2, 0), two) // no third group
})
test('splitDocks puts the tool in group 2 with the direction asked', () => {
  const d = splitDocks(DOCKS, 'codex', 'col')
  assert.deepStrictEqual([d.groups, d.dir], [[['claude', 'chat', 'shell', 'ssh'], ['codex']], 'col'])
  assert.strictEqual(groupOf(d, 'codex'), 1)
})
test('pickActive keeps a visible choice and falls back to the first visible tool, or null', () => {
  const d = splitDocks(DOCKS, 'shell', 'row')
  assert.deepStrictEqual(pickActive(d, ['chat', null], ['claude', 'chat', 'shell']), ['chat', 'shell'])
  assert.deepStrictEqual(pickActive(d, ['codex', 'shell'], ['claude', 'shell']), ['claude', 'shell'])
  assert.deepStrictEqual(pickActive({ ...d, hidden: ['shell'] }, [null, 'shell'], ['claude', 'shell']), ['claude', null])
})
test('dockGrid lays out one group, two side by side, or two stacked', () => {
  const d = { ...splitDocks(DOCKS, 'shell', 'row'), ratio: 0.6 }
  assert.deepStrictEqual(dockGrid(d, [0]), { columns: '1fr', rows: 'auto 1fr', areas: '"h0" "b0"' })
  assert.deepStrictEqual(dockGrid(d, [1]), { columns: '1fr', rows: 'auto 1fr', areas: '"h1" "b1"' })
  assert.deepStrictEqual(dockGrid(d, [0, 1]), { columns: '0.6fr 6px 0.4fr', rows: 'auto 1fr', areas: '"h0 split h1" "b0 split b1"' })
  assert.deepStrictEqual(dockGrid({ ...d, dir: 'col' }, [0, 1]), { columns: '1fr', rows: 'auto 0.6fr 6px auto 0.4fr', areas: '"h0" "b0" "split" "h1" "b1"' })
})
test('dropSide splits on the right or bottom 30%, else drops into the group', () => {
  assert.strictEqual(dropSide(380, 100, 400, 600), 'row')
  assert.strictEqual(dropSide(100, 580, 400, 600), 'col')
  assert.strictEqual(dropSide(395, 590, 400, 600), 'row') // corner: the nearer edge, by share of its side
  assert.strictEqual(dropSide(200, 300, 400, 600), null)
})
```

- [ ] **Step 2: Run to see it fail**

Run: `cd desktop && npm test`
Expected: FAIL, `Cannot find module './docks.ts'`.

- [ ] **Step 3: Implement `docks.ts`** with the signatures above. `moveTool` removes the tool, inserts at `min(index, length)`, drops empty groups, and returns `d` unchanged when `group > groups.length` or `group >= 2`. Every function returns a fresh object and runs its result through `parseDocks`.

- [ ] **Step 4: Run tests**

Run: `cd desktop && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/docks.ts desktop/src/docks.test.ts desktop/package.json
git commit -m "Add the agent dock model: two groups of tools, their order and split"
```

---

### Task 3: Docks in the layout, and built-in presets

**Files:**
- Modify: `desktop/src/layout.ts` (types at 3–15, `parseLayout` at 194–201), `desktop/src/layout.test.ts`

**Interfaces:**
- Consumes: `Docks`, `DOCKS`, `parseDocks` from `./docks.ts`.
- Produces: `Layout = { main: Record<MainId, Rect> | null; floats: Partial<Record<FloatId, Rect>>; docks: Docks }`; `EMPTY.docks = DOCKS`; `parseLayout` fills `docks: parseDocks(v?.docks)`; `PRESETS: Record<'default' | 'vibe' | 'review', Layout>`.
- Preset values, exactly:
  - `default`: `EMPTY`
  - `vibe`: main `pane {x:0, y:0, w:0.19, h:1}`, `center {x:0.19, y:0, w:0.31, h:1}`, `right {x:0.5, y:0, w:0.5, h:1}`; docks `{ groups: [['claude', 'chat', 'ssh'], ['codex', 'shell']], dir: 'col', ratio: 0.6, hidden: [] }`
  - `review`: main `pane {x:0, y:0, w:0.2, h:1}`, `center {x:0.2, y:0, w:0.55, h:1}`, `right {x:0.75, y:0, w:0.25, h:1}`; docks `DOCKS`

- [ ] **Step 1: Write the failing tests** in `layout.test.ts`

```ts
test('a layout saved before docks existed loads with the default dock', () => {
  const old = { main: null, floats: { clock: { x: 0.8, y: 0, w: 0.15, h: 0.08 } } }
  assert.deepStrictEqual(parseLayout(old), { ...old, docks: DOCKS })
})
test('docks round-trip through parseLayout', () => {
  assert.deepStrictEqual(parseLayout(JSON.parse(JSON.stringify(PRESETS.vibe))), PRESETS.vibe)
})
test('built-in presets tile without overlap and keep every panel inside its limits at 1440x800', () => {
  for (const p of Object.values(PRESETS)) {
    if (!p.main) continue
    const px = (id: MainId) => toPx(p.main![id], ws)
    for (const id of MAIN_IDS) assert.deepStrictEqual(clampRect(px(id), id, ws), px(id), id)
    assert.ok(!overlaps(px('pane'), px('center')) && !overlaps(px('center'), px('right')))
  }
})
```

- [ ] **Step 2: Run to see it fail**

Run: `cd desktop && npm test`
Expected: FAIL, `PRESETS` is not exported / `docks` missing.

- [ ] **Step 3: Implement** the types, `EMPTY`, `parseLayout` and `PRESETS` in `layout.ts`. Callers in `LayoutEdit.tsx` that build a `Layout` (`onChange({ ...value, … })`) already spread `value`, so `docks` is carried; check `onChange(EMPTY)` still resets the dock too (intended).

- [ ] **Step 4: Run tests**

Run: `cd desktop && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/layout.ts desktop/src/layout.test.ts
git commit -m "Store the agent dock in the layout and add three built-in presets"
```

---

### Task 4: The agent panel as two groups

**Files:**
- Create: `desktop/src/Dock.tsx`
- Modify: `desktop/src/App.tsx` (state at 139–159, `connect` 143–148, `pickAgents` 182–190, `say` 191–196, ⌘L at 567–574, right section 733–751), `desktop/src/style.css` (`.right` at 116), `desktop/src/i18n.ts`

**Interfaces:**
- Consumes: Task 2 functions; `Layout.docks` from Task 3; `prefs.setItem` from Task 1.
- Produces: `DockHead({ group, tools, active, focused, onPick, onDrop, onDragState, T, children })` in `Dock.tsx`, where `tools: ToolId[]` are the group's visible tools in order, `onPick(tool)`, `onDrop(tool: ToolId, index: number)`, `onDragState(dragging: boolean)`, and `children` is the A-/A+/CLEAR toolbar.
- App state: `pane` becomes derived. New state `active: (ToolId | null)[]` and `focus: number`. `const docks = shown.docks`; `visible` = `TOOL_IDS` minus `docks.hidden`, minus `claude`/`chat` when `agents === 'codex'`, minus `codex` when `agents === 'claude'`, minus `ssh` when `remotes` is empty. `const act = pickActive(docks, active, visible)`; `shownGroups` = indices where `act[i] !== null`; `pane = act[shownGroups.includes(focus) ? focus : shownGroups[0]] ?? 'shell'`.
- `show(tool)` replaces `showPane` and every `setPane`: sets `active[groupOf(docks, tool)] = tool`, `focus = groupOf(…)`, and keeps the existing start-on-first-use lists (`chatting`, `shells`, `codexes`).
- `setDocks(next: Docks)`: outside edit mode, `setLayout(l => ({ ...l, docks: next }))` and `prefs.setItem('layout', JSON.stringify(...))`; inside edit mode, `setDraft(d => d && { ...d, docks: next })`.
- Strings to add (en / ko / ja):
  - `dock.split`: `Drop on the right or bottom edge to split` / `오른쪽이나 아래 가장자리에 놓으면 나뉜다` / `右端か下端に置くと分割`
  - `dock.ratio`: `Drag to resize, double-click to even out` / `끌어서 크기 조절, 더블클릭하면 반반` / `ドラッグでサイズ変更、ダブルクリックで半分ずつ`

- [ ] **Step 1: Replace the right section with the grid**

`<section className="right" style={{ ...mainStyle('right'), gridTemplateColumns, gridTemplateRows, gridTemplateAreas }}>` from `dockGrid(docks, shownGroups)`. For each shown group `g`: a `DockHead` with `style={{ gridArea: \`h${g}\` }}`. Every terminal and chat element keeps its current place in the list (same parent, same key, so nothing remounts); its `on` prop becomes `act[groupOf(docks, kind)] === kind && <path or host matches>` and it gets `style={{ gridArea: \`b${groupOf(docks, kind)}\` }}`. `Claude` and `Chat` accept and apply a `style` prop on their outer div. Clicking anywhere in a group's body sets `focus` to that group (`onPointerDown` on the section, reading the target's `data-group`).

- [ ] **Step 2: Drag and drop in `Dock.tsx`**

Chips are the existing `<button><Cut/></button>` with `draggable`. `onDragStart` sets `dataTransfer.setData('application/x-evoke-tool', tool)` and calls `onDragState(true)`; `onDragEnd` calls `onDragState(false)`. The head's `onDragOver` prevents default and computes the insert index from the pointer's x against each chip's midpoint; `onDrop` calls `onDrop(tool, index)` → `setDocks(moveTool(docks, tool, g, index))`.
While dragging, App renders one `.drop` overlay per shown group body (grid area `b${g}`, above the terminal, `data-side` showing where it would land). Its `onDrop` uses `dropSide` on the offset within the overlay: a side → `setDocks(splitDocks(docks, tool, side))`; `null` → `moveTool(docks, tool, g, Infinity)`. The overlay exists only while dragging, so xterm never sees drag events.

- [ ] **Step 3: The divider between groups**

When two groups are shown, a `.dock-split` element at `gridArea: 'split'`, `title={T('dock.ratio')}`, with pointer capture like `divider()` in `App.tsx:481-497`: ratio = pointer offset / section size along `docks.dir`, through `setDocks({ ...docks, ratio })` (`parseDocks` clamps it). Double-click sets `ratio: 0.5`.

- [ ] **Step 4: Route existing callers through `show` and `pane`**

`connect` → `show('ssh')`; `pickAgents` → `show(agentsOf(next)[0])` when the current pane is turned off; `say` and ⌘L keep `targetOf(agents, pane)` and then `show(to)`; the CLEAR button reads the focused group's active tool. Focus the visible agent's textarea with `.claude.on[data-group="${focus}"] .xterm-helper-textarea` (add `data-group` to the terminal div).

- [ ] **Step 5: Run tests and build**

Run: `cd desktop && npm test && npm run build`
Expected: all pass; build succeeds.

- [ ] **Step 6: QA in the separate instance**

1. Open a project, open SHELL, run `seq 1 500`. Drag the SHELL chip onto the right edge of the terminal body. Expected: two groups side by side; the shell in the new group still shows lines up to 500 and accepts input (same session).
2. Drag the divider; double-click it. Expected: sizes follow the pointer within 20–80%; double-click evens them.
3. Drag CODEX into group 2's head between two chips. Expected: it lands at that position.
4. Settings → Agents → Claude only. Expected: if group 2 holds only Codex and Shell, Shell stays; set group 2 to only Codex by moving Shell back: group 2 disappears and group 1 fills the panel.
5. Select text in the editor, press ⌘L. Expected: the reference is typed into the agent of the focused group.
6. Quit the QA instance and start it again. Expected: the same groups, order and ratio.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/Dock.tsx desktop/src/App.tsx desktop/src/style.css desktop/src/i18n.ts
git commit -m "Split the agent panel into two groups whose tools can be dragged between them"
```

---

### Task 5: Agent panel controls and presets in UI edit mode

**Files:**
- Modify: `desktop/src/LayoutEdit.tsx` (inspector at 159–186, presets at 169–179), `desktop/src/i18n.ts`

**Interfaces:**
- Consumes: `value.docks`, `onChange` (already the draft), `moveTool`, `splitDocks`, `TOOL_IDS`, `PRESETS`.
- Strings to add (en / ko / ja):
  - `edit.dock`: `Agent panel` / `에이전트 패널` / `エージェントパネル`
  - `edit.dockGroup`: `Group {n}` / `그룹 {n}` / `グループ {n}`
  - `edit.dockShow`: `Show` / `표시` / `表示`
  - `edit.dockDir.row`: `Side by side` / `좌우로` / `左右に`
  - `edit.dockDir.col`: `Stacked` / `위아래로` / `上下に`
  - `preset.default`: `DEFAULT` / `기본` / `標準`
  - `preset.vibe`: `VIBE · agents first` / `바이브 · 에이전트 중심` / `バイブ・エージェント中心`
  - `preset.review`: `REVIEW · editor first` / `리뷰 · 에디터 중심` / `レビュー・エディター中心`
  - `tool.claude` `CLAUDE`, `tool.chat` `CHAT`, `tool.codex` `CODEX`, `tool.shell` `SHELL`, `tool.ssh` `SSH` (same in all three languages; chip labels stay upper-case Latin)

- [ ] **Step 1: Agent panel section**

When `sel === 'right'`, under the numbers, an `<h4>{T('edit.dock')}</h4>` and one row per tool in `TOOL_IDS`: a checkbox `{T('edit.dockShow')}` bound to `!value.docks.hidden.includes(tool)`, and a `<select>` of `Group 1` / `Group 2` bound to `groupOf`, changing via `moveTool(docks, tool, n, Infinity)` (or `splitDocks` when choosing group 2 while only one exists). Two buttons set `dir` to `row` / `col`, pressed state via `aria-pressed`. Everything here is keyboard-reachable; this is the non-drag path to every dock change.

- [ ] **Step 2: Built-in presets**

List `PRESETS` above the user presets as buttons labelled `T('preset.<name>')`, applied with `onChange(PRESETS[name])`, with no delete button. User presets keep working and now carry `docks` because they save `value`.

- [ ] **Step 3: Run tests and build**

Run: `cd desktop && npm test && npm run build`
Expected: all pass (the i18n test proves every new key in three languages).

- [ ] **Step 4: QA**

Open UI edit mode, pick the terminal box. Expected: the agent panel section appears; tabbing reaches every checkbox, select and button. Apply VIBE, then Save. Expected: Claude above, Codex/Shell below at 60/40, editor narrow. Apply DEFAULT, Cancel. Expected: back to VIBE (cancel discards). Hide CHAT, Save. Expected: no CHAT chip; unhide brings it back in the same place.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/LayoutEdit.tsx desktop/src/i18n.ts
git commit -m "Edit the agent panel and pick built-in presets in UI edit mode"
```

---

### Task 6: TIDE and REBEL looks for the dock

**Files:**
- Modify: `desktop/src/style.css`, `DESIGN.md` ("Panels and layout" and the observation table)

**Interfaces:**
- Consumes: classes from Task 4: `.dock-split`, `.drop`, `.drop[data-side='row']`, `.drop[data-side='col']`, `.sides button.dragging`, `.sides .insert` (the insert marker between chips).

- [ ] **Step 1: Styles, in the existing theme language**

| Element | TIDE (P3R language: blue water, cyan edge, slants) | REBEL (P5 language: black, one red, knocked-off slabs) |
|---|---|---|
| Dragged chip | `opacity: .5`, slides 6px right along the slant | `opacity: .5`, rotates −3deg |
| Insert marker | 3px `--edge` bar skewed −12deg, full chip height | 4px white bar with a 3px `--blood` hard shadow, rotated 4deg |
| Drop overlay, centre | `--sel` wash at 20% | `--blood` wash at 20% |
| Drop overlay, split side | the target half as a `--sel` parallelogram (`clip-path`) with a `--edge` offset shadow | the target half as a white slab, 2deg off true, `--blood` 6px hard shadow |
| Divider | `--line`; on hover/drag `--edge` with the 36px slant used by `.center` | black; on hover/drag `--blood` |
| Focused group head | its chip row underlined by a 3px `--edge` slash | its head's white band extends; others dim to `opacity: .6` |

Transitions 120ms on `transform` and `opacity`; none under `[data-motion='reduce']`. No raw hex outside `[data-theme='rebel']`; inside it only the `#FFFFFF`/`#000000` that block already uses.

- [ ] **Step 2: DESIGN.md**

Add to "Panels and layout": the agent panel holds up to two groups; tools are dragged between them or set in UI edit mode; a group with nothing visible gives its room away; terminals never restart when moved. Add the table rows above to the "What each observation became" table under the matching observations (selection is a shape; white plate with offset hard shadow).

- [ ] **Step 3: QA in both themes**

Repeat Task 4 QA steps 1–3 in TIDE and in REBEL, then with Settings → Appearance → Reduce motion on. Take one screenshot per theme mid-drag over a split side (CDP on 9461). Expected: every state in the table is visible; no motion with reduce on; text on the drop overlay stays readable.

- [ ] **Step 4: Run tests, build, commit**

Run: `cd desktop && npm test && npm run build`
Expected: pass.

```bash
git add desktop/src/style.css DESIGN.md
git commit -m "Give the agent dock's drag, drop and divider states in TIDE and REBEL"
```

- [ ] **Step 5: Open the PR**

`git push -u origin feat/layout-docks` and `gh pr create` with a summary of the six tasks, the QA results with the two screenshots, and the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Do not merge.

---

## Not in this plan (next plans, in order)

1. **Agent sessions and Agent Center** (audit 9.2, 3a–3d): unique session ids instead of `kind:path` so one project can run two Claude sessions, a status per session, and an Agent Center tool that lives in a dock group.
2. **Engine spike** (audit Phase 0): throwaway branch, seven checks; decides the editor engine.
3. **Change review with worktrees** (audit 3e–3f).
4. **Editor groups** (split editor), and sidebar menu order. Menu order is held back on purpose: in REBEL and TIDE the nine menu names sit on rows drawn into the scene art (`ITEM_ROWS` in `plugins/evoke/hooks/tokens.js`), so reordering needs the desktop pane to draw its names as text first.
