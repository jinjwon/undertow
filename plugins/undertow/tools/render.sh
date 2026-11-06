#!/bin/zsh
# Renders every menu's full-pane composition to scenes/<MENU>_<frame>.png with headless Chrome, transparent where the water shows.
# Put your own transparent PNG at hero.png to stand it in the stage's left third, then run this again. Usage: render.sh [frames...]
cd "${0:a:h}/.."; frames=($@); (( $#frames )) || frames=(25 50 75 90 100); P=$(mktemp -d); hero=""; [ -f hero.png ] && hero="&hero=1"
for m in SKILL ITEM EQUIP AGENT STATUS QUEST LINK CALENDAR SYSTEM; do for t in $frames; do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$P/$m$t" --force-device-scale-factor=1 --window-size=840,1538 --default-background-color=00000000 --allow-file-access-from-files --virtual-time-budget=1500 --screenshot="$PWD/scenes/${m}_$t.png" "file://$PWD/tools/scene.html?menu=$m&t=$(echo "scale=2;$t/100"|bc)$hero" >/dev/null 2>&1 &
done; wait; done; rm -rf "$P"
