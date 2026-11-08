# Changelog

## 2.0.0 - 2026-11-08

Evoke is now the desktop app. The terminal setups are retired.

### Added

- **MENU pane:** the terminal pane's nine menus, art, cut-ins and HUD, as the app's left column. SKILL puts a skill in Claude's prompt, ITEM shows files, EQUIP lists MCP servers and plugins, AGENT resumes past sessions, STATUS diffs changes, QUEST lists TODOs, LINK switches projects, CALENDAR shows the days you worked with Claude, SYSTEM holds theme and keys. A toast warns at 85% usage.
- **Editor:** completion, errors and formatting for TS/JS, JSON, CSS and HTML; format on save; bracket colors and guides; matching HTML tags rename together.
- `⌘P` quick open and `⌘⇧F` project search.
- Git changes with a diff against the last commit.
- A SHELL pane next to CLAUDE, one per project.
- File badges in the tree.
- Windows installer with Start menu and desktop shortcuts, built by GitHub Actions.

### Changed

- The plugin saves its usage figures, so the app's HUD shows them. Update the plugin to get them.
- Each installer carries only its own platform's terminal module.

### Removed

- The Ghostty and Terminal.app setups (`ghostty/`, `terminal/`). The plugin still works in any terminal.

## 1.8.0 - 2026-11-08

### Added

- A logo per theme: the blue clock tower for TIDE, the masked terminal for REBEL. TIDE's is the app icon.
- REBEL has its own interface now: ransom-note headings, white slabs with red shadows for selection, a tilted date card, and a halftone corner.

### Security

- The window can only open folders Claude Code already trusts or that you chose in the folder dialog. Before, a bug in the page could have opened any folder.
- File access follows symlinks to their real path, so a link inside a project cannot read or write a file outside it.
- The page runs sandboxed and cannot open new windows or navigate away.

## 1.7.0 - 2026-11-08

### Added

- Evoke desktop app for macOS and Windows: file tree, Monaco editor and Claude Code side by side, one live session per project, `⌘O` project picker, `⌘L` sends the selection to Claude as `@file#Lx-y`.
- Two themes: TIDE (deep-sea blue, default) and REBEL (red and black), switched from the top bar and remembered.
- A date and time plate in the top bar; selections slide in as slanted bars.

### Notes

- Builds are unsigned. Windows build is a portable zip, built on macOS and not yet run on a Windows machine.

## 1.6.0 - 2026-11-06

### Changed

- Renamed the project from Undertow to Evoke, with a new `>-` logo. The plugin, its pane and the Ghostty files take the new name.
- Skill use counts start again, because they are stored under the plugin's name.

### Upgrade

- Delete `~/.config/ghostty/undertow.conf` and its `config-file` line, then run `ghostty/install.sh` again.

## 1.5.2 - 2026-11-06

### Changed

- The project picker lists the most recently used project first and the open one last. Enter or `1` opens the top one.
- `p` opens the picker directly instead of filling the prompt.
- Picking the project you are already in closes the picker instead of opening a second window.

## 1.5.1 - 2026-11-06

### Added

- Windows support for the plugin: plain-row menu, and `/projects` opens Windows Terminal. Tested by simulation, not yet on a Windows machine.

### Fixed

- The plugin no longer depends on `printenv` and `test`, and starts without git.
- Removed background lines that could cross text in the menu's footer and the prompt.

## 1.5.0 - 2026-11-06

### Changed

- Redesigned the interface: water now runs behind the transcript and the menu, and each of the nine menus has its own composition and content layout.
- Rebuilt the HUD with aligned underline gauges.
- Skills are now grouped and paged. `n` and `b` turn the page.
- The Ghostty installer now sets the fonts and window size, and loads the plugin from the clone.

### Fixed

- Closing the skillbook and project panes after a pick now uses the correct call.
- Tool chips no longer wrap when space is tight.
- The Terminal profile now works from a folder whose path has spaces or quotes.
- Control characters in tool input no longer reach the terminal through the menu pane.
- The Ghostty installer now refuses a folder path that would break or inject into its launch command.

## 1.3.0

### Changed

- Restyled Undertow and listed skills in the menu.
- Removed the music player from the install.

## 1.0.0

### Added

- First version: menu, project switcher, AI usage meters and music player.
