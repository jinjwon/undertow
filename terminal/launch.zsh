#!/bin/zsh -l
# Starts Claude Code with the Undertow menu for the "Undertow" Terminal.app profile.
unset CLAUDE_CODE_CHILD_SESSION
export PATH="$HOME/.local/bin:$PATH" COLORTERM=truecolor CLAUDE_CODE_FORCE_SESSION_PERSISTENCE=1
claude --plugin-dir "${0:a:h:h}/plugins/undertow" /menu
exec zsh
