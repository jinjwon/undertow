# Evoke

<img src="assets/logo-tide.png" width="96" alt="Evoke logo">

**English** | [한국어](README.ko.md) | [日本語](README.ja.md)

> **Status: finished, no longer developed.** Evoke works and stays here as it is, but I now use [Cursor](https://cursor.com) day to day. Issues and pull requests are not being worked on. Fork it if you want to take it further.

A desktop code editor built around [Claude Code](https://claude.com/claude-code) and [Codex](https://developers.openai.com/codex/cli), dressed as a slanted game menu. Files, the editor, git, terminals and the coding agents sit in one window.

<img src="assets/preview.png" width="720" alt="Evoke in the TIDE theme: the MENU pane on the left, the editor in the middle, Claude Code on the right">

## Download

The last release is [2.5.0](https://github.com/jinjwon/undertow/releases/latest). Later work (⌘K, the commit box, calendar events, DISCOVER, CHAT, custom CSS and LOOK, the redrawn menu pane) is only on `main`; [build it yourself](#build-it-yourself) to get it.

| System | File | Install |
| --- | --- | --- |
| macOS (Apple silicon) | `Evoke-<version>-arm64.dmg` | Open it and drag Evoke to Applications |
| Windows (x64) | `Evoke-Setup-<version>.exe` | Run it: it adds Start menu and desktop shortcuts |
| Windows, portable | `Evoke-<version>-win-x64.zip` | Unzip anywhere and run `Evoke.exe` |

You need [Claude Code](https://docs.claude.com/en/docs/claude-code) or [Codex](https://developers.openai.com/codex/cli) installed and signed in; one of them is enough. Pick which the app uses in Settings → General.

Builds are unsigned. The first time, on macOS right-click Evoke and choose Open; on Windows choose More info → Run anyway.

## What is in the window

- **MENU pane (left):** nine menus.

  | Menu | Shows |
  | --- | --- |
  | SKILL | Your skills, most used first, a section per plugin. Click one to put it in Claude's prompt. DISCOVER finds skill repositories on GitHub and installs one skill at a time |
  | ITEM | The project's files |
  | EQUIP | MCP servers and plugins Claude Code carries here |
  | AGENT | Past Claude Code sessions of this project. Click one to resume it |
  | STATUS | Changed files (click one to diff it), a commit box (`⌘↵`, runs `git commit -a`) and the last 15 commits |
  | QUEST | `TODO`s left in the project |
  | LINK | Your projects, most recently used first, and the servers in `~/.ssh/config` |
  | CALENDAR | Month, week and day views, the days you talked to Claude, and your own events |
  | SYSTEM | Theme and shortcuts |

- **Usage HUD:** context, the 5-hour and 7-day limits (a model's own limit included) with resets, and session cost, read from Claude Code's status line. Claude and Codex account limits show before any work starts. A toast warns at 85%.
- **Editor (middle):** Monaco with completion, errors and formatting for TS/JS, JSON, CSS and HTML; bracket colours and guides; diff view; minimap. A single click previews a file (italic tab), a double click or an edit keeps it. Open tabs reload from disk when an agent edits them, unless you have unsaved changes.
- **Previews:** images, PDF, video and sound open as preview tabs. On an HTML or Markdown file, `LIVE` opens the page beside it, styled in the app's theme, and reloads it whenever a project file changes; `↗` opens it in your browser.
- **Agent panel (right):** CLAUDE, CHAT, CODEX, SHELL and SSH tabs in two groups. Drag a tab to reorder it, move it to the other group, or split the panel. One session per project, kept while you switch projects.
  - Claude Code links to the editor as it does in VS Code: it sees the selection, open tabs and diagnostics, and shows its edits as a diff to accept or reject.
  - CHAT shows Claude Code as a chat with Markdown answers and ALLOW / DENY for tool permissions. The terminal stays the default; CHAT is one tab away.
  - An agent turned off in Settings has no tab and is never started.
- **Search:** `⌘⇧F` with replace, match case, whole word, regex, and include / exclude filters. `⌘K` finds menus, tools, projects, events, TODOs, changed files, settings and files.
- **Layout:** drag the lines between panels to resize, double-click to reset. `⌘B` folds the sidebar, `⌘J` the terminal. `UI` in the top bar opens edit mode: drag, resize and swap panels and widgets, pick a preset (DEFAULT, VIBE, REVIEW) and tune colours and sizes under LOOK.
- **Custom CSS:** Settings → Appearance opens `custom.css` from the app's data folder. It is applied on every save and survives updates.
- **Two themes.** **TIDE** is white and blue water with hard diagonals. **REBEL** uses three colours only (blood red, pitch black, stark white), cut-out corners and ransom-note letters.
- **English, 한국어, 日本語:** pick in Settings; the system language is the default.

### Shortcuts

`Ctrl` on Windows instead of `⌘`.

| Key | Does |
| --- | --- |
| `⌘P` | Open a file by name |
| `⌘K` | Find anything |
| `⌘⇧F` | Search and replace in the project |
| `⌘S` | Format, then save |
| `⌘L` | Send the selection to Claude as `@file#Lx-y`, or to Codex when its tab is showing |
| `⌘O` | Projects (`1`–`9` or Enter) |
| `⌘B` | Show or hide the sidebar |
| `⌘J` | Show or hide the terminal |
| `⌘W` | Close the tab |
| `⌘Tab` / `⌘⇧Tab` | Next / previous tab |
| `⌘,` | Settings and shortcuts |

## The Claude Code plugin

`plugins/evoke/` is an optional Claude Code plugin that draws the MENU pane as plain rows inside any terminal. The app does not need it: the HUD reads Claude Code's status line on its own.

```
/plugin install evoke --marketplace jinjwon/undertow
```

`/menu` opens the pane, `/projects` picks a project, `/skillbook` browses skills. In the pane, `j` / `k` move, `1`–`9` pick a menu, `Esc` closes a sheet.

## Design

Design rules, references and which file owns what are in [DESIGN.md](DESIGN.md). In short: TIDE borrows the cold blue language of Persona 3 Reload's menus, REBEL the red, black and white of Persona 5, and the window's structure and keys come from VS Code. No game assets are used.

## Build it yourself

```sh
git clone https://github.com/jinjwon/undertow.git
cd undertow/desktop && npm install && npm start
npm test                # tests
npm run dist:mac        # macOS app in release/
npm run dist:win        # Windows installer, on Windows
```

Pushing a `v*` tag builds both installers on GitHub Actions and attaches them to the release.

A theme is one entry in `desktop/src/themes.ts` plus one block in `desktop/src/style.css`.

## Uninstall

**App:** delete Evoke from Applications, or uninstall it from Windows Settings → Apps.

**Plugin:** run `/plugin uninstall evoke`, or `claude plugin uninstall evoke` in a shell.

## Privacy

Evoke makes no AI requests of its own. The agents in the panel use your plan as they do anywhere else. The only network calls the app makes itself are reading account limits from Claude's and Codex's usage endpoints, with the tokens those tools already keep, and searching GitHub when you open DISCOVER. See [SECURITY.md](SECURITY.md) for what the app reads and writes.

## License and notice

[MIT](LICENSE). The art's typeface is [Barlow](https://github.com/jpt/barlow) ([OFL](plugins/evoke/tools/fonts/OFL.txt)).

Evoke is an unofficial fan project inspired by the menu design of Persona 3 Reload (TIDE) and Persona 5 (REBEL). It is not affiliated with or endorsed by ATLUS or SEGA, and it contains no game assets. Changes are listed in [CHANGELOG.md](CHANGELOG.md).
