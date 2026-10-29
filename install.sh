#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR/extension"
UUID="linuxclip@jbpatel06.github.com"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"
OLD_DEST="$HOME/.local/share/gnome-shell/extensions/clipboard@antigravity.org"

echo "Building and packaging LinuxClip GNOME Shell Extension..."
cd "$EXT_DIR"
gnome-extensions pack --force --extra-source=clipboardManager.js --extra-source=ui

# Clean up legacy Antigravity directory if present
if [ -d "$OLD_DEST" ]; then
    echo "Cleaning up legacy extension folder..."
    rm -rf "$OLD_DEST"
fi

echo "Installing extension to $DEST..."
rm -rf "$DEST"
mkdir -p "$DEST"
unzip -q -o "$EXT_DIR/$UUID.shell-extension.zip" -d "$DEST"
glib-compile-schemas "$DEST/schemas/"

echo "Enabling LinuxClip extension in GNOME settings..."
python3 -c "
import subprocess, ast
curr = subprocess.check_output(['gsettings', 'get', 'org.gnome.shell', 'enabled-extensions'], text=True).strip()
lst = ast.literal_eval(curr)
if 'clipboard@antigravity.org' in lst:
    lst.remove('clipboard@antigravity.org')
if '$UUID' not in lst:
    lst.append('$UUID')
subprocess.run(['gsettings', 'set', 'org.gnome.shell', 'enabled-extensions', str(lst)])
"

echo "=========================================================="
echo "LinuxClip extension installed and enabled successfully!"
echo "If this is the first installation on Wayland, please log out"
echo "and log back in (or press Alt+F2 -> r on X11) so GNOME Shell"
echo "loads the newly registered extension."
echo "Shortcut: Press Super+V to open where the cursor is."
echo "=========================================================="
