"""SQLite database layer for clipboard history persistence."""
import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from .config import DB_PATH

class Storage:
    def __init__(self, db_path=DB_PATH):
        self.db_path = str(db_path)
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS clipboard_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    subtitle TEXT,
                    raw_content TEXT,
                    image_path TEXT,
                    metadata_json TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    pinned INTEGER DEFAULT 0
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON clipboard_items(created_at DESC)")
            conn.commit()

    def add_item(self, item_type: str, title: str, subtitle: str, 
                 raw_content: str, image_path: Optional[str] = None, 
                 metadata: Optional[Dict[str, Any]] = None) -> int:
        metadata_str = json.dumps(metadata or {})
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Check for duplicate of the last entry
            cursor.execute("SELECT raw_content, image_path FROM clipboard_items ORDER BY id DESC LIMIT 1")
            last_row = cursor.fetchone()
            if last_row:
                if item_type == "image" and image_path and last_row["image_path"] == image_path:
                    return -1
                elif item_type != "image" and raw_content and last_row["raw_content"] == raw_content:
                    return -1

            cursor.execute("""
                INSERT INTO clipboard_items 
                (item_type, title, subtitle, raw_content, image_path, metadata_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (item_type, title, subtitle, raw_content, image_path, metadata_str))
            conn.commit()
            return cursor.lastrowid

    def get_items(self, search_query: str = "", limit: int = 100) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if search_query.strip():
                query = f"%{search_query.strip()}%"
                cursor.execute("""
                    SELECT * FROM clipboard_items 
                    WHERE title LIKE ? OR subtitle LIKE ? OR raw_content LIKE ?
                    ORDER BY id DESC LIMIT ?
                """, (query, query, query, limit))
            else:
                cursor.execute("""
                    SELECT * FROM clipboard_items 
                    ORDER BY id DESC LIMIT ?
                """, (limit,))
            
            rows = cursor.fetchall()
            items = []
            for row in rows:
                item = dict(row)
                try:
                    item["metadata"] = json.loads(item["metadata_json"] or "{}")
                except Exception:
                    item["metadata"] = {}
                items.append(item)
            return items

    def delete_item(self, item_id: int):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM clipboard_items WHERE id = ?", (item_id,))
            conn.commit()

    def clear_history(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM clipboard_items")
            conn.commit()

    def count_items(self) -> int:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM clipboard_items")
            return cursor.fetchone()[0]
