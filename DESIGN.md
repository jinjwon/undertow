# Evoke design

How the window and the terminal pane are meant to look and behave. Code is the source of truth for exact values; this file says which file owns what and which rules a change must keep.

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

## Type and shapes

- Headings and chips: Barlow Black Italic. Code and file names: Iosevka. Body and Korean: Pretendard.
- The chip (`.cut`) is a parallelogram: every heading wears one. In REBEL each letter is cut from a different page.
- Selection is a slanted bar that slides in, never a plain rectangle.

## Top bar

- No logo. The bar holds the project button, branch, theme, UI edit, the two fold buttons, settings and the clock.
- TIDE draws a short blue wedge and a cyan slash under the macOS window buttons only. The project button starts clear of the slash. On Windows the wedge is hidden, since the window buttons sit on the other side.
- The bar is the window's drag region; every button in it opts out.

## Panels and layout

Three panels: `pane` (menu and files), `center` (editor), `right` (terminals).

- **Default split:** a CSS grid. Dragging a divider fixes that side's width in pixels; double-click resets it. The editor always keeps its minimum width.
- **Saved layout:** UI edit mode stores each panel as a rect in fractions of the workspace, so it follows the window size.
- **Folding:** `⌘B` folds the pane, `⌘J` folds the terminals. A folded panel is hidden, not unmounted, so terminals keep running.
- **A folded panel gives its room away.** In the default split the grid column goes to zero. In a saved layout, a panel that shares a whole edge with the folded one grows over it (`fillHidden` in `layout.ts`). Only one neighbour takes a panel that sits between two.
- Limits per panel (min and max size) are in `LIMITS` in `layout.ts`. No rule may break them.

## Shortcuts

Shown in Settings → Shortcuts. `⌘` is `Ctrl` on Windows.

| Key | Does |
|---|---|
| `⌘P` | Open a file |
| `⌘⇧F` | Search the project |
| `⌘S` | Format and save |
| `⌘L` | Send the selection to Claude or Codex |
| `⌘O` | Projects |
| `⌘B` / `⌘J` | Fold the sidebar / the terminals |
| `⌘W` | Close the tab |
| `Ctrl+Tab` / `Ctrl+⇧Tab` | Next / previous tab |
| `⌘,` | Settings, on the shortcut list |

`⌘B` and `⌘J` are never `Ctrl` on macOS: those belong to the shell and tmux inside the terminal.

## Terminal pane (the plugin)

The MENU pane the plugin draws inside Claude Code. Colours are in `plugins/evoke/hooks/tokens.js`; the art is laid out on a 56 × 41 cell grid.

Two modes:

- **Picture mode:** one image is the whole pane and text lies on it in the art's grid. Only for terminals that draw images: Ghostty, kitty, iTerm, WezTerm.
- **Plain rows:** sections with band headers (MENU, the content, COMMAND). Used everywhere else, including Evoke's own terminals (xterm.js).

Rules:

- **Never draw picture mode without knowing the terminal draws pictures.** If the session's setup has not run, the pane asks the terminal at draw time. The failure this prevents: menu keys `1:`–`9:` with no names beside them and an empty skill list.
- Menu names must always be readable as text in plain rows; the picked one sits on a white plate.
- The keys row stands above the content, so a short pane cuts log rows, not controls.
- The pane's colours are fixed (underwater navy and cyan). They do not follow the desktop theme.

## Checking a design change

- Capture the real window, in both themes, at the default split and with a saved layout.
- Fold each panel and confirm the others take the room.
- For the pane: check picture mode in Ghostty and plain rows in Evoke's terminal.
