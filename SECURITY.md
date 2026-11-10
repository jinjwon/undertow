# Security Policy

## Reporting a vulnerability

Report privately through [GitHub Security Advisories](https://github.com/jinjwon/undertow/security/advisories/new). Do not open a public issue.

Include the affected file, how to reproduce the problem, and what an attacker could do. Evoke is a personal project, so response times are best effort.

## Supported versions

Only the latest release gets fixes.

## What Evoke does on your machine

### The desktop app

- **Network and AI:** none of its own. The CLAUDE pane runs your installed `claude`, which talks to Anthropic as it does anywhere; the CODEX tab runs your installed `codex`, which talks to OpenAI; a server tab runs `ssh` to the host you clicked.
- **Programs it starts:** `claude`, `codex` and your shell (`$SHELL`, or PowerShell on Windows) in the project folder, `git` with argument lists, and `ssh <host>` only for a host named in `~/.ssh/config` (patterns and names starting with `-` are refused). A resumed session id must be a UUID before it reaches the command line.
- **Files read:** files inside the projects you open; `~/.claude.json` (trusted projects, MCP servers), `~/.claude/history.jsonl`, `~/.claude/projects/<project>/*.jsonl` (session titles and dates), `~/.claude/skills`, `~/.claude/settings.json`, `~/.claude/plugins/installed_plugins.json`, the Evoke plugin's store files, `~/.ssh/config` (host names only), and `~/.codex/config.toml` (the paths of the projects Codex trusts).
- **Files written:** only files you save in the editor.
- **Preview server:** previews are served by a web server inside the app, started with the first preview. It listens on `127.0.0.1` only, on a random port. Every address carries a secret made at start, the `Host` header must be the server's own, and only files inside the open projects are served, with symlinks resolved first. A previewed page runs its own scripts and may load what it asks for from the network; it runs in a frame of another origin and cannot reach the app or leave the preview server. Scripts inside a rendered Markdown file are blocked.
- **Boundaries:** the window can open only folders Claude Code or Codex trusts, or that you picked in the folder dialog. File access resolves symlinks first and must stay inside an open project. The page is sandboxed and cannot navigate away or open windows.

### The plugin

- **Network and AI:** none of its own.
- **Local commands:** it runs `git`, and `open` or `wt` when you pick a project, with argument lists, never through a shell.
- **Files read:** `~/.claude.json` and `~/.claude/history.jsonl`, when you open the project picker. Only paths and times are kept.
- **Files written:** skill use counts and the last usage figures, in Claude Code's plugin store.
- **Background work:** one in-process timer redraws the date each minute. There are no daemons.

Tool commands appear in the menu pane just as they do in the transcript, so anything secret typed into a command is visible there too.
