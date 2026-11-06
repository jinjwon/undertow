#!/bin/zsh -l
# Starts Claude Code with the Evoke menu for the "Evoke" Terminal.app profile.
unset CLAUDE_CODE_CHILD_SESSION
export PATH="$HOME/.local/bin:$PATH" COLORTERM=truecolor CLAUDE_CODE_FORCE_SESSION_PERSISTENCE=1
claude --plugin-dir "${0:a:h:h}/plugins/evoke" /menu
exec zsh
