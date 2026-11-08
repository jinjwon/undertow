# Evoke

<img src="assets/logo.png" width="96" alt="Evoke logo">

**English** | [한국어](README.ko.md)

An underwater, slanted, game-menu interface for [Claude Code](https://claude.com/claude-code) in [Ghostty](https://ghostty.org). The water runs behind both the transcript and the menu, so the terminal reads as one surface.

<img src="assets/preview.png" width="720" alt="Evoke in Ghostty: the transcript on the left, the SKILL menu on the right">

## Features

- **Nine menus:** each has its own composition and kind of content. Tool calls light up their menu.
- **AI usage HUD:** context, 5-hour and 7-day gauges with reset countdowns, plus session cost. A toast warns at 85%.
- **Skills:** grouped and paged, most used first. `/skillbook` shows them all.
- **Project switcher:** `p` or `/projects` lists your trusted Claude Code projects, most recently used first. Press `1` or Enter to open the top one in a new window.
- **Status band:** session state, project, branch and tool count above the prompt.

## Install

Requires Claude Code. The plugin runs on macOS and Windows; the full look needs macOS and Ghostty, which has no Windows build. For the full look, also install Ghostty, [Iosevka](https://github.com/be5invis/Iosevka) and [Pretendard](https://github.com/orioncactus/pretendard).

### Ghostty (full look)

```sh
git clone https://github.com/jinjwon/undertow.git
undertow/ghostty/install.sh
```

Restart Ghostty. The clone's path may contain spaces, but not quotes, `$`, backticks or backslashes. The installer writes `~/.config/ghostty/evoke.conf` and adds one include line to `~/.config/ghostty/config`.

**Every new Ghostty window then starts Claude Code with the menu.** See [Settings](#settings) to keep a plain shell instead.

### Plugin only

Run this at the Claude Code prompt, then `/menu`. Terminals that cannot draw images get plain rows instead of the art.

```
/plugin install evoke --marketplace jinjwon/undertow
```

### Windows

Use the plugin install above. The menu, HUD, skills and commands appear as plain rows, without the water or art. `/projects` opens projects in Windows Terminal (`wt`).

Windows support is checked by automated tests that simulate Windows. It has not yet been run on a Windows machine, so please report anything that breaks.

### macOS Terminal

```sh
undertow/terminal/install.sh            # add --default to make it the default profile
```

Terminal has no animated water or art, so the menu uses plain rows. This profile also starts Claude Code.

### Desktop app (macOS and Windows)

An editor window in the Evoke look: file tree, Monaco editor, and Claude Code on the right, one live session per project. Needs [Claude Code](https://docs.claude.com/en/docs/claude-code) installed, nothing else.

**Download** from [Releases](https://github.com/jinjwon/undertow/releases/latest): `Evoke-<version>-arm64.dmg` for Apple silicon Macs, `Evoke-<version>-win-x64.zip` for Windows (unzip, run `Evoke.exe`).

Two themes, switched with the chip at the top right, each with its own logo: **TIDE**, deep-sea blue (default), and **REBEL**, red and black with ransom-note headings. A theme is one entry in `desktop/src/themes.ts` plus one block in `desktop/src/style.css`.

To build it yourself:

```sh
cd undertow/desktop && npm install && npm start
npm run dist:mac        # release/Evoke-<version>-arm64.dmg
npm run dist:win        # Windows installer (run on Windows, or on a Mac with Rosetta)
npm run dist:win:zip    # portable Windows zip, builds anywhere
```

Builds are unsigned: on macOS, right-click Evoke.app and choose Open the first time; on Windows, choose More info → Run anyway.

`⌘O` projects (1–9 or Enter) · `⌘S` save · `⌘L` send (Ctrl on Windows) the selection to Claude as `@file#Lx-y`. Open tabs reload from disk when Claude edits them, unless you have unsaved changes.

## Settings

| To change | Do this |
| --- | --- |
| Keep a plain shell in Ghostty | Delete the `command` line from `~/.config/ghostty/evoke.conf` |
| Window size | `window-width` and `window-height` in `evoke.conf`. The docked menu needs at least 110 columns |
| Font | `font-family` and `font-size` in `evoke.conf`. The art lines up with Iosevka at size 14 |
| Add your own image | Put a transparent PNG you have the rights to at `plugins/evoke/hero.png`, then run `plugins/evoke/tools/render.sh` (needs Google Chrome). `hero.png` is git-ignored |

## Commands and shortcuts

| Command | Does |
| --- | --- |
| `/menu` | Open the menu pane |
| `/projects` | Pick a project |
| `/skillbook` | Browse skills by group and pick one |

Give the pane the keyboard with a click or `ctrl+x tab`, then:

| Key | Does |
| --- | --- |
| `1`-`9` | Choose a menu and fill the prompt with its command |
| `j` / `k` | Next / previous menu |
| `e` | Fill the prompt with the current menu's command |
| `n` / `b` | Next / previous page of skills |
| `p` | Open the project picker |
| `s` | Fill the prompt with `/skillbook` |

To click a menu, use its number at the right edge: the slanted names are part of the picture.

## Uninstall and restore

**Ghostty:** delete the `config-file = evoke.conf` line from `~/.config/ghostty/config`, delete `~/.config/ghostty/evoke.conf`, and restart Ghostty.

**Plugin:** run `/plugin uninstall evoke`, or `claude plugin uninstall evoke` in a shell.

**Terminal:** in Terminal > Settings > Profiles, delete the Evoke profile. If you used `--default`, choose another default first.

Delete the cloned folder last: the Ghostty and Terminal setups read their files from it.

## How credits are used

Evoke makes no AI requests of its own. Its code has no model, agent or network calls: the HUD only draws the usage figures Claude Code already holds. Measured with Claude Code 2.1.319 on macOS:

| Setup | AI requests | Result |
| --- | --- | --- |
| Ghostty with the Evoke look and a plain shell (no `command` line) | None | No Claude process and no TCP connections in a 12-second sample |
| zsh | None | Evoke adds nothing to your shell. It loads only inside Claude Code |
| Claude Code + Evoke, opened with `/menu`, no prompt sent | No model reply, session cost $0 | One `quota_check` request at start, the same as without Evoke |
| Claude Code + Evoke, one prompt | Your prompt only | First request 29,175 context tokens with and without Evoke, in 3 of 3 pairs |

The `quota_check` request belongs to Claude Code and happens on every start. We have not verified whether it counts against your plan.

- **Using Claude Code still uses your plan.** Ghostty's `command` line starts Claude Code, but nothing is sent to a model until you send a prompt.
- **Not measured:** the `/menu` confirmation line, which is short text in the transcript that Claude Code can include in later requests.
- **Other skills are separate.** Installing a skill is not the same as running it. For example, invoking the Ponytail skill added 1,557 context tokens to that request.

## License and notice

[MIT](LICENSE). The art's typeface is [Barlow](https://github.com/jpt/barlow) ([OFL](plugins/evoke/tools/fonts/OFL.txt)).

Evoke is an unofficial fan project inspired by the menu design of Persona 3 Reload. It is not affiliated with or endorsed by ATLUS or SEGA, and it contains no game assets. To report a vulnerability, see [SECURITY.md](SECURITY.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).
