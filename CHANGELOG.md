# Changelog

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
