#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD="$SCRIPT_DIR/run.sh --toggle"
BINDING="<Super>v"
NAME="Antigravity Clipboard"

echo "Setting up global shortcut ($BINDING) for Clipboard..."

# Get current bindings
CURRENT=$(gsettings get org.gnome.settings-daemon.plugins.media-keys custom-keybindings)
PATH_ENTRY="/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/antigravity-clipboard/"

if [[ "$CURRENT" != *"$PATH_ENTRY"* ]]; then
    # Add path to custom-keybindings list
    if [[ "$CURRENT" == "@as []" || "$CURRENT" == "[]" ]]; then
        NEW_LIST="['$PATH_ENTRY']"
    else
        NEW_LIST="${CURRENT%]*}, '$PATH_ENTRY']"
    fi
    gsettings set org.gnome.settings-daemon.plugins.media-keys custom-keybindings "$NEW_LIST"
fi

# Set custom keybinding attributes
gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:$PATH_ENTRY name "$NAME"
gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:$PATH_ENTRY command "$CMD"
gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:$PATH_ENTRY binding "$BINDING"

echo "Done! Press Super+V anytime to open or toggle your clipboard!"
