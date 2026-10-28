"""Background clipboard watcher for Linux / Wayland."""
import time
import hashlib
import subprocess
import threading
import io
from pathlib import Path
from PIL import Image
from typing import Optional, Callable
from .config import IMAGE_DIR
from .storage import Storage
from .classifier import classify_text, classify_image

class ClipboardWatcher:
    def __init__(self, storage: Storage, on_new_item: Optional[Callable] = None):
        self.storage = storage
        self.on_new_item = on_new_item
        self.running = False
        self._thread: Optional[threading.Thread] = None
        self._last_hash = ""

    def start(self):
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self.running = False

    def _monitor_loop(self):
        while self.running:
            try:
                self._check_clipboard()
            except Exception as e:
                # print(f"Watcher error: {e}")
                pass
            time.sleep(0.4)

    def _check_clipboard(self):
        types_proc = subprocess.run(['wl-paste', '--list-types'], capture_output=True, text=True)
        if types_proc.returncode != 0:
            return
        types = types_proc.stdout.splitlines()

        # Check for image
        if any('image/png' in t or 'image/jpeg' in t for t in types):
            img_type = 'image/png' if any('image/png' in t for t in types) else 'image/jpeg'
            img_proc = subprocess.run(['wl-paste', '-t', img_type], capture_output=True)
            if img_proc.returncode == 0 and img_proc.stdout:
                data = img_proc.stdout
                h = hashlib.sha256(data).hexdigest()
                if h == self._last_hash:
                    return
                self._last_hash = h
                self._handle_image(data, img_type)
                return

        # Check for text
        if any('text/plain' in t or 'UTF8_STRING' in t or 'STRING' in t for t in types):
            txt_proc = subprocess.run(['wl-paste', '--no-newline'], capture_output=True, text=True, errors='replace')
            if txt_proc.returncode == 0 and txt_proc.stdout:
                text = txt_proc.stdout
                if not text.strip():
                    return
                h = hashlib.sha256(text.encode('utf-8')).hexdigest()
                if h == self._last_hash:
                    return
                self._last_hash = h
                self._handle_text(text)

    def _handle_image(self, data: bytes, mime_type: str):
        try:
            h = hashlib.sha256(data).hexdigest()[:12]
            ext = "png" if "png" in mime_type else "jpg"
            filename = f"clip_{h}.{ext}"
            file_path = IMAGE_DIR / filename
            
            if not file_path.exists():
                with open(file_path, "wb") as f:
                    f.write(data)
                    
            with Image.open(io.BytesIO(data)) as img:
                w, h_dim = img.size
                
            classified = classify_image(
                file_path=str(file_path),
                filename=filename,
                width=w,
                height=h_dim,
                size_bytes=len(data)
            )
            
            item_id = self.storage.add_item(
                item_type=classified["type"],
                title=classified["title"],
                subtitle=classified["subtitle"],
                raw_content=classified["raw_content"],
                image_path=classified["image_path"],
                metadata=classified["metadata"]
            )
            
            if item_id > 0 and self.on_new_item:
                self.on_new_item()
        except Exception:
            pass

    def _handle_text(self, text: str):
        try:
            classified = classify_text(text)
            item_id = self.storage.add_item(
                item_type=classified["type"],
                title=classified["title"],
                subtitle=classified["subtitle"],
                raw_content=classified["raw_content"],
                metadata=classified["metadata"]
            )
            if item_id > 0 and self.on_new_item:
                self.on_new_item()
        except Exception:
            pass
