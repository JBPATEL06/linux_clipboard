# Modern Linux Clipboard Manager

A pixel-perfect, native clipboard manager built for Ubuntu GNOME & Wayland matching your custom dark floating UI design.

![Preview Screenshot](/tmp/rendered_ui_v9.png)

## Features

- **Pixel-Perfect Dark UI**: Custom modern floating popup matching the dark graphite design.
- **Smart Categorization & Previews**:
  - 🖼️ **Images**: Thumbnail card with format badge (`PNG`, `JPG`), dimensions, and file size.
  - 🎨 **Colors**: Circular color swatch with palette icon, Hex code, `HEX` badge, and named color (e.g. `Ubuntu Warm Primary`).
  - 🔗 **Links & URLs**: Detected web / GitHub / GitLab links with custom link icons.
  - 💻 **Terminal Commands**: Monospace preview with terminal icon for CLI commands.
  - 📝 **Code Snippets**: Monospace code preview with line count and language indicators.
  - 📄 **Plain Text**: Formatted text snippets with timestamps.
- **Real-Time Instant Search**: Fast substring filtering across content, metadata, and timestamps.
- **Wayland / Ubuntu Native**: High performance, native Wayland support via GTK4 / Libadwaita with minimal RAM usage (~35 MB).
- **Persistent SQLite Storage**: History persists across system reboots in `~/.local/share/clipboard_linux/history.db`.
- **Keyboard Friendly**:
  - `Super+V`: Toggle show/hide popup anywhere
  - `Up` / `Down`: Navigate clipboard list
  - `Enter` or `Click`: Copy item to clipboard and dismiss
  - `Esc`: Dismiss popup

---

## Quick Start

### 1. Test / Launch Now
```bash
./run.sh
```

### 2. Set Up `Super+V` Global Shortcut
Run the shortcut helper:
```bash
./setup_shortcut.sh
```

Now press `Super+V` anywhere on your desktop to instantly open and toggle your clipboard!
# linux_clipboard
