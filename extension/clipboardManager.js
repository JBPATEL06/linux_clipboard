/**
 * ClipboardManager for Antigravity Clipboard
 * Full multi-format clipboard monitoring and binary payload pasting:
 * - True image binary paste (Meta.SelectionSourceMemory for image/png)
 * - True file drop paste (text/uri-list)
 * - Immediate detection without hash lockouts on clear
 * - Fallbacks for robust capture from Chrome, browsers, and screenshots
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

    _readClipboard() {
        const selection = global.display.get_selection();
        const mimeTypes = selection.get_mimetypes(Meta.SelectionType.SELECTION_CLIPBOARD) || [];

        // 1. Check for Image formats (Chrome, Screenshots, Firefox, etc.)
        const imageMime = mimeTypes.find(m => m === 'image/png' || m === 'image/jpeg' || m === 'image/gif');
        if (imageMime) {
            this._transferData(imageMime, (bytes) => {
                if (bytes && bytes.length > 0) {
                    this._handleIncomingImage(bytes, imageMime);
                } else {
                    this._readTextFallback();
                }
            });
            return;
        }

        // 2. Check for File URIs from Nautilus / Files (single or multiple files)
        const fileMime = mimeTypes.find(m => m === 'x-special/gnome-copied-files') || mimeTypes.find(m => m === 'text/uri-list');
        if (fileMime) {
            this._transferData(fileMime, (bytes) => {
                if (bytes && bytes.length > 0) {
                    const text = new TextDecoder('utf-8').decode(bytes);
                    this._handleIncomingFileUris(text);
                } else {
                    this._readTextFallback();
                }
            });
            return;
        }

        // 3. Plain / Rich Text
        this._readTextFallback();
    }

    _readTextFallback() {
        St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
            if (!text || !text.trim()) return;

            const h = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, text, -1);
            if (h === this._lastHash) return;
            this._lastHash = h;

            this._handleIncomingText(text);
        });
    }

    _transferData(mimetype, callback) {
        try {
            const selection = global.display.get_selection();
            const output = Gio.MemoryOutputStream.new_resizable();
            selection.transfer_async(
                Meta.SelectionType.SELECTION_CLIPBOARD,
                mimetype,
                -1,
                output,
                null,
                (sel, res) => {
                    try {
                        sel.transfer_finish(res);
                        const bytes = output.steal_as_bytes();
                        if (bytes && bytes.get_size() > 0) {
                            callback(bytes.toArray());
                        } else {
                            callback(null);
                        }
                    } catch (e) {
                        callback(null);
                    }
                }
            );
        } catch (e) {
            callback(null);
        }
    }

    _handleIncomingImage(uint8Array, mimeType) {
        try {
            const ext = mimeType === 'image/jpeg' ? 'jpg' : (mimeType === 'image/gif' ? 'gif' : 'png');
            const h = GLib.compute_checksum_for_data(GLib.ChecksumType.SHA256, uint8Array);
            if (h === this._lastHash) return;
            this._lastHash = h;

            const filename = `clip_${h.substring(0, 12)}.${ext}`;
            const filePath = GLib.build_filenamev([IMAGE_DIR, filename]);

            const file = Gio.File.new_for_path(filePath);
            file.replace_contents(
                uint8Array,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );

            const sizeStr = this._formatBytes(uint8Array.length);
            const nowStr = this._formatTimestamp();
            const isGif = ext === 'gif';

            const item = {
                id: GLib.uuid_string_random(),
                type: 'image',
                title: isGif ? 'Animated GIF' : `Copied Image (${ext.toUpperCase()})`,
                subtitle: `Image • ${sizeStr} • ${nowStr}`,
                filePath: filePath,
                format: ext.toUpperCase(),
                isGif: isGif,
                fileSize: sizeStr,
                created_at: new Date().toISOString()
            };

            this.addItem(item);
        } catch (e) {
            console.error(`[Clipboard] Failed to save image: ${e}`);
        }
    }

    _handleIncomingFileUris(uriString) {
        const uris = uriString.split(/[\r\n]+/)
            .map(u => u.trim())
            .filter(u => u.startsWith('file://'));
        if (uris.length === 0) return;

        const h = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, uris.join('\n'), -1);
        if (h === this._lastHash) return;
        this._lastHash = h;

        const nowStr = this._formatTimestamp();

        // If single file and it is an image, preview it as an Image Card!
        if (uris.length === 1) {
            try {
                const file = Gio.File.new_for_uri(uris[0]);
                const path = file.get_path();
                if (path && file.query_exists(null)) {
                    const lower = path.toLowerCase();
                    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
                    const isImage = imageExts.some(ext => lower.endsWith(ext));

                    if (isImage) {
                        const info = file.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null);
                        const sizeStr = this._formatBytes(info.get_size());
                        const filename = file.get_basename();
                        const ext = filename.split('.').pop().toUpperCase();

                        this.addItem({
                            id: GLib.uuid_string_random(),
                            type: 'image',
                            title: filename,
                            subtitle: `Screenshot / Image • ${sizeStr} • ${nowStr}`,
                            filePath: path,
                            fileUri: uris[0],
                            uris: uris,
                            format: ext,
                            isGif: ext === 'GIF',
                            fileSize: sizeStr,
                            created_at: new Date().toISOString()
                        });
                        return;
                    }
                }
            } catch (e) {}
        }

        // Multiple files or folder or non-image single file
        let totalSize = 0;
        const fileNames = [];
        let primaryIcon = 'text-x-generic';
        let isFolder = false;

        uris.forEach(uri => {
            try {
                const f = Gio.File.new_for_uri(uri);
                if (f.query_exists(null)) {
                    fileNames.push(f.get_basename());
                    const fType = f.query_file_type(Gio.FileQueryInfoFlags.NONE, null);
                    if (fType === Gio.FileType.DIRECTORY) {
                        isFolder = true;
                        primaryIcon = 'folder';
                    }
                    const info = f.query_info('standard::size,standard::content-type', Gio.FileQueryInfoFlags.NONE, null);
                    totalSize += info.get_size();
                    const ct = info.get_content_type();
                    if (ct && !isFolder) {
                        if (ct.startsWith('video/')) primaryIcon = 'video-x-generic';
                        else if (ct.startsWith('audio/')) primaryIcon = 'audio-x-generic';
                        else if (ct.includes('zip') || ct.includes('tar') || ct.includes('archive')) primaryIcon = 'package-x-generic';
                    }
                }
            } catch (e) {}
        });

        const isMulti = uris.length > 1;
        const title = isMulti ? `${uris.length} Files: ${fileNames.slice(0, 3).join(', ')}${uris.length > 3 ? '...' : ''}` : (fileNames[0] || 'File');

        let subtitle = '';
        if (isMulti) {
            subtitle = `Multiple Files (${uris.length}) • ${this._formatBytes(totalSize)} • ${nowStr}`;
        } else if (isFolder) {
            subtitle = `Folder • ${nowStr}`;
        } else {
            subtitle = `File • ${this._formatBytes(totalSize)} • ${nowStr}`;
        }

        const item = {
            id: GLib.uuid_string_random(),
            type: 'file',
            title: title,
            subtitle: subtitle,
            filePath: uris.length === 1 ? Gio.File.new_for_uri(uris[0]).get_path() : null,
            fileUri: uris.join('\n'),
            uris: uris,
            fileSize: isFolder ? 'Folder' : this._formatBytes(totalSize),
            iconName: isMulti ? 'folder-documents-symbolic' : primaryIcon,
            isMultiple: isMulti,
            isFolder: isFolder,
            created_at: new Date().toISOString()
        };

        this.addItem(item);
    }

    _handleIncomingText(rawText) {
        const text = rawText.trim();
        const nowStr = this._formatTimestamp();
        let item = null;

        // 1. Check if it's a file path string (/home/... or file://)
        if (text.startsWith('/') && GLib.file_test(text, GLib.FileTest.EXISTS)) {
            const f = Gio.File.new_for_path(text);
            const uri = f.get_uri();
            this._handleIncomingFileUris(uri);
            return;
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
            const codeKeywords = ['def ', 'class ', 'function', 'const ', 'let ', 'var ', 'import ', 'return ', '{', '}', '=>', '#include', '<?php', 'public ', 'private '];
            const hasKeywords = codeKeywords.some(kw => text.includes(kw));
            if ((lines.length > 1 && hasKeywords) || lines.length >= 3) {
                let fileName = 'Code Snippet';
                const first = lines[0].trim();
                if (first.startsWith('//') || first.startsWith('#') || first.startsWith('/*')) {
                    const match = first.match(/[\w-]+\.\w+/);
                    if (match) fileName = match[0];
                }

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

    addItem(item) {
        this.items.unshift(item);
        this._saveHistory();
    }

    deleteItem(itemId) {
        this.items = this.items.filter(it => it.id !== itemId);
        if (this.items.length === 0) {
            this._lastHash = '';
        }
        this._saveHistory();
    }

    clearHistory() {
        this.items = [];
        this._lastHash = '';
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

    _extractItemUris(item) {
        if (!item) return [];
        if (item.uris && Array.isArray(item.uris) && item.uris.length > 0) {
            return item.uris.filter(u => typeof u === 'string' && u.startsWith('file://'));
        }
        if (item.fileUri) {
            const list = item.fileUri.split(/[\r\n]+/)
                .map(u => u.trim())
                .filter(u => u.startsWith('file://'));
            if (list.length > 0) return list;
        }
        if (item.filePath) {
            try {
                const f = Gio.File.new_for_path(item.filePath);
                return [f.get_uri()];
            } catch (e) {}
        }
        return [];
    }

    /**
     * Pastes item.
     * - Files and folders: Native GNOME 'x-special/gnome-copied-files' payload for Nautilus/Desktop,
     *   or clean path text if focused inside a terminal or text editor.
     * - Images: Binary image/png or image/jpeg payload onto Meta.Selection, so applications
     *   receive the ACTUAL IMAGE rather than a file path string!
     */
    pasteItem(item) {
        if (!item) return;

        this._isInternalCopy = true;
        const selection = global.display.get_selection();
        const targetWindow = this._lastFocusedWindow;

        let isFileManager = false;
        let isTextTarget = false;

        if (targetWindow) {
            const wmClass = (targetWindow.get_wm_class() || '').toLowerCase();
            const fmClasses = ['nautilus', 'files', 'nemo', 'thunar', 'caja', 'dolphin', 'pcmanfm', 'ding'];
            isFileManager = fmClasses.some(c => wmClass.includes(c));

            const textClasses = ['terminal', 'kitty', 'alacritty', 'wezterm', 'ptyxis', 'console', 'xterm', 'terminator', 'tilix', 'code', 'gedit', 'gnome-text-editor', 'sublime', 'atom', 'vim', 'neovim', 'emacs', 'cursor'];
            isTextTarget = textClasses.some(c => wmClass.includes(c));
        }

        const uris = this._extractItemUris(item);

        // 1. Files & Folders (or images being pasted into a File Manager / Desktop)
        if (uris.length > 0 && (item.type === 'file' || isFileManager)) {
            if (!isTextTarget) {
                // Nautilus file copying protocol: "copy\nfile:///path1\nfile:///path2" (strictly no trailing newline)
                const payload = ['copy', ...uris].join('\n');
                const bytes = GLib.Bytes.new(new TextEncoder().encode(payload));
                try {
                    const source = Meta.SelectionSourceMemory.new('x-special/gnome-copied-files', bytes);
                    selection.set_owner(Meta.SelectionType.SELECTION_CLIPBOARD, source);
                } catch (e) {
                    console.error(`[Clipboard] Failed to set selection owner: ${e}`);
                }
                try {
                    St.Clipboard.get_default().set_content(
                        St.ClipboardType.CLIPBOARD,
                        'x-special/gnome-copied-files',
                        bytes
                    );
                } catch (e) {}
            } else {
                // If target window is a terminal or text editor, paste clean file paths as text
                const paths = uris.map(u => {
                    try {
                        return Gio.File.new_for_uri(u).get_path() || u;
                    } catch (e) {
                        return u;
                    }
                });
                const textPayload = paths.length > 1 ? paths.map(p => `"${p}"`).join(' ') : paths[0];
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, textPayload);
            }
        } else if (item.type === 'image' && item.filePath && GLib.file_test(item.filePath, GLib.FileTest.EXISTS)) {
            // Raw binary image for Chrome, Slack, Discord, GIMP, web editors
            try {
                const file = Gio.File.new_for_path(item.filePath);
                const [success, contents] = file.load_contents(null);
                if (success) {
                    const mime = item.format === 'JPG' ? 'image/jpeg' : (item.format === 'GIF' ? 'image/gif' : 'image/png');
                    const source = Meta.SelectionSourceMemory.new(mime, GLib.Bytes.new(contents));
                    selection.set_owner(Meta.SelectionType.SELECTION_CLIPBOARD, source);
                }
            } catch (e) {
                console.error(`[Clipboard] Failed to set binary image payload: ${e}`);
            }
        } else {
            // Text, Code snippet, Hex color
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, item.content || item.title || '');
        }

        // 2. Refocus target window
        if (targetWindow) {
            try {
                targetWindow.activate(global.get_current_time());
            } catch (e) {}
        }

        // 3. Send synthetic paste keystroke
        const autoPaste = this.settings ? this.settings.get_boolean('auto-paste') : true;
        if (autoPaste && this._virtualKeyboard) {
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
