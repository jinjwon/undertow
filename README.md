# Evoke

<img src="assets/logo-tide.png" width="96" alt="Evoke logo">

**English** | [한국어](README.ko.md) | [日本語](README.ja.md)

A desktop code editor built around [Claude Code](https://claude.com/claude-code) and [Codex](https://developers.openai.com/codex/cli), dressed as a slanted game menu. Files, the editor, git, a shell and Claude Code sit in one window, and the things you would install VS Code or Cursor extensions for are built in.

<img src="assets/preview.png" width="720" alt="Evoke in the TIDE theme: the MENU pane on the left, the editor in the middle, Claude Code on the right">

## Download

From [Releases](https://github.com/jinjwon/undertow/releases/latest):

| System | File | Install |
| --- | --- | --- |
| macOS (Apple silicon) | `Evoke-<version>-arm64.dmg` | Open it and drag Evoke to Applications |
| Windows (x64) | `Evoke-Setup-<version>.exe` | Run it: it adds Start menu and desktop shortcuts |
| Windows, portable | `Evoke-<version>-win-x64.zip` | Unzip anywhere and run `Evoke.exe` |

You need [Claude Code](https://docs.claude.com/en/docs/claude-code) or [Codex](https://developers.openai.com/codex/cli) installed and signed in; one of them is enough. Pick which the app uses in Settings.

Builds are unsigned. The first time, on macOS right-click Evoke and choose Open; on Windows choose More info → Run anyway.

## What is in the window

- **MENU pane (left):** the nine menus from the terminal pane, with their art and cut-ins. Click a slanted name.

  | Menu | Shows |
  | --- | --- |
  | SKILL | Your skills, most used first. Click one to put it in Claude's prompt |
  | ITEM | The project's files |
  | EQUIP | MCP servers and plugins Claude Code carries here |
  | AGENT | Past Claude Code sessions of this project. Click one to resume it |
  | STATUS | Changed files. Click one to diff it against the last commit |
  | QUEST | `TODO`s left in the project |
  | LINK | Your trusted projects, most recently used first, and the servers in `~/.ssh/config` |
  | CALENDAR | This month, with the days you talked to Claude |
  | SYSTEM | Theme and shortcuts |

  The HUD on top shows the date, the moon, context and 5-hour/7-day usage with resets, and session cost. A toast warns at 85%.
- **Editor (middle):** Monaco with completion, errors and formatting for TS/JS, JSON, CSS and HTML; bracket colors and guides; matching HTML tags rename together; diff view.
- **CLAUDE / CODEX / SHELL (right):** one live Claude Code session, one Codex session and one shell per project, kept while you switch projects. Codex and the shell start the first time you open their tab.
- **Coding agent:** Settings (⚙) → General picks Claude Code and Codex, Claude Code only, or Codex only. An agent you turn off gets no tab and is never started. With Codex only, the projects Codex trusts fill the project list. Past sessions, the usage HUD and the skill list come from Claude Code.
- **Preview:** a PDF, a video or a sound file opens as a preview tab. On an HTML or Markdown file, `LIVE` at the end of the tab bar opens the page beside it and reloads it whenever a file in the project changes; `↗` opens the same page in your browser. Word, Excel and PowerPoint files are not previewed.
- **Servers:** LINK lists the hosts in `~/.ssh/config`. Click one and an `ssh` terminal opens in its own tab. It is a terminal on the server; files there do not open in the editor.
- **Resize and fold:** drag the line between two panels to resize them, and double-click it to reset. `⌘B` folds the sidebar and `⌘J` the terminal, as do `◧` `◨` in the top bar; the editor takes the room, and a folded terminal keeps running.
- **Two themes,** each with its own logo. **TIDE** is a white and blue game menu with hard diagonals. **REBEL** is a prompt-engineering theme in three colours only (blood red, pitch black, stark white): cut-out panel corners, halftone seams, a thief's mask on folders and alerts, and `{{variables}}` in prompts cut out letter by letter like a ransom note.
- **UI edit mode:** press `UI` in the top bar to drag, resize and swap the panels and widgets. Layouts and presets are kept across restarts.
- **Start like VS Code:** the window opens on Open Folder and your recent projects.
- **Preview tabs:** a single click previews a file (italic tab, replaced by the next one); a double click or an edit keeps it. Images open as pictures. A minimap shows the whole file.
- **File badges** (TS, JS, {}, MD, IMG…) in the tree, on tabs and in quick open.
- **English, 한국어, 日本語:** pick in Settings (⚙ at the top right); the system language is the default.

### Shortcuts

`Ctrl` on Windows instead of `⌘`.

| Key | Does |
| --- | --- |
| `⌘P` | Open a file by name |
| `⌘⇧F` | Search the project |
| `⌘S` | Format, then save |
| `⌘L` | Send the selection to Claude as `@file#Lx-y`, or to Codex when its tab is showing |
| `⌘O` | Projects (`1`–`9` or Enter) |
| `⌘B` | Show or hide the sidebar |
| `⌘J` | Show or hide the terminal |

Open tabs reload from disk when Claude edits them, unless you have unsaved changes.

## The usage HUD

Claude Code reports usage to plugins, so the numbers come from the Evoke plugin running inside the CLAUDE pane. Install it once at the Claude Code prompt:

```
/plugin install evoke --marketplace jinjwon/undertow
```

The plugin also works on its own in any terminal: `/menu` opens the pane, `/projects` picks a project, `/skillbook` browses skills. Terminals that cannot draw images get plain rows.

## Design

### References

| Source | What was taken | Where Evoke uses it |
| --- | --- | --- |
| Persona 5 | Red, black and white contrast, large slanted type, plates like cut paper, a name that grows and shifts when picked | The one selected menu: a white plate, a red slash across black type, a pink shadow. Its neighbours move aside. Red means selection or a warning, nothing else. The whole REBEL theme |
| Persona 3 Reload | Cyan, blue and white, water and glass, panels cut on a slant, a line from the cursor to the content, a key guide at the bottom | The pane's ground (transparent over the water shader), three cyans for unselected names, the slanted HUD, the line from the cursor down to the content, the `Command` row. The whole TIDE theme |
| VS Code | The layers Activity Bar → Side Bar → Editor → Panel → Status Bar, Quick Open, preview tabs | The nine menus act as the Activity Bar, the content under them as the Side Bar, the HUD and the band over the prompt as the Status Bar. The app's `⌘P` `⌘⇧F` `⌘B` `⌘J` are VS Code's keys |
| Cursor | An AI panel beside the editor, sending a selection to chat | The CLAUDE / CODEX panel on the right, `⌘L` |

The two games are not blended; each has a job. Ground and information use Persona 3 Reload's cold colours. Only the one thing selected is drawn in Persona 5's red on a white plate.

### How menus and panels are built

- **One direction, top to bottom:** HUD (state) → nine menus (pick) → the picked menu's content → the guide (what can be done, and its keys).
- **Icons:** one before each name. A spark (SKILL), a file (ITEM), a plug (EQUIP), a party (AGENT), gauges (STATUS), a flag (QUEST), rings (LINK), the moon (CALENDAR), a gear (SYSTEM). An icon has its name's colour and turns red when selected.
- **State colours:** red is selection, a gauge at 80% or more, an error. Cyan is what can be pressed and secondary information. Gray is what is not in use. Pink is the cursor's edge and counts.
- **Sections:** the pane is cut into sections under band headers, as VS Code's Side Bar is. MENU, the picked menu's content (skills: a section per plugin), then COMMAND; a header carries its count at the right.
- **Terminals with no pictures:** where images cannot be drawn, as in Windows Terminal, the same shape is drawn in text. The names stand in the art's crooked column; the picked one is black on a white plate with a pink corner.
- **Real data only:** a menu with no record says so and shows nothing else.
- **Picture and control kept apart:** in a terminal the slanted names are one picture and cannot be clicked. What can be pressed is `1`–`9` at the right edge and the key row at the bottom.
- **Motion:** only a menu change swaps four pictures 24 ms apart. No timer runs otherwise.

### Keys in the terminal pane

No modifier keys, so they are the same on macOS, Windows and Linux. They work while the pane holds the keyboard; the bottom row then shows `KEYS ON`. Otherwise press `ctrl+x tab` or click the pane.

| Group | Key | Does |
| --- | --- | --- |
| Move | `j` / `k` | Next / previous menu |
| Pick | `1`–`9` | Picks that menu and fills its command into the prompt |
| Run | `e`, then Enter | Fills the picked menu's command and runs it |
| Page | `n` / `b` | Next / previous page of SKILL |
| Switch pane | `p` / `s` | Project picker / skillbook |
| Back | `Esc` | Closes the project picker or the skillbook |
| Commands | `/menu` `/projects` `/skillbook` | Open a pane from the prompt |

### Known limits

- Under 110 columns Claude Code seats the pane above the prompt. It is then drawn as plain rows with the key row above the content, so what is cut is never the controls.
- In a short window the picture shrinks whole to keep its shape, which leaves water on its right.
- The picture's columns are worked out from Iosevka 14's cell (width ÷ height = 0.4). For another font, set its ratio in the environment, as `EVOKE_CELL=0.5`.

### Sources

- Persona 5 Royal: <https://persona.atlus.com/p5r/>
- Persona 3 Reload: <https://persona.atlus.com/p3r/>
- VS Code, user interface: <https://code.visualstudio.com/docs/editing/getting-started/userinterface>
- VS Code, personalize: <https://code.visualstudio.com/docs/getstarted/personalize-vscode>
- VS Code, keyboard shortcuts: <https://code.visualstudio.com/docs/configure/keybindings>
- VS Code, default keybindings: <https://code.visualstudio.com/docs/reference/default-keybindings>
- Cursor, keyboard shortcuts: <https://docs.cursor.com/advanced/keyboard-shortcuts>

## Build it yourself

```sh
git clone https://github.com/jinjwon/undertow.git
cd undertow/desktop && npm install && npm start
npm run dist:mac        # release/Evoke-<version>-arm64.dmg
npm run dist:win        # Windows installer, on Windows
```

Pushing a `v*` tag builds both installers on GitHub Actions and attaches them to the release.

A theme is one entry in `desktop/src/themes.ts` plus one block in `desktop/src/style.css`.

## Uninstall

**App:** delete Evoke from Applications, or uninstall it from Windows Settings → Apps.

**Plugin:** run `/plugin uninstall evoke`, or `claude plugin uninstall evoke` in a shell.

## Credits and privacy

Evoke makes no AI or network requests of its own. Claude Code in the CLAUDE pane uses your plan as it does anywhere else; nothing is sent to a model until you send a prompt. See [SECURITY.md](SECURITY.md) for what the app reads and writes.

## License and notice

[MIT](LICENSE). The art's typeface is [Barlow](https://github.com/jpt/barlow) ([OFL](plugins/evoke/tools/fonts/OFL.txt)).

Evoke is an unofficial fan project inspired by the menu design of Persona 3 Reload (TIDE) and Persona 5 (REBEL). It is not affiliated with or endorsed by ATLUS or SEGA, and it contains no game assets. To report a vulnerability, see [SECURITY.md](SECURITY.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).
