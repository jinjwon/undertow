# Undertow

<img src="assets/logo.png" width="96" alt="Undertow logo">

A slanted, cobalt, game-menu look for [Claude Code](https://claude.com/claude-code) in [Ghostty](https://ghostty.org), with a project switcher, AI usage meters and a hardware-style Spotify player.

<img src="assets/preview.png" width="480" alt="The Undertow menu">

## What it does

- **Menu:** nine menus, each with its own full composition. Tool calls light up their menu.
- **Project switcher:** `/projects` lists your trusted Claude Code projects and opens one in a new window.
- **AI usage:** context, 5-hour and 7-day limits, and session cost, updated as you work.
- **Player:** album art, seek bar, play controls and volume, driven by the Spotify desktop app. Spotify stays in the background.
- **Status line:** session state, project, git branch and tool count above the prompt.

## Install

Requires macOS. The player needs the Spotify desktop app, signed in. Run these at the Claude Code prompt:

```
/plugin install undertow --marketplace jinjwon/undertow
/plugin install undertow-player --marketplace jinjwon/undertow
```

For the full-window look, clone this repository and run `ghostty/install.sh`, then restart Ghostty.

## Commands

| Command | Does |
| --- | --- |
| `/menu` | Open the menu pane |
| `/projects` | Pick a project |
| `/bgm` | Play. Also `pause`, `next`, `prev`, `now`, `vol 0-100`, `seek +10` |
| `/bgm on`, `/bgm off` | Turn autoplay on launch on or off |

In the menu pane: `1`-`9` choose a menu, `j`/`k` move, `e` runs, `p` opens projects.

## Your own image

Put a transparent PNG you have the rights to at `plugins/undertow/hero.png` and run `plugins/undertow/tools/render.sh` (needs Google Chrome). It is placed beside the menu, uncropped. `hero.png` is git-ignored: do not redistribute images you do not have the rights to share.

## Notes

- The player's default album is set by `ALBUM` in `plugins/undertow-player/hooks/register.tsx`. Music streams through your own Spotify account; none is included here.
- Album art is fetched only from Spotify's image host and cached in `plugins/undertow-player/.art`.
- With several windows open, closing one pauses the music.
- The menu's slanted style is inspired by stylish JRPG interfaces. Undertow is an unofficial fan project, is not affiliated with or endorsed by any game publisher, and contains no game assets.

## License

[MIT](LICENSE)
