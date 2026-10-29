# Project Handling & Maintenance Notes

This guide provides practical notes for developers maintaining, configuring, and troubleshooting **Clipboard Linux**.

---

## 1. Wayland Window Shaking (Root Cause & Solution)

### The Issue
On GNOME Wayland (Mutter), borderless windows (`set_decorated(False)`) with scrollable lists can trigger a high-frequency **vertical shaking / oscillation effect** (bouncing up and down at 60 Hz).

### Why It Happened
1. In GTK4, a `Gtk.ScrolledWindow` by default propagates its child's natural height request (`propagate_natural_height = True`).
2. When items are added or removed, the `ListBox` calculates a large natural height (e.g. 700px).
3. GTK requests Mutter to resize the window to 700px.
4. Mutter expands the surface; once expanded, the layout engine sees that the viewport constraint is 620px and requests 620px again.
5. This creates an infinite feedback loop between GTK's layout engine and Mutter's surface negotiation.

### How It Was Solved in `src/ui/window.py`
Three complementary safeguards were implemented:
```python
# 1. Disable window resizing by compositor
self.set_resizable(False)

# 2. Hard clamp window & root container dimensions
self.set_default_size(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT)
self.set_size_request(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT)
main_box.set_size_request(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT)
main_box.set_vexpand(False)
main_box.set_hexpand(False)

# 3. Disconnect ScrolledWindow natural size propagation
scrolled.set_propagate_natural_height(False)
scrolled.set_propagate_natural_width(False)
scrolled.set_has_frame(False)
scrolled.set_overlay_scrolling(True)
scrolled.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
```

---

## 2. Managing Background Service (systemd)

The application runs as a persistent systemd user service so it's always ready without keeping a terminal open.

### Commands:
- **Check Status**:
  ```bash
  systemctl --user status clipboard-linux.service
  ```
- **Restart Service**:
  ```bash
  systemctl --user restart clipboard-linux.service
  ```
- **Stop Service**:
  ```bash
  systemctl --user stop clipboard-linux.service
  ```
- **View Live Logs**:
  ```bash
  journalctl --user -u clipboard-linux.service -f
  ```
- **Disable Auto-Start**:
  ```bash
  systemctl --user disable clipboard-linux.service
  ```

---

## 3. Global Shortcut (`Super+V`) Configuration

Configured via GNOME GSettings schema `org.gnome.settings-daemon.plugins.media-keys`.

### Script:
`./setup_shortcut.sh` handles registration automatically.

### Manual Verification:
```bash
# View all custom keybindings
gsettings get org.gnome.settings-daemon.plugins.media-keys custom-keybindings

# View LinuxClip binding
gsettings get org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/linuxclip/ binding
# Expected: '<Super>v'

# View executed command
gsettings get org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/linuxclip/ command
# Expected: '/home/jeel/Projects/clipboard_linux/run.sh --toggle'
```

> [!NOTE]
> If `<Super>v` was previously bound to another tool (e.g. CopyQ), the previous tool's binding was cleared to prevent desktop key conflicts.

---

## 4. Storage Locations & File Formats

In compliance with the XDG Base Directory specification:
- **History Database**: `~/.local/share/clipboard_linux/history.db`
- **Cached Images**: `~/.local/share/clipboard_linux/images/`
- **Thumbnails**: `~/.local/share/clipboard_linux/images/*.thumb.png`
- **Desktop Launcher**: `~/.local/share/applications/clipboard-linux.desktop`
- **Autostart Entry**: `~/.config/autostart/clipboard-linux.desktop`
- **Systemd Unit**: `~/.config/systemd/user/clipboard-linux.service`

### To Reset / Wipe History:
Click **"Clear History"** inside the app UI, or run:
```bash
sqlite3 ~/.local/share/clipboard_linux/history.db "DELETE FROM clipboard_items;"
rm -rf ~/.local/share/clipboard_linux/images/*
```

---

## 5. UI Customization Guide

All styling is managed in `src/ui/style.css`:
- **Theme Color**: Change `background-color: #1c1c1e` to adjust charcoal tone.
- **Corner Radii**: Adjust `border-radius: 16px` on `window.clipboard-window` and `.main-container`.
- **Card Spacing**: Edit `.clip-row` padding and margins.
- **Search Appearance**: Modify `.search-container` and `entry.search-entry`.
