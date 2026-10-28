"""Application entrypoint for Clipboard Linux."""
import sys
import os
from pathlib import Path
import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
from gi.repository import Gtk, Adw, Gio, GLib

from .config import APP_ID, IMAGE_DIR
from .storage import Storage
from .watcher import ClipboardWatcher
from .ui.window import ClipboardWindow

class ClipboardApp(Adw.Application):
    def __init__(self):
        super().__init__(
            application_id=APP_ID,
            flags=Gio.ApplicationFlags.HANDLES_COMMAND_LINE
        )
        self.storage = Storage()
        self.window = None
        self.watcher = None
        self._held = False

    def do_startup(self):
        Adw.Application.do_startup(self)
        # Keep application running in background for global shortcuts
        self.hold()
        self._held = True
        
        # Seed initial items if database is fresh
        self._seed_initial_history()

        # Start clipboard watcher
        self.watcher = ClipboardWatcher(
            storage=self.storage,
            on_new_item=self._on_new_item_captured
        )
        self.watcher.start()

    def _seed_initial_history(self):
        if self.storage.count_items() == 0:
            mock_img = IMAGE_DIR / "mockup_preview_v2.png"
            if mock_img.exists():
                self.storage.add_item(
                    item_type="image",
                    title="mockup_preview_v2.png",
                    subtitle="Image • 1920×1080 • 1.8 MB",
                    raw_content=str(mock_img),
                    image_path=str(mock_img),
                    metadata={"width": 1920, "height": 1080, "size": "1.8 MB", "format": "PNG"}
                )
            
            self.storage.add_item(
                item_type="code",
                title="hide__main_window__in__task_ba..",
                subtitle="settings.ini • 10:14 AM",
                raw_content="hide__main_window__in__task_bar = true\nkeep_on_top = true",
                metadata={"lines": 2}
            )
            
            self.storage.add_item(
                item_type="link",
                title="https://github.com/vfsfitvnm/OuterTu...",
                subtitle="GitHub repository • 09:58 AM",
                raw_content="https://github.com/vfsfitvnm/OuterTune",
                metadata={"domain": "GitHub repository"}
            )
            
            self.storage.add_item(
                item_type="color",
                title="#F85E2A",
                subtitle="Ubuntu Warm Primary • 08:45 AM",
                raw_content="#F85E2A",
                metadata={"hex": "#F85E2A", "color_name": "Ubuntu Warm Primary"}
            )
            
            self.storage.add_item(
                item_type="command",
                title="curl -fsSL https://get.docker.com -o ...",
                subtitle="Terminal command • 08:20 AM",
                raw_content="curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh",
                metadata={"command": "curl"}
            )

    def do_activate(self):
        if not self.window:
            self.window = ClipboardWindow(self, self.storage)
        self.window.refresh_list()
        self.window.present()
        self.window.search_entry.grab_focus()

    def do_command_line(self, command_line):
        args = command_line.get_arguments()
        toggle = "--toggle" in args
        
        if not self.window:
            self.window = ClipboardWindow(self, self.storage)

        if toggle:
            if self.window.is_visible():
                self.window.set_visible(False)
            else:
                self.window.refresh_list()
                self.window.present()
                self.window.search_entry.grab_focus()
        else:
            self.window.refresh_list()
            self.window.present()
            self.window.search_entry.grab_focus()
            
        return 0

    def _on_new_item_captured(self):
        # Refresh UI safely on main GTK loop
        GLib.idle_add(self._safe_refresh)

    def _safe_refresh(self):
        if self.window:
            self.window.refresh_list()
        return False

def main():
    app = ClipboardApp()
    return app.run(sys.argv)

if __name__ == "__main__":
    sys.exit(main())
