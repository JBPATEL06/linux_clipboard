"""Configuration and paths for clipboard manager."""
import os
from pathlib import Path

APP_ID = "org.linuxclip.clipboard"
APP_NAME = "LinuxClip"
DATA_DIR = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "clipboard_linux"
CACHE_DIR = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "clipboard_linux"
IMAGE_DIR = DATA_DIR / "images"
DB_PATH = DATA_DIR / "history.db"

# Create directories if they do not exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)
IMAGE_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_MAX_ITEMS = 200
DEFAULT_WINDOW_WIDTH = 350
DEFAULT_WINDOW_HEIGHT = 620
