# Components & Codebase Map

A detailed directory and file reference for **Clipboard Linux**.

```
clipboard_linux/
├── context/
│   ├── ARCHITECTURE.md          # System architecture and data flows
│   ├── HANDLING_NOTES.md        # Operational, systemd, and troubleshooting notes
│   └── COMPONENTS.md            # File-by-file component breakdown (this file)
├── src/
│   ├── __init__.py
│   ├── main.py                  # App entrypoint, Adw.Application, DBus command line
│   ├── config.py                # XDG paths, default window dimensions, constants
│   ├── storage.py               # SQLite history database & query layer
│   ├── watcher.py               # Background Wayland clipboard monitor thread
│   ├── classifier.py            # Content category classifier & parser
│   ├── ui/
│   │   ├── __init__.py
│   │   ├── window.py            # Main Adw.ApplicationWindow & interactions
│   │   ├── item_row.py          # Custom ListBoxRow for each category type
│   │   └── style.css            # Dark graphite pixel-perfect theme
│   └── utils/
│       ├── __init__.py
│       └── color_names.py       # Nearest named color algorithm for HEX codes
├── run.sh                       # Wrapper script for running & toggling
├── setup_shortcut.sh            # GNOME Super+V shortcut configuration
├── install.sh                   # Desktop entry & autostart installer
├── .gitignore                   # Ignores __pycache__, local databases, thumbs
└── README.md                    # Project overview & quickstart
```

---

## Component Details

### `src/main.py`
- Inherits from `Adw.Application`.
- Manages single-instance lifecycle (`Gio.ApplicationFlags.HANDLES_COMMAND_LINE`).
- Binds `--toggle` to show/hide the primary window.
- Calls `self.hold()` to keep process resident in RAM without requiring an open window.
- Seeds initial mockup demonstration items on fresh DB install.

### `src/config.py`
- Resolves paths according to `$XDG_DATA_HOME` (`~/.local/share/clipboard_linux`) and `$XDG_CACHE_HOME`.
- Sets default window width (`350px`) and height (`620px`).

### `src/storage.py`
- Implements `Storage` class with SQLite database connection pooling.
- Methods:
  - `add_item(item_type, title, subtitle, raw_content, image_path, metadata)`
  - `get_items(search_query, limit)`
  - `delete_item(item_id)`
  - `clear_history()`
  - `count_items()`
- Includes duplicate prevention against consecutive identical copies.

### `src/watcher.py`
- Runs `_monitor_loop` thread sleeping 400ms per iteration.
- Calls `wl-paste --list-types` to inspect clipboard without reading heavy payloads unless changed.
- Dispatches to `_handle_image` or `_handle_text`.
- Computes SHA-256 hash to eliminate redundant writes.

### `src/classifier.py`
- Regular expressions for:
  - HEX / RGB color matching
  - URL & domain extraction (e.g. `github.com` -> `GitHub repository`)
  - Terminal command matching (detects `curl`, `docker`, `sudo`, `npm`, etc.)
  - Code syntax heuristics (`{`, `}`, `def`, `class`, semicolons, indentation)
  - Plain text fallback
- Extracts image dimensions and file sizes into human-readable strings.

### `src/ui/window.py`
- Manages `ClipboardWindow(Adw.ApplicationWindow)`.
- Key controllers:
  - `Escape`: hides window.
  - `Return` / `Enter`: copies selected item and hides window.
  - `Down` arrow from search entry moves focus directly into the history list.
- Features:
  - Draggable header via `Gtk.WindowHandle`.
  - Item counter badge (`N items`).
  - Settings popup.
  - Trash / Clear button with instant UI refresh.

### `src/ui/item_row.py`
- Custom `ClipboardItemRow(Gtk.ListBoxRow)` with per-type visuals:
  - **Image**: `Gtk.Picture` with 44×32 cropped thumbnail and `PNG`/`JPG` badge.
  - **Color**: Circular swatch filled with dynamic CSS background and palette icon + `HEX` badge.
  - **Link**: Chain icon with domain subtitle.
  - **Command**: Terminal icon with command snippet.
  - **Code**: `</>` badge with monospace snippet.
  - **Delete Action**: Subtle trash button on hover to remove specific item.

### `src/ui/style.css`
- Dark graphite styling (`#1c1c1e`).
- Flat button resets, transparent borders, and disabled focus ring outlines.
- Custom scrollbar styling and hover row highlights (`#27272a`).

### `src/utils/color_names.py`
- Maps HEX colors to recognized names using 3D Euclidean distance in RGB color space.
- Includes special recognition for Ubuntu brand colors (`Ubuntu Warm Primary`, `Ubuntu Orange`, `Ubuntu Aubergine`, etc.).
