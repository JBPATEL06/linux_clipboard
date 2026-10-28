#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTOSTART_DIR="$HOME/.config/autostart"
APPS_DIR="$HOME/.local/share/applications"

mkdir -p "$AUTOSTART_DIR" "$APPS_DIR"

DESKTOP_FILE="$APPS_DIR/clipboard-linux.desktop"

cat <<EOF > "$DESKTOP_FILE"
[Desktop Entry]
Name=Clipboard
Comment=Modern Smart Clipboard Manager
Exec=$SCRIPT_DIR/run.sh
Icon=edit-paste
Terminal=false
Type=Application
Categories=Utility;
EOF

chmod +x "$DESKTOP_FILE"

# Autostart copy
cp "$DESKTOP_FILE" "$AUTOSTART_DIR/"

echo "Installed desktop entry and autostart entry successfully!"
