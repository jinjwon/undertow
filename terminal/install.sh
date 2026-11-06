#!/bin/zsh
# Adds the Evoke profile to Terminal.app. With --default, new windows open in it.
set -e
R="${0:a:h:h}"; F="$(mktemp -d)/Evoke.terminal"
swift "$R/terminal/profile.swift" "$F" "$R"
osascript -e 'tell application "Terminal" to if (name of settings sets) contains "Evoke" then delete settings set "Evoke"'
osascript -e "tell application \"Terminal\" to open POSIX file \"$F\""
if [[ "$1" == --default ]]; then
  osascript -e 'tell application "Terminal" to set default settings to settings set "Evoke"' \
            -e 'tell application "Terminal" to set startup settings to settings set "Evoke"'
  echo "Evoke is now the default. Undo it in Terminal > Settings > Profiles."
fi
echo "Evoke profile installed."
