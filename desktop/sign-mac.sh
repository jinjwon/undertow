#!/bin/sh
# Without a valid signature macOS calls a downloaded app "damaged". Sign a clean copy: files under
# ~/Desktop carry extended attributes that make codesign fail. Ad-hoc only, so first launch still needs Open.
set -e
T=$(mktemp -d)
ditto --norsrc --noextattr release/mac-arm64/Evoke.app "$T/Evoke.app"
codesign --force --deep --sign - "$T/Evoke.app"
codesign --verify --deep --strict "$T/Evoke.app"
npx electron-builder --mac dmg --prepackaged "$T/Evoke.app"
