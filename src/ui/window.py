"""Main window for Clipboard Linux matching the mockup."""
import os
import subprocess
import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
gi.require_version('Gdk', '4.0')
from gi.repository import Gtk, Adw, Gdk, GLib, Gio
from ..config import DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT, APP_NAME
from ..storage import Storage
from .item_row import ClipboardItemRow

class ClipboardWindow(Adw.ApplicationWindow):
    def __init__(self, app, storage: Storage):
        super().__init__(application=app, title=APP_NAME)
        self.storage = storage
        
        # Setup window properties
        self.set_default_size(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT)
        self.set_size_request(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT)
        self.set_resizable(False)
        self.set_decorated(False)
        self.add_css_class("clipboard-window")
        
        # Load custom CSS
        self._load_css()
        
        # Main vertical box with fixed size to eliminate Wayland size oscillation
        main_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        main_box.set_size_request(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT)
        main_box.set_vexpand(False)
        main_box.set_hexpand(False)
        main_box.add_css_class("main-container")
        self.set_content(main_box)
        
        # 1. Header Box (Wrapped in WindowHandle for draggable floating window)
        window_handle = Gtk.WindowHandle()
        header_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=0)
        header_box.add_css_class("header-box")
        window_handle.set_child(header_box)
        main_box.append(window_handle)
        
        title_label = Gtk.Label(label="Clipboard")
        title_label.add_css_class("header-title")
        header_box.append(title_label)
        
        self.counter_badge = Gtk.Label(label="0 items")
        self.counter_badge.add_css_class("counter-badge")
        header_box.append(self.counter_badge)
        
        # Spacer
        spacer = Gtk.Box()
        spacer.set_hexpand(True)
        header_box.append(spacer)
        
        # Settings Icon Button
        settings_btn = Gtk.Button()
        settings_btn.set_icon_name("preferences-system-symbolic")
        settings_btn.add_css_class("header-icon-btn")
        settings_btn.set_tooltip_text("Settings & Shortcuts")
        settings_btn.connect("clicked", self._on_settings_clicked)
        header_box.append(settings_btn)
        
        # Trash / Clear History Button
        trash_btn = Gtk.Button()
        trash_btn.set_icon_name("user-trash-symbolic")
        trash_btn.add_css_class("header-icon-btn")
        trash_btn.set_tooltip_text("Clear all history")
        trash_btn.connect("clicked", self._on_clear_clicked)
        header_box.append(trash_btn)
        
        # 2. Search Container
        search_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        search_box.add_css_class("search-container")
        main_box.append(search_box)
        
        search_icon = Gtk.Image.new_from_icon_name("system-search-symbolic")
        search_icon.add_css_class("search-icon")
        search_box.append(search_icon)
        
        self.search_entry = Gtk.Entry()
        self.search_entry.set_placeholder_text("Search clipboard...")
        self.search_entry.add_css_class("search-entry")
        self.search_entry.add_css_class("flat")
        self.search_entry.set_hexpand(True)
        self.search_entry.connect("changed", self._on_search_changed)
        search_box.append(self.search_entry)
        
        ctrl_v_badge = Gtk.Label(label="Ctrl+V")
        ctrl_v_badge.add_css_class("ctrl-v-badge")
        search_box.append(ctrl_v_badge)
        
        # 3. History List (Scrolled)
        scrolled = Gtk.ScrolledWindow()
        scrolled.set_vexpand(True)
        scrolled.set_hexpand(True)
        scrolled.set_propagate_natural_height(False)
        scrolled.set_propagate_natural_width(False)
        scrolled.set_has_frame(False)
        scrolled.set_overlay_scrolling(True)
        scrolled.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        scrolled.add_css_class("history-scrolled")
        main_box.append(scrolled)
        
        self.list_box = Gtk.ListBox()
        self.list_box.set_selection_mode(Gtk.SelectionMode.SINGLE)
        self.list_box.add_css_class("history-list")
        self.list_box.connect("row-activated", self._on_row_activated)
        scrolled.set_child(self.list_box)
        
        # 4. Footer
        footer_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=0)
        footer_box.add_css_class("footer-box")
        main_box.append(footer_box)
        
        clear_btn = Gtk.Button(label="Clear History")
        clear_btn.add_css_class("clear-history-btn")
        clear_btn.add_css_class("flat")
        clear_btn.connect("clicked", self._on_clear_clicked)
        footer_box.append(clear_btn)
        
        footer_spacer = Gtk.Box()
        footer_spacer.set_hexpand(True)
        footer_box.append(footer_spacer)
        
        encrypted_label = Gtk.Label(label="Encrypted cache")
        encrypted_label.add_css_class("encrypted-label")
        footer_box.append(encrypted_label)
        
        # Setup Keyboard Event Controller
        key_controller = Gtk.EventControllerKey.new()
        key_controller.connect("key-pressed", self._on_key_pressed)
        self.add_controller(key_controller)
        
        # Populate history
        self.refresh_list()

    def _load_css(self):
        css_file = os.path.join(os.path.dirname(__file__), "style.css")
        if os.path.exists(css_file):
            provider = Gtk.CssProvider()
            provider.load_from_path(css_file)
            Gtk.StyleContext.add_provider_for_display(
                Gdk.Display.get_default(),
                provider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            )

    def _on_key_pressed(self, controller, keyval, keycode, state):
        if keyval == Gdk.KEY_Escape:
            self.set_visible(False)
            return True
        elif keyval in (Gdk.KEY_Return, Gdk.KEY_KP_Enter):
            selected_row = self.list_box.get_selected_row()
            if selected_row:
                self._on_row_activated(self.list_box, selected_row)
                return True
        elif keyval == Gdk.KEY_Down and self.search_entry.has_focus():
            row = self.list_box.get_row_at_index(0)
            if row:
                self.list_box.select_row(row)
                row.grab_focus()
                return True
        return False

    def refresh_list(self):
        query = self.search_entry.get_text()
        items = self.storage.get_items(search_query=query, limit=100)
        total_count = self.storage.count_items()
        
        self.counter_badge.set_text(f"{total_count} items")
        
        # Clear existing rows
        while True:
            row = self.list_box.get_first_child()
            if row is None:
                break
            self.list_box.remove(row)
            
        if not items:
            empty_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
            empty_lbl = Gtk.Label(label="No clipboard items yet\nCopy something to see it here!")
            empty_lbl.add_css_class("empty-label")
            empty_lbl.set_justify(Gtk.Justification.CENTER)
            empty_box.append(empty_lbl)
            self.list_box.append(empty_box)
            return
            
        for item in items:
            row = ClipboardItemRow(item, on_delete_callback=self._on_item_deleted)
            self.list_box.append(row)

    def _on_search_changed(self, entry):
        self.refresh_list()

    def _on_row_activated(self, listbox, row):
        if not hasattr(row, "item_data"):
            return
        item_data = row.item_data
        item_type = item_data.get("item_type")
        
        if item_type == "image":
            img_path = item_data.get("image_path")
            if img_path and os.path.exists(img_path):
                with open(img_path, "rb") as f:
                    data = f.read()
                subprocess.run(['wl-copy', '-t', 'image/png'], input=data)
        else:
            raw_text = item_data.get("raw_content", "")
            subprocess.run(['wl-copy'], input=raw_text.encode('utf-8'))
            
        # Hide window after selection
        self.set_visible(False)

    def _on_item_deleted(self, item_id):
        self.storage.delete_item(item_id)
        self.refresh_list()

    def _on_clear_clicked(self, button):
        self.storage.clear_history()
        self.refresh_list()

    def _on_settings_clicked(self, button):
        dialog = Adw.MessageDialog.new(self, "Clipboard Settings", 
            "Configured Shortcut: Super+V\n\n"
            "• Search across all history\n"
            "• Supports Images, Colors, Links, Commands, and Code\n"
            "• Click any item to copy back to clipboard\n"
            "• Press Esc to dismiss"
        )
        dialog.add_response("ok", "Got it")
        dialog.set_default_response("ok")
        dialog.present()
