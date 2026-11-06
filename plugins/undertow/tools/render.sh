#!/bin/zsh
# Put your own transparent PNG at hero.png to replace the drawn figure, then run this again.
# Renders every menu's scene to scenes/<MENU>_<frame>.png with headless Chrome. Usage: render.sh [frames...]
cd "${0:a:h}/.."; frames=($@); (( $#frames )) || frames=(30 55 80 100); P=$(mktemp -d); hero=""; [ -f hero.png ] && hero="&hero=1"
for m in SKILL ITEM EQUIP AGENT STATUS QUEST LINK CALENDAR SYSTEM; do for t in $frames; do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$P/$m$t" --force-device-scale-factor=1 --window-size=1400,1500 --allow-file-access-from-files --virtual-time-budget=1500 --screenshot="$PWD/scenes/${m}_$t.png" "file://$PWD/tools/scene.html?menu=$m&t=$(echo "scale=2;$t/100"|bc)$hero" >/dev/null 2>&1 &
done; wait; done; rm -rf "$P"
