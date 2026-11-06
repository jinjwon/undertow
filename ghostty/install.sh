#!/bin/zsh
# Writes the Evoke look to ~/.config/ghostty/evoke.conf and includes it once. Delete that line to undo.
# Every new Ghostty window then starts Claude Code with the menu; remove the `command` line from evoke.conf for a plain shell with the same look.
set -e
R="${0:a:h:h}"; D="$HOME/.config/ghostty"
# The path goes inside a quoted shell command below: a quote, $, ` or \\ in it would break or inject into that command.
[[ "$R" != *[\'\"\$\`\\]* ]] || { echo "Move Evoke to a folder whose path has no quotes, \$, \` or backslashes: $R" >&2; exit 1; }
mkdir -p "$D"
cat > "$D/evoke.conf" <<CONF
title = Evoke
font-family = Iosevka
font-family = Pretendard
font-style = Medium
font-style-italic = Medium Oblique
font-style-bold = Heavy Oblique
font-style-bold-italic = Heavy Oblique
font-size = 14
background = #0B1648
foreground = #FFFFFF
cursor-color = #E8101E
selection-background = #FFFFFF
selection-foreground = #E8101E
window-width = 170
window-height = 50
window-padding-x = 6
macos-titlebar-style = transparent
custom-shader = $R/ghostty/evoke.glsl
custom-shader-animation = true
background-image = $R/ghostty/background.png
background-image-fit = cover
command = /bin/zsh -lc "claude --plugin-dir '$R/plugins/evoke' /menu; exec zsh"
CONF
grep -qs 'config-file = evoke.conf' "$D/config" || echo 'config-file = evoke.conf' >> "$D/config"
echo "Evoke look installed. Restart Ghostty."
