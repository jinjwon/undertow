# Evoke

<img src="assets/logo-tide.png" width="96" alt="Evoke logo">

**English** | [한국어](README.ko.md) | [日本語](README.ja.md)

A desktop code editor built around [Claude Code](https://claude.com/claude-code), dressed as a slanted game menu. Files, the editor, git, a shell and Claude Code sit in one window, and the things you would install VS Code or Cursor extensions for are built in.

<img src="assets/preview.png" width="720" alt="Evoke: the MENU pane on the left, the editor in the middle, Claude Code on the right">

## Download

From [Releases](https://github.com/jinjwon/undertow/releases/latest):

| System | File | Install |
| --- | --- | --- |
| macOS (Apple silicon) | `Evoke-<version>-arm64.dmg` | Open it and drag Evoke to Applications |
| Windows (x64) | `Evoke-Setup-<version>.exe` | Run it: it adds Start menu and desktop shortcuts |
| Windows, portable | `Evoke-<version>-win-x64.zip` | Unzip anywhere and run `Evoke.exe` |

You need [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and signed in. Nothing else.

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
  | LINK | Your trusted projects, most recently used first |
  | CALENDAR | This month, with the days you talked to Claude |
  | SYSTEM | Theme and shortcuts |

  The HUD on top shows the date, the moon, context and 5-hour/7-day usage with resets, and session cost. A toast warns at 85%.
- **Editor (middle):** Monaco with completion, errors and formatting for TS/JS, JSON, CSS and HTML; bracket colors and guides; matching HTML tags rename together; diff view.
- **CLAUDE / SHELL (right):** one live Claude Code session and one shell per project, kept while you switch projects.
- **Two themes,** each with its own logo. **TIDE** is deep-sea blue. **REBEL** is a prompt-engineering theme in three colours only (blood red, pitch black, stark white): cut-out panel corners, halftone seams, a thief's mask on folders and alerts, and `{{variables}}` in prompts cut out letter by letter like a ransom note.
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
| `⌘L` | Send the selection to Claude as `@file#Lx-y` |
| `⌘O` | Projects (`1`–`9` or Enter) |

Open tabs reload from disk when Claude edits them, unless you have unsaved changes.

## The usage HUD

Claude Code reports usage to plugins, so the numbers come from the Evoke plugin running inside the CLAUDE pane. Install it once at the Claude Code prompt:

```
/plugin install evoke --marketplace jinjwon/undertow
```

The plugin also works on its own in any terminal: `/menu` opens the pane, `/projects` picks a project, `/skillbook` browses skills. Terminals that cannot draw images get plain rows.

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
