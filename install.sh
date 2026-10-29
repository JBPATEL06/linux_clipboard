#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR/extension"
DEST="$HOME/.local/share/gnome-shell/extensions/clipboard@antigravity.org"

echo "Building and packaging GNOME Shell Extension..."
cd "$EXT_DIR"
gnome-extensions pack --force --extra-source=clipboardManager.js --extra-source=ui

echo "Installing extension to $DEST..."
rm -rf "$DEST"
mkdir -p "$DEST"
unzip -q -o "$EXT_DIR/clipboard@antigravity.org.shell-extension.zip" -d "$DEST"
glib-compile-schemas "$DEST/schemas/"

echo "Enabling extension in GNOME settings..."
python3 -c "
import subprocess, ast
curr = subprocess.check_output(['gsettings', 'get', 'org.gnome.shell', 'enabled-extensions'], text=True).strip()
lst = ast.literal_eval(curr)
if 'clipboard@antigravity.org' not in lst:
    lst.append('clipboard@antigravity.org')
    subprocess.run(['gsettings', 'set', 'org.gnome.shell', 'enabled-extensions', str(lst)])
"

echo "=========================================================="
echo "Extension installed and enabled successfully!"
echo "If this is the first installation on Wayland, please log out"
echo "and log back in (or press Alt+F2 -> r on X11) so GNOME Shell"
echo "loads the newly registered extension."
echo "Shortcut: Press Super+V to open where the cursor is."
echo "=========================================================="
