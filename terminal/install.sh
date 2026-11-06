#!/bin/zsh
# Adds the Undertow profile to Terminal.app. With --default, new windows open in it.
set -e
R="${0:a:h:h}"; F="$(mktemp -d)/Undertow.terminal"
swift "$R/terminal/profile.swift" "$F" "$R"
osascript -e 'tell application "Terminal" to if (name of settings sets) contains "Undertow" then delete settings set "Undertow"'
osascript -e "tell application \"Terminal\" to open POSIX file \"$F\""
if [[ "$1" == --default ]]; then
  osascript -e 'tell application "Terminal" to set default settings to settings set "Undertow"' \
            -e 'tell application "Terminal" to set startup settings to settings set "Undertow"'
  echo "Undertow is now the default. Undo it in Terminal > Settings > Profiles."
fi
echo "Undertow profile installed."
