# Evoke design

How the window and the terminal pane are meant to look and behave. Code is the source of truth for exact values; this file says which file owns what and which rules a change must keep.

## References (what was looked at, 2026-11-11)

The two themes borrow a design language, not assets: no logo, character or screen of any game is copied. Colours, type and shapes here are Evoke's own.

| Source | Reached | What it showed |
|---|---|---|
| personacentral.com/p3r-interview-menu-ui | yes, text and 6 concept images | Art director's intent for the blue menu: water, bubbles, shimmer, glass reflection; UI should stand for the project's theme; a design that looks good but reads badly in use is dropped; text set as graphics must survive translation |
| automaton-media.com/en/news/20240207-26873 | yes, text and 4 screenshots | Blue menu: white silhouette on saturated blue, one window-high diagonal, huge cropped word behind the content, white parallelogram plates with a small dark value chip. Red menu: red ground, black and white shapes, ransom-note letters, each row at its own angle, a big tilted title |
| asia.sega.com/p3r/kr | yes, page and screenshots | Mostly scene captures; HUD shows portrait chips with slanted two-colour gauges and large italic numerals |
| persona.atlus.com/p3r | redirects to sega.com product page | Store page only, no UI captures |
| atlus.com/atlus-titles/p5r | yes, image list | Scene captures; little menu UI |
| playstation.com/.../persona-5-royal | yes, screenshots | HUD: black torn-edge frames, white numerals with cyan and pink bars, small skewed labels |
| code.visualstudio.com user interface, custom layout, keybindings, default keybindings, tips | yes, summaries | Function only: side bar, tabs, panel, status bar, preview tabs, movable panels, conflict-free shortcuts, quick open, search |
| docs.cursor.com/advanced/keyboard-shortcuts | redirects to the docs home | Shortcut list not reached; nothing taken from it |

What each observation became:

| Observed | TIDE | REBEL | Where |
|---|---|---|---|
| One window-high diagonal splits the screen | Editor and terminal meet on a 36px slant | Panels have cut corners instead | `.center`, `.right` |
| Huge cropped word behind content | `EVOKE` at up to 250px, the menu name rotated in the pane | Outlined `EVOKE`, tilted | `.empty .big`, `.cutin` |
| White plate with offset hard shadow | Cyan shadow, no rotation | Red shadow, 1 to 3 degree rotation | `.sheet`, `.toast`, `.float`, `.inspector` |
| Selection is a shape, not a tint | Blue parallelogram that slides right | White slab knocked off true | `.entry.on`, `.row.on`, `.tab.on` |
| Selection is a shape (agent dock) | The drop target is a blue parallelogram with a cyan leading edge; the insert marker is a cyan bar on the slant; a dragged chip slides 6px right | The drop target is a white slab 2 degrees off true with a red hard shadow; the marker is a white bar with a red shadow, tilted; a dragged chip tilts -3 degrees | `.drop`, `.sides .insert`, `.sides button.dragging` |
| Menu rows each at their own offset | Menu names stepped along a curve | Same, on the scene art | `.hot-menu` |
| Ransom-note letters | not used | Every chip, and prompt variables | `.cut > span`, `.pv` |
| Halftone dots as texture | Cyan dots on the empty page | Red dots on panel seams | `.empty .big::after`, `.right::before` |
| Slanted gauges, italic numerals | Clock plate cropped by the window edge | Tilted white clock with red shadow | `.clock`, `.gauge` |

## Themes

Two themes. Each is one block of CSS variables in `desktop/src/style.css`, with the same theme's editor and terminal colours in `desktop/src/themes.ts`. Change both together.

| | TIDE | REBEL |
|---|---|---|
| Idea | White page, blue water, cyan edge | Black page, one red, ransom-note chips |
| Ground | `#FFFFFF` | `#080808` + `bg-rebel.webp` |
| Main accent | `#064DE8` | `#B8001F` (`--blood`, the only red) |
| Ink / text | `#06145B` | `#FFFFFF` |
| Edge / highlight | `#16D9F5` | `#FFFFFF` |

Rules:

- Use the variables (`--plate`, `--panel`, `--sel`, `--hi`, `--text`, `--gray`, `--chip`, `--edge`), not raw hex, outside a theme block.
- A surface that flips to dark re-points the variables for everything inside it, so text stays readable.
- REBEL has one red. Do not add a second accent.

### Tokens

| Token | Role | TIDE | REBEL |
|---|---|---|---|
| `--ground`, `--page`, `--panel`, `--plate` | Background layers | white | black, over the art |
| `--text`, `--gray` | Foreground, secondary and inactive text | `#06145B`, 69% | white, 55% |
| `--sel`, `--sel-ink` | Selected surface and its text | `#064DE8`, white | `#B8001F`, black |
| `--hi` | Emphasis: numerals, keys, links | `#064DE8` | white |
| `--edge` | Highlight, keyboard focus ring, dividers on hover | `#16D9F5` | white |
| `--hot` | Warning: a gauge at 80% or more, the alert edge | `#064DE8` on white, `#16D9F5` on dark | white |
| `--chip`, `--chip-ink` | Heading chip | `#06145B`, white | red, white |
| `--ink` | Darkest band: HUD, hint, edit bar | `#06145B` | black |
| `--line` | Hairlines | `#BFC4D0` | `#2A2A2A` |

Disabled is `opacity: .4` with no pointer events; there is no disabled colour.

File badges (`.fi`, kinds and shapes in `iconOf` in `desktop/src/text.ts`) are data, like the git status colours: each kind has its own colour and each family its own outline (code: slanted tab; React, Vue, Svelte: pill; data and config: hexagon; docs: folded page; HTML and CSS: arrow; media: rounded; shell: notched; tests: octagon). They look the same in both themes and are the one place outside a theme block with fixed colours. Folders keep each theme's own mark. A new kind needs its colour in `style.css`; a test fails without it.

## States and motion

| State | Rule |
|---|---|
| Default | Flat, no border radius anywhere |
| Hover | Moves 3 to 8px along the slant and takes a wash of `--edge` or `--sel` |
| Focus (keyboard) | 2px `--edge` outline. Rows and tabs take focus and answer Enter and Space |
| Selected | The theme's selection shape (see the table above), never only a colour change |
| Active (pressed) | Scales to .94 or jumps further along the slant |
| Disabled | `opacity: .4`, not clickable |
| Loading | `.state`: a slanted band with a moving glint |
| Error | `.state-error`: full window, big italic title, the message, one retry button |

Motion is short (80 to 260ms) and only on entry or pick: sheets drop in, the overlay floods on a diagonal, the menu word wipes. It never delays input. The system "reduce motion" setting, or Settings → Appearance → Reduce motion, turns every animation and transition off in both themes.

## Type and shapes

Sizes: display 110 to 250px (empty page), sheet title 20px, chip 13 to 20px, body 13px, metadata 11 to 12px. Labels on chips are upper case. Numbers, times and keys are Barlow italic; paths, logs and code are Iosevka.


- Headings and chips: Barlow Black Italic. Code and file names: Iosevka. Body and Korean: Pretendard.
- The chip (`.cut`) is a parallelogram: every heading wears one. In REBEL each letter is cut from a different page.
- Selection is a slanted bar that slides in, never a plain rectangle.

## Top bar

- No logo. The bar holds the project button, branch, the ⌘K search field, theme, UI edit, the two fold buttons, settings and the clock.
- ⌘K finds anything the window holds: menus, tools, projects, calendar events, TODOs (once QUEST has loaded), changed files, themes, settings, and project files by name.
- TIDE draws a short blue wedge and a cyan slash under the macOS window buttons only. The project button starts clear of the slash. On Windows the wedge is hidden, since the window buttons sit on the other side.
- The bar is the window's drag region; every button in it opts out.

## Panels and layout

Three panels: `pane` (menu and files), `center` (editor), `right` (terminals).

- **Default split:** a CSS grid. Dragging a divider fixes that side's width in pixels; double-click resets it. The editor always keeps its minimum width.
- **Saved layout:** UI edit mode stores each panel as a rect in fractions of the workspace, so it follows the window size.
- **Folding:** `⌘B` folds the pane, `⌘J` folds the terminals. A folded panel is hidden, not unmounted, so terminals keep running.
- **A folded panel gives its room away.** In the default split the grid column goes to zero. In a saved layout, a panel that shares a whole edge with the folded one grows over it (`fillHidden` in `layout.ts`). Only one neighbour takes a panel that sits between two.
- Limits per panel (min and max size) are in `LIMITS` in `layout.ts`. No rule may break them.
- **The agent panel holds up to two dock groups** (`docks.ts`), side by side or stacked. Its tools (Claude, Chat, Codex, Shell, SSH) are chips: drag one within a head to reorder, onto another head to move it, or onto the right or bottom edge of a body to split. UI edit mode offers the same changes by keyboard (show, group, direction).
- A group with nothing visible gives its room away. A tool shown in a group starts as a click on it would.
- Moving a tool never restarts its terminal: every terminal stays a child of the panel's grid and only changes grid area.
- Built-in presets: DEFAULT (the grid split), VIBE (agents take half, Claude above Codex and the shell), REVIEW (the editor takes most).
- REBEL's empty page shows the outlined word alone, without the logo.

## Shortcuts

Shown in Settings → Shortcuts. `⌘` is `Ctrl` on Windows.

| Key | Does |
|---|---|
| `⌘K` | Find anything (menus, tools, projects, events, TODOs, files) |
| `⌘P` | Open a file |
| `⌘⇧F` | Search the project: match case, whole word, regex, files to include and exclude, Replace all (asks first, skips open files with unsaved edits) |
| `⌘S` | Format and save |
| `⌘L` | Send the selection to Claude or Codex |
| `⌘O` | Projects |
| `⌘B` / `⌘J` | Fold the sidebar / the terminals |
| `⌘W` | Close the tab |
| `Ctrl+Tab` / `Ctrl+⇧Tab` | Next / previous tab |
| `⌘,` | Settings, on the shortcut list |

`⌘B` and `⌘J` are never `Ctrl` on macOS: those belong to the shell and tmux inside the terminal.

## Screens

Function follows a code editor (side bar, preview tabs, panel, status bar, quick open); the look never does.

| Screen | Layout | Components |
|---|---|---|
| Welcome (no project) | Display word top left, recent projects on a plate below | `.empty`, `.welcome`, `.row` with a number key |
| Empty editor (project open) | Display word and one hint line | `.empty` |
| Editor | Tabs on a dark band, page below; a single click opens a preview tab (italic) | `.tabs`, `.tab`, Monaco |
| Side bar | Nine menus, each content list under band headers with counts. STATUS has a commit box on top (`git commit -a`: tracked files only, so new files need `git add` first) and the last 15 commits below the changes. CALENDAR holds your own events (stored in `events.json`, any project) beside Claude sessions; kinds differ by shape (meeting a block, dev a slanted bar, personal an outline), never by a second colour | `.pane`, `.group`, `.entry`, `.dot`, `.ev-form` |
| Terminals | A usage strip on top (context, every limit Claude Code reports, cost), then chips that pick the terminal; tools on their own row | `.usage-strip`, `.gauge`, `.head.sides`, `.tools`, `.claude` |
| Status bar | Menu chip, project, branch, changes | `.hud` |
| Sheets (projects, quick open, search, settings) | Overlay, one skewed plate, title band, rows | `.picker`, `.sheet`, `.row`, `.set-tabs` |
| Alert | Plate at the bottom right, 5 seconds | `.toast` |
| UI edit mode | Outline boxes over the live layout (no fill, no grid), one options bar in the top band, a ⋯ menu for numbers, agent panel and presets, W × H beside the cursor while dragging; hold Space to hide the overlay | `.edit`, `.box`, `.inspector.bar`, `.inspector.more`, `.size-tip` |
| Loading, error | See States | `.state`, `.state-error` |

Rules:

- A new surface uses the tokens, so it works in both themes; a theme block then gives it that theme's shape (TIDE: slant and cyan shadow; REBEL: rotation, white outline, red shadow).
- Edit mode, the error page and git codes follow the theme too. REBEL shows no blue, cyan, yellow or green anywhere.
- Decoration (dots, wedges, the big word) sits behind content and never under body text.

## Claude Code in the editor

Evoke links to Claude Code the way the VS Code extension does (`desktop/ide.cjs`): a WebSocket server on `127.0.0.1` speaking MCP, announced by a lock file in `~/.claude/ide` and by `CLAUDE_CODE_SSE_PORT` in the Claude terminal's environment. The lock file holds a token that every connection must present.

- Claude Code sees the open file and the selection without `⌘L`.
- An edit that needs approval opens as a diff tab with ACCEPT and REJECT on a bar above it. Closing the tab rejects.
- Claude can ask for the open tabs, diagnostics and unsaved state, and can open a file. Files stay inside the open projects: the main process refuses any other path.

### Chat panel

The CHAT chip beside CLAUDE shows Claude Code as a conversation (`desktop/src/ChatPanel.tsx`, `chat.ts`). It runs one `claude -p` process per project in stream-json mode.

- Your messages are selection-coloured plates on the right; answers are plain rows; each tool is one line with its name on a chip.
- A tool that needs permission stops as a card with ALLOW and DENY. Nothing runs until one is pressed; a process that ends counts as DENY.
- STOP ends the process. The next message resumes the same session.
- Answers are plain text, not rendered Markdown, so nothing Claude writes becomes HTML in the window.

## Usage without the plugin

The HUD and the SKILL ranks work whether or not the Evoke plugin is installed in Claude Code.

- Plugin on: context, 5H and 7D limits and cost come from the plugin's store file.
- Plugin off: context comes from the newest session transcript of the open project; limits and cost show `--`, since nothing else on disk holds them. Skill ranks count the slash commands in `~/.claude/history.jsonl`.

## Terminal pane (the plugin)

The MENU pane the plugin draws inside Claude Code. Colours are in `plugins/evoke/hooks/tokens.js`.

One mode: plain rows, sections with band headers (MENU, the content, COMMAND). The picture mode for Ghostty and other image terminals was removed on 2026-11-12; Evoke's own terminals (xterm.js) never drew it.

The scene art (`plugins/evoke/scenes/`) was removed on 2026-11-12. Both desktop themes draw the MENU pane in CSS, with the menu buttons on `ITEM_ROWS`. TIDE follows the remake's pause menu: deep water with drifting light and bubbles, straight upright names, the pick a blue bar that sweeps in with a cyan edge, eased motion only.

Rules:

- Menu names must always be readable as text in plain rows; the picked one sits on a white plate.
- The keys row stands above the content, so a short pane cuts log rows, not controls.
- The pane's colours are fixed (underwater navy and cyan). They do not follow the desktop theme.

## Checking a design change

- Capture the real window, in both themes, at the default split and with a saved layout.
- Fold each panel and confirm the others take the room.
- Check the settings sheet, UI edit mode and a `.state-error` in REBEL: no TIDE colour may show.
- Tab through the side bar: every row shows the focus ring and opens on Enter.
- For the pane: check plain rows in Evoke's terminal, and both themes' desktop MENU pane.
