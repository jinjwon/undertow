#!/bin/zsh
# Writes the Undertow look to ~/.config/ghostty/undertow.conf and includes it once. Delete that line to undo.
set -e
R="${0:a:h:h}"; D="$HOME/.config/ghostty"; mkdir -p "$D"
cat > "$D/undertow.conf" <<CONF
font-size = 14
background = #0A1E8C
foreground = #FFFFFF
cursor-color = #FF2E88
selection-background = #FFFFFF
selection-foreground = #E8101E
title = Undertow
macos-titlebar-style = transparent
custom-shader = $R/ghostty/undertow.glsl
custom-shader-animation = true
background-image = $R/ghostty/background.png
background-image-fit = cover
macos-icon = custom
macos-custom-icon = $R/assets/logo.png
command = /bin/zsh -lc "claude /menu; exec zsh"
CONF
grep -qs 'config-file = undertow.conf' "$D/config" || echo 'config-file = undertow.conf' >> "$D/config"
echo "Undertow look installed. Restart Ghostty."
