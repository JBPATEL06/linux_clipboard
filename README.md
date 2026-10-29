# macOS-Styled Native GNOME Shell Clipboard Extension

A buttery-smooth, native GNOME Shell Extension for Ubuntu Wayland, built with GJS and St matching macOS dark matte aesthetics.

---

## Features

- **True Native OS Extension**: Runs directly inside GNOME Shell (Mutter). Zero window shaking, no dock icons, no Alt+Tab clutter.
- **Opens at Cursor (`Super+V`)**: Opens directly where your mouse pointer is, with intelligent monitor boundary clamping so it never clips off-screen.
- **Pagination (5 Items per Page)**: Shows strictly 5 items per page with `< 1 / N >` controls. Press numbers `1`–`5` to paste items instantly.
- **Auto-Paste on Click**:
  - Automatically restores target window focus and simulates paste into the focused text area or folder drop.
  - Supports terminals with smart detection (`Ctrl+V` or `Ctrl+Shift+V`).
- **5 Custom Card Types (from Wireframe)**:
  1. 🖼️ **Image & Animated GIF Card**: Full preview with format badge (`PNG`, `JPG`, `GIF`), resolution, and size.
  2. 📝 **Copied Text Card**: Rich text rendering with full color emoji support.
  3. 💻 **5-Line Code Block Card**: Strictly displays first 5 lines with line numbers, file name header (e.g. `settings.ini`, `main.py`), and `+ N more lines` badge.
  4. 📁 **Copied File Card**: Detects files copied from Nautilus/Files (`text/uri-list`), displaying file icon, filename, and file size (`1.3 MB`). Pastes as a native file drop!
  5. 🎨 **Color Card**: Circular color swatch with HEX code and nearest color name.
- **Dynamic macOS Matte Theme**:
  - Automatically inherits your system dark mode (`prefer-dark`) and system accent color (`Yaru-blue-dark` / `#0a84ff`), matching your Nautilus file manager.
  - Fully compatible with `blur-my-shell` for frosted glass effect.

---

## Installation & Setup

```bash
./install.sh
```

> [!NOTE]
> On Wayland, GNOME Shell indexes newly created extension folders upon session startup. If this is the first install, simply **log out and log back in** (or lock and unlock) for GNOME Shell to activate the new extension.

Then press **`Super+V`** anywhere to open your clipboard!
