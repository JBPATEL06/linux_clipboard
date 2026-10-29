/**
 * Extension entrypoint for Antigravity Clipboard
 * Seamless GNOME Shell 45 - 50.1 integration with native Super+V shortcut.
 */
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import { ClipboardManager } from './clipboardManager.js';
import { ClipboardPopup } from './ui/popup.js';

export default class ClipboardExtension extends Extension {
    enable() {
        try {
            this._settings = this.getSettings();
            this._manager = new ClipboardManager(this._settings);
            this._manager.startMonitoring();
            this._popup = new ClipboardPopup(this._manager, this._settings);

            // Register native Super+V keybinding
            Main.wm.addKeybinding(
                'shortcut',
                this._settings,
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.ALL,
                () => {
                    this._popup.toggle();
                }
            );

            console.log('[Clipboard] Extension enabled successfully! Press Super+V to toggle.');
        } catch (e) {
            console.error(`[Clipboard] Error enabling extension: ${e}`);
        }
    }

    disable() {
        try {
            Main.wm.removeKeybinding('shortcut');

            if (this._popup) {
                this._popup.close();
                this._popup.destroy();
                this._popup = null;
            }

            if (this._manager) {
                this._manager.stopMonitoring();
                this._manager = null;
            }

            this._settings = null;
            console.log('[Clipboard] Extension disabled cleanly.');
        } catch (e) {
            console.error(`[Clipboard] Error disabling extension: ${e}`);
        }
    }
}
