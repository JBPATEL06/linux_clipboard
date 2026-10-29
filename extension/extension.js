/**
 * Extension entrypoint for LinuxClip
 * Seamless GNOME Shell 45 - 50.1 integration with native Super+V shortcut.
 */
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import { ClipboardManager } from './clipboardManager.js';
import { ClipboardPopup } from './ui/popup.js';

export default class LinuxClipExtension extends Extension {
    enable() {
        try {
            console.log('[LinuxClip] Step 1: getSettings...');
            this._settings = this.getSettings();
            console.log('[LinuxClip] Step 2: ClipboardManager...');
            this._manager = new ClipboardManager(this._settings);
            console.log('[LinuxClip] Step 3: startMonitoring...');
            this._manager.startMonitoring();
            console.log('[LinuxClip] Step 4: ClipboardPopup...');
            this._popup = new ClipboardPopup(this._manager, this._settings);

            console.log('[LinuxClip] Step 5: addKeybinding...');
            const keyName = this._settings.list_keys().includes('toggle-clipboard')
                ? 'toggle-clipboard'
                : 'shortcut';
            this._boundKeyName = keyName;

            Main.wm.addKeybinding(
                keyName,
                this._settings,
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                () => {
                    if (this._popup) {
                        this._popup.toggle();
                    }
                }
            );

            console.log(`[LinuxClip] Extension enabled successfully! Bound key '${keyName}'. Press Super+V to toggle.`);
        } catch (e) {
            console.error(`[LinuxClip] Error enabling extension: ${e}\nStack: ${e.stack}`);
        }
    }

    disable() {
        try {
            if (this._boundKeyName) {
                Main.wm.removeKeybinding(this._boundKeyName);
                this._boundKeyName = null;
            } else {
                Main.wm.removeKeybinding('toggle-clipboard');
                Main.wm.removeKeybinding('shortcut');
            }

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
            console.log('[LinuxClip] Extension disabled cleanly.');
        } catch (e) {
            console.error(`[LinuxClip] Error disabling extension: ${e}`);
        }
    }
}
