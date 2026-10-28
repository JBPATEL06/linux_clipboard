"""Widget for a single clipboard item row with pixel-perfect details."""
import os
import io
import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Gdk', '4.0')
from gi.repository import Gtk, Gdk, GLib, Pango
from PIL import Image, ImageOps

class ClipboardItemRow(Gtk.ListBoxRow):
    def __init__(self, item_data: dict, on_delete_callback=None):
        super().__init__()
        self.item_data = item_data
        self.on_delete_callback = on_delete_callback
        
        self.add_css_class("clip-row")
        self.set_activatable(True)
        
        # Main row container
        row_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        row_box.set_hexpand(True)
        self.set_child(row_box)
        
        # 1. Left visual / icon
        icon_widget = self._create_icon_widget()
        row_box.append(icon_widget)
        
        # 2. Text column (Title + Subtitle)
        text_vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=1)
        text_vbox.set_hexpand(True)
        text_vbox.set_valign(Gtk.Align.CENTER)
        
        # Title row (Title label + optional badge like HEX)
        title_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=4)
        title_box.set_hexpand(True)
        
        title_label = Gtk.Label()
        title_label.set_text(item_data.get("title", ""))
        title_label.add_css_class("item-title")
        title_label.set_ellipsize(Pango.EllipsizeMode.END)
        title_label.set_xalign(0.0)
        title_box.append(title_label)
        
        # HEX badge if color
        if item_data.get("item_type") == "color":
            hex_badge = Gtk.Label(label="HEX")
            hex_badge.add_css_class("hex-badge")
            hex_badge.set_valign(Gtk.Align.CENTER)
            title_box.append(hex_badge)
            
        text_vbox.append(title_box)
        
        # Subtitle label
        subtitle_label = Gtk.Label()
        subtitle_label.set_text(item_data.get("subtitle", ""))
        subtitle_label.add_css_class("item-subtitle")
        subtitle_label.set_ellipsize(Pango.EllipsizeMode.END)
        subtitle_label.set_xalign(0.0)
        text_vbox.append(subtitle_label)
        
        row_box.append(text_vbox)
        
        # 3. Delete action button on hover
        delete_btn = Gtk.Button()
        delete_btn.set_icon_name("edit-delete-symbolic")
        delete_btn.add_css_class("delete-row-btn")
        delete_btn.set_valign(Gtk.Align.CENTER)
        delete_btn.set_tooltip_text("Delete item")
        delete_btn.connect("clicked", self._on_delete_clicked)
        row_box.append(delete_btn)

    def _create_icon_widget(self) -> Gtk.Widget:
        item_type = self.item_data.get("item_type", "text")
        
        # Image Type
        if item_type == "image":
            image_path = self.item_data.get("image_path", "")
            overlay = Gtk.Overlay()
            overlay.add_css_class("thumb-overlay")
            overlay.set_size_request(44, 32)
            
            picture = Gtk.Picture()
            picture.set_content_fit(Gtk.ContentFit.COVER)
            picture.set_size_request(44, 32)
            picture.add_css_class("thumb-image")
            
            if image_path and os.path.exists(image_path):
                # Make a neat 88x64 thumbnail file for crisp hi-dpi preview
                thumb_path = image_path + ".thumb.png"
                if not os.path.exists(thumb_path):
                    try:
                        with Image.open(image_path) as im:
                            thumb_im = ImageOps.fit(im, (88, 64))
                            thumb_im.save(thumb_path, "PNG")
                    except Exception:
                        thumb_path = image_path
                try:
                    texture = Gdk.Texture.new_from_filename(thumb_path)
                    picture.set_paintable(texture)
                except Exception:
                    picture.set_paintable(None)
                    
            overlay.set_child(picture)
            
            # Format badge (e.g. PNG) in bottom corner
            badge_label = Gtk.Label(label=self.item_data.get("metadata", {}).get("format", "PNG"))
            badge_label.add_css_class("png-badge")
            badge_label.set_halign(Gtk.Align.START)
            badge_label.set_valign(Gtk.Align.END)
            badge_label.set_margin_start(2)
            badge_label.set_margin_bottom(2)
            overlay.add_overlay(badge_label)
            return overlay
            
        # Color Type
        if item_type == "color":
            hex_color = self.item_data.get("metadata", {}).get("hex", "#F85E2A")
            box = Gtk.Box()
            box.set_size_request(34, 34)
            box.set_valign(Gtk.Align.CENTER)
            box.set_halign(Gtk.Align.CENTER)
            box.set_margin_end(10)
            
            css_provider = Gtk.CssProvider()
            css_provider.load_from_data(
                f".color-swatch-box {{ background-color: {hex_color}; border-radius: 17px; min-width: 34px; min-height: 34px; }}".encode("utf-8")
            )
            box.get_style_context().add_provider(css_provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
            box.add_css_class("color-swatch-box")
            
            icon = Gtk.Image.new_from_icon_name("applications-graphics-symbolic")
            icon.set_icon_size(Gtk.IconSize.NORMAL)
            icon.set_valign(Gtk.Align.CENTER)
            icon.set_halign(Gtk.Align.CENTER)
            box.append(icon)
            return box

        # Code Type
        if item_type == "code":
            box = Gtk.Box()
            box.add_css_class("item-icon-box")
            box.set_valign(Gtk.Align.CENTER)
            box.set_halign(Gtk.Align.CENTER)
            lbl = Gtk.Label(label="</>")
            lbl.add_css_class("item-icon-symbolic")
            box.append(lbl)
            return box
            
        # Link Type
        if item_type == "link":
            box = Gtk.Box()
            box.add_css_class("item-icon-box")
            box.set_valign(Gtk.Align.CENTER)
            box.set_halign(Gtk.Align.CENTER)
            icon = Gtk.Image.new_from_icon_name("insert-link-symbolic")
            icon.add_css_class("item-icon-symbolic")
            box.append(icon)
            return box

        # Terminal Command Type
        if item_type == "command":
            box = Gtk.Box()
            box.add_css_class("item-icon-box")
            box.set_valign(Gtk.Align.CENTER)
            box.set_halign(Gtk.Align.CENTER)
            icon = Gtk.Image.new_from_icon_name("utilities-terminal-symbolic")
            icon.add_css_class("item-icon-symbolic")
            box.append(icon)
            return box

        # Plain Text Type fallback
        box = Gtk.Box()
        box.add_css_class("item-icon-box")
        box.set_valign(Gtk.Align.CENTER)
        box.set_halign(Gtk.Align.CENTER)
        icon = Gtk.Image.new_from_icon_name("text-x-generic-symbolic")
        icon.add_css_class("item-icon-symbolic")
        box.append(icon)
        return box

    def _on_delete_clicked(self, button):
        if self.on_delete_callback:
            self.on_delete_callback(self.item_data.get("id"))
