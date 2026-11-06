# Security Policy

## Reporting a vulnerability

Report privately through [GitHub Security Advisories](https://github.com/jinjwon/undertow/security/advisories/new). Do not open a public issue.

Include the affected file, how to reproduce the problem, and what an attacker could do. Undertow is a personal project, so response times are best effort.

## Supported versions

Only the latest release gets fixes.

## What Undertow does on your machine

- **Network:** Undertow makes no network requests of its own.
- **AI:** it makes no model or agent calls of its own.
- **Local commands:** it runs `git`, and `open` or `wt` when you pick a project, with argument lists, never through a shell.
- **Files read:** `~/.claude.json`, when you run `/projects`, to list your trusted projects. Only the paths are kept.
- **Files written:** skill use counts in Claude Code's plugin store. The Ghostty installer writes `~/.config/ghostty/undertow.conf` and adds one line to `~/.config/ghostty/config`.
- **Background work:** one in-process timer redraws the date each minute. There are no daemons.

Tool commands appear in the menu pane just as they do in the transcript, so anything secret typed into a command is visible there too.
