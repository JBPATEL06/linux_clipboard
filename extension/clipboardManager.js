/**
 * ClipboardManager for Antigravity Clipboard
 * Handles clipboard monitoring, persistence, categorization, and synthetic pasting.
 */
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

const DATA_DIR = GLib.build_filenamev([GLib.get_user_data_dir(), 'clipboard_linux']);
const IMAGE_DIR = GLib.build_filenamev([DATA_DIR, 'images']);
const DB_FILE = GLib.build_filenamev([DATA_DIR, 'history.json']);

const NAMED_COLORS = {
    "#F85E2A": "Ubuntu Warm Primary",
    "#E95420": "Ubuntu Orange",
    "#77216F": "Ubuntu Aubergine",
    "#5E2750": "Ubuntu Dark Aubergine",
    "#007AFF": "Apple Blue",
    "#0A84FF": "macOS Accent Blue",
    "#34C759": "System Green",
    "#FF9500": "System Orange",
    "#FF3B30": "System Red",
    "#AF52DE": "System Purple",
    "#5856D6": "System Indigo",
    "#1E1E1E": "Dark Charcoal",
    "#FFFFFF": "White",
    "#000000": "Black"
};

export class ClipboardManager {
    constructor(settings) {
        this.settings = settings;
        this.items = [];
        this._ownerChangedId = 0;
        this._lastHash = '';
        this._lastFocusedWindow = null;
        this._virtualKeyboard = null;
        this._isInternalCopy = false;

        this._ensureDirectories();
        this._loadHistory();
        this._initVirtualKeyboard();
    }

    _ensureDirectories() {
        GLib.mkdir_with_parents(IMAGE_DIR, 0o755);
    }

    _initVirtualKeyboard() {
        try {
            const seat = Clutter.get_default_backend().get_default_seat();
            if (seat && typeof seat.create_virtual_device === 'function') {
                this._virtualKeyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
            }
        } catch (e) {
            console.error(`[Clipboard] Failed to initialize virtual keyboard: ${e}`);
        }
    }

    startMonitoring() {
        try {
            const display = global.display;
            const selection = display.get_selection();
            this._ownerChangedId = selection.connect('owner-changed', (sel, type) => {
                if (type === Meta.SelectionType.SELECTION_CLIPBOARD) {
                    if (this._isInternalCopy) {
                        this._isInternalCopy = false;
                        return;
                    }
                    this._readClipboard();
                }
            });
        } catch (e) {
            console.error(`[Clipboard] Failed to start selection monitoring: ${e}`);
        }
    }

    stopMonitoring() {
        if (this._ownerChangedId > 0) {
            const selection = global.display.get_selection();
            selection.disconnect(this._ownerChangedId);
            this._ownerChangedId = 0;
        }
    }

    saveCurrentFocus() {
        try {
            this._lastFocusedWindow = global.display.focus_window;
        } catch (e) {
            this._lastFocusedWindow = null;
        }
    }

    _loadHistory() {
        try {
            const file = Gio.File.new_for_path(DB_FILE);
            if (file.query_exists(null)) {
                const [success, contents] = file.load_contents(null);
                if (success) {
                    const text = new TextDecoder('utf-8').decode(contents);
                    this.items = JSON.parse(text);
                }
            }
        } catch (e) {
            this.items = [];
        }

        // Seed initial items if completely empty
        if (!this.items || this.items.length === 0) {
            this._seedInitialMockItems();
        }
    }

    _saveHistory() {
        try {
            const maxHistory = this.settings ? this.settings.get_int('history-size') : 100;
            if (this.items.length > maxHistory) {
                this.items = this.items.slice(0, maxHistory);
            }
            const jsonStr = JSON.stringify(this.items, null, 2);
            const file = Gio.File.new_for_path(DB_FILE);
            file.replace_contents(
                new TextEncoder().encode(jsonStr),
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (e) {
            console.error(`[Clipboard] Failed to save history: ${e}`);
        }
    }

    _seedInitialMockItems() {
        this.items = [
            {
                id: 'mock-1',
                type: 'text',
                title: 'Welcome to macOS styled Clipboard',
                subtitle: 'Copied text • Just now',
                content: 'Welcome to macOS styled Clipboard! Press 1-5 to paste.',
                created_at: new Date().toISOString()
            },
            {
                id: 'mock-2',
                type: 'code',
                title: 'settings.ini',
                subtitle: 'Configuration • Just now',
                content: 'hide__main_window__in__task_bar = true\nkeep_on_top = true\nanimate_cards = true\nresponsive_display = true\nopen_at_cursor = true',
                lines: ['hide__main_window__in__task_bar = true', 'keep_on_top = true', 'animate_cards = true', 'responsive_display = true', 'open_at_cursor = true'],
                total_lines: 5,
                fileName: 'settings.ini',
                created_at: new Date().toISOString()
            },
            {
                id: 'mock-3',
                type: 'file',
                title: 'Screen_shaking_issue.webm',
                subtitle: 'Video file',
                fileSize: '1.3 MB',
                filePath: '/home/jeel/Projects/clipboard_linux/bugs/Screen_shaking_issue.webm',
                iconName: 'video-x-generic',
                created_at: new Date().toISOString()
            },
            {
                id: 'mock-4',
                type: 'color',
                title: '#0A84FF',
                subtitle: 'macOS Accent Blue • Just now',
                hex: '#0A84FF',
                colorName: 'macOS Accent Blue',
                content: '#0A84FF',
                created_at: new Date().toISOString()
            },
            {
                id: 'mock-5',
                type: 'command',
                title: 'git push origin main',
                subtitle: 'Terminal command • Just now',
                content: 'git push origin main',
                created_at: new Date().toISOString()
            }
        ];
        this._saveHistory();
    }

    _readClipboard() {
        St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
            if (!text || !text.trim()) return;

            const h = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, text, -1);
            if (h === this._lastHash) return;
            this._lastHash = h;

            this._handleIncomingText(text);
        });
    }

    _handleIncomingText(rawText) {
        const text = rawText.trim();
        const nowStr = this._formatTimestamp();
        let item = null;

        // 1. Check if it's a File URI (file:///...)
        if (text.startsWith('file://')) {
            item = this._parseFileUri(text, nowStr);
        }

        // 2. Check if it's a HEX Color
        if (!item && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(text)) {
            const hex = text.toUpperCase();
            const colorName = NAMED_COLORS[hex] || 'Custom Color';
            item = {
                id: GLib.uuid_string_random(),
                type: 'color',
                title: hex,
                subtitle: `${colorName} • ${nowStr}`,
                hex: hex,
                colorName: colorName,
                content: hex,
                created_at: new Date().toISOString()
            };
        }

        // 3. Check if it's a Terminal command
        if (!item) {
            const prefixes = ['curl ', 'sudo ', 'apt ', 'git ', 'docker ', 'npm ', 'pip ', 'yarn ', 'ssh ', 'systemctl ', 'ls ', 'cd ', 'cat '];
            const isCli = prefixes.some(p => text.startsWith(p)) || (text.includes('|') && text.length < 200 && !text.includes('\n'));
            if (isCli) {
                const firstLine = text.split('\n')[0];
                item = {
                    id: GLib.uuid_string_random(),
                    type: 'command',
                    title: firstLine,
                    subtitle: `Terminal command • ${nowStr}`,
                    content: text,
                    created_at: new Date().toISOString()
                };
            }
        }

        // 4. Check if it's a Code block
        if (!item) {
            const lines = text.split('\n');
            const codeKeywords = ['def ', 'class ', 'function', 'const ', 'let ', 'var ', 'import ', 'return ', '{', '}', '=>', '#include', '<?php'];
            const hasKeywords = codeKeywords.some(kw => text.includes(kw));
            if ((lines.length > 1 && hasKeywords) || lines.length >= 3) {
                // Extract file name from first line if available (e.g. // script.js or # main.py)
                let fileName = 'Code Snippet';
                const first = lines[0].trim();
                if (first.startsWith('//') || first.startsWith('#') || first.startsWith('/*')) {
                    const match = first.match(/[\w-]+\.\w+/);
                    if (match) fileName = match[0];
                }

                // Strictly first 5 lines as requested
                const previewLines = lines.slice(0, 5);
                item = {
                    id: GLib.uuid_string_random(),
                    type: 'code',
                    title: fileName,
                    subtitle: `${fileName} • ${nowStr}`,
                    fileName: fileName,
                    lines: previewLines,
                    total_lines: lines.length,
                    content: text,
                    created_at: new Date().toISOString()
                };
            }
        }

        // 5. Default Plain / Rich Text with Emoji support
        if (!item) {
            const firstLine = text.split('\n')[0];
            const title = firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine;
            item = {
                id: GLib.uuid_string_random(),
                type: 'text',
                title: title,
                subtitle: `Copied text • ${nowStr}`,
                content: text,
                created_at: new Date().toISOString()
            };
        }

        if (item) {
            this.addItem(item);
        }
    }

    _parseFileUri(uriString, nowStr) {
        try {
            const uris = uriString.split(/[\r\n]+/).filter(u => u.startsWith('file://'));
            if (uris.length === 0) return null;

            const uri = uris[0];
            const file = Gio.File.new_for_uri(uri);
            const path = file.get_path();
            if (!file.query_exists(null)) return null;

            const info = file.query_info('standard::display-name,standard::size,standard::icon,standard::content-type', Gio.FileQueryInfoFlags.NONE, null);
            const name = info.get_display_name() || file.get_basename();
            const sizeBytes = info.get_size();
            const sizeStr = this._formatBytes(sizeBytes);
            const contentType = info.get_content_type();

            let iconName = 'text-x-generic';
            if (contentType) {
                if (contentType.startsWith('image/')) iconName = 'image-x-generic';
                else if (contentType.startsWith('video/')) iconName = 'video-x-generic';
                else if (contentType.startsWith('audio/')) iconName = 'audio-x-generic';
                else if (contentType.includes('archive') || contentType.includes('zip') || contentType.includes('tar')) iconName = 'package-x-generic';
                else if (file.query_file_type(Gio.FileQueryInfoFlags.NONE, null) === Gio.FileType.DIRECTORY) iconName = 'folder';
            }

            return {
                id: GLib.uuid_string_random(),
                type: 'file',
                title: name,
                subtitle: `File • ${nowStr}`,
                filePath: path,
                fileUri: uri,
                fileSize: sizeStr,
                iconName: iconName,
                content: uriString,
                created_at: new Date().toISOString()
            };
        } catch (e) {
            return null;
        }
    }

    addImageItem(filePath, format = 'PNG', width = 0, height = 0, isGif = false) {
        const nowStr = this._formatTimestamp();
        const file = Gio.File.new_for_path(filePath);
        const info = file.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null);
        const sizeStr = this._formatBytes(info.get_size());

        const item = {
            id: GLib.uuid_string_random(),
            type: 'image',
            title: isGif ? 'Animated GIF' : `Image Preview (${format})`,
            subtitle: `${format} • ${width > 0 ? `${width}×${height} • ` : ''}${sizeStr}`,
            filePath: filePath,
            format: format,
            isGif: isGif,
            fileSize: sizeStr,
            content: filePath,
            created_at: new Date().toISOString()
        };
        this.addItem(item);
    }

    addItem(item) {
        // Prepend new item
        this.items.unshift(item);
        this._saveHistory();
    }

    deleteItem(itemId) {
        this.items = this.items.filter(it => it.id !== itemId);
        this._saveHistory();
    }

    clearHistory() {
        this.items = [];
        this._saveHistory();
    }

    _formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
        if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return bytes + ' B';
    }

    _formatTimestamp() {
        const now = GLib.DateTime.new_now_local();
        return now.format('%I:%M %p').replace(/^0/, '');
    }

    /**
     * Pastes item into focused area / file drop
     */
    pasteItem(item) {
        if (!item) return;

        this._isInternalCopy = true;

        // 1. Populate clipboard
        if (item.type === 'file' && item.fileUri) {
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, item.fileUri);
        } else if (item.type === 'image' && item.filePath) {
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, item.filePath);
        } else {
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, item.content || item.title);
        }

        // 2. Refocus previous active window
        const targetWindow = this._lastFocusedWindow;
        if (targetWindow) {
            try {
                targetWindow.activate(global.get_current_time());
            } catch (e) {
                // Ignore focus errors
            }
        }

        // 3. Trigger synthetic paste keystroke if auto-paste is enabled
        const autoPaste = this.settings ? this.settings.get_boolean('auto-paste') : true;
        if (autoPaste && this._virtualKeyboard) {
            // Small timeout to allow target window to take focus on Wayland
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
                this._sendPasteKeystroke(targetWindow);
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _sendPasteKeystroke(targetWindow) {
        if (!this._virtualKeyboard) return;

        let isTerminal = false;
        if (targetWindow) {
            const wmClass = (targetWindow.get_wm_class() || '').toLowerCase();
            const termClasses = ['terminal', 'kitty', 'alacritty', 'wezterm', 'ptyxis', 'console', 'xterm', 'terminator', 'tilix'];
            isTerminal = termClasses.some(c => wmClass.includes(c));
        }

        const mode = this.settings ? this.settings.get_string('terminal-paste-mode') : 'auto';
        const useShift = (mode === 'ctrl-shift-v') || (mode === 'auto' && isTerminal);

        const now = Clutter.get_current_event_time();

        try {
            if (useShift) {
                this._virtualKeyboard.notify_keyval(now, Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
            }
            this._virtualKeyboard.notify_keyval(now, Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
            this._virtualKeyboard.notify_keyval(now, Clutter.KEY_v, Clutter.KeyState.PRESSED);
            this._virtualKeyboard.notify_keyval(now, Clutter.KEY_v, Clutter.KeyState.RELEASED);
            this._virtualKeyboard.notify_keyval(now, Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
            if (useShift) {
                this._virtualKeyboard.notify_keyval(now, Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
            }
        } catch (e) {
            console.error(`[Clipboard] Failed to send paste keystroke: ${e}`);
        }
    }
}
