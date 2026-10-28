"""Classifier to identify content types: Color, Terminal command, Link, Code, Image, Text."""
import re
from datetime import datetime
from urllib.parse import urlparse
from typing import Dict, Any, Tuple
from .utils.color_names import get_color_name

# Regexes
HEX_COLOR_REGEX = re.compile(r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3}|[A-Fa-f0-9]{8})$')
RGB_COLOR_REGEX = re.compile(r'^rgba?\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+')
URL_REGEX = re.compile(r'^(https?://|git@|ftp://|www\.)[^\s]+$')

# Common CLI commands or indicators
CLI_COMMAND_PREFIXES = (
    'curl ', 'wget ', 'sudo ', 'apt ', 'apt-get ', 'git ', 'docker ', 'docker-compose ',
    'npm ', 'yarn ', 'pnpm ', 'pip ', 'python3 ', 'python ', 'cargo ', 'rustc ',
    'systemctl ', 'journalctl ', 'service ', 'ssh ', 'scp ', 'rsync ', 'chmod ',
    'chown ', 'ls ', 'cd ', 'mkdir ', 'rm ', 'cp ', 'mv ', 'cat ', 'grep ',
    'export ', 'source ', 'alias ', 'kill ', 'ps ', 'tar ', 'unzip ', 'find ',
    'npx ', 'kubectl ', 'helm ', 'terraform ', 'make ', 'gcc ', 'g++ ', 'echo '
)

CODE_INDICATORS = [
    '{', '}', ';', '=>', 'def ', 'class ', 'import ', 'const ', 'let ', 'var ',
    'fn ', 'func ', 'return ', 'public ', 'private ', 'function', '#include',
    '#!/bin/', '<?php', '<html', '<div', 'SELECT ', 'FROM ', 'WHERE '
]

def format_timestamp(dt: datetime = None) -> str:
    if dt is None:
        dt = datetime.now()
    return dt.strftime("%I:%M %p").lstrip("0")

def classify_text(text: str) -> Dict[str, Any]:
    text_clean = text.strip()
    now_time = format_timestamp()

    # 1. Check HEX or RGB color
    hex_match = HEX_COLOR_REGEX.match(text_clean)
    if hex_match:
        hex_val = text_clean.upper()
        color_name = get_color_name(hex_val)
        return {
            "type": "color",
            "title": hex_val,
            "subtitle": f"{color_name} • {now_time}",
            "raw_content": text,
            "metadata": {
                "hex": hex_val,
                "color_name": color_name
            }
        }

    # 2. Check URL / Link
    if URL_REGEX.match(text_clean):
        parsed = urlparse(text_clean if "://" in text_clean else "http://" + text_clean)
        netloc = parsed.netloc.lower()
        if "github.com" in netloc:
            tag = "GitHub repository"
        elif "gitlab.com" in netloc:
            tag = "GitLab repository"
        elif "youtube.com" in netloc or "youtu.be" in netloc:
            tag = "YouTube video"
        elif "twitter.com" in netloc or "x.com" in netloc:
            tag = "X / Twitter post"
        elif "reddit.com" in netloc:
            tag = "Reddit post"
        elif netloc:
            tag = netloc.replace("www.", "")
        else:
            tag = "Web Link"

        return {
            "type": "link",
            "title": text_clean,
            "subtitle": f"{tag} • {now_time}",
            "raw_content": text,
            "metadata": {"url": text_clean, "domain": tag}
        }

    # 3. Check Terminal Command
    lower_text = text_clean.lower()
    is_cli = any(lower_text.startswith(prefix) for prefix in CLI_COMMAND_PREFIXES)
    if not is_cli and ("|" in text_clean or "&&" in text_clean or ">" in text_clean):
        # Multiple commands piped or chained
        first_word = text_clean.split()[0] if text_clean.split() else ""
        if len(first_word) < 15 and not first_word.startswith("<"):
            is_cli = True

    if is_cli:
        first_line = text_clean.splitlines()[0]
        return {
            "type": "command",
            "title": first_line,
            "subtitle": f"Terminal command • {now_time}",
            "raw_content": text,
            "metadata": {"command": text_clean}
        }

    # 4. Check Code Snippet
    lines = text_clean.splitlines()
    has_code_keywords = any(indicator in text_clean for indicator in CODE_INDICATORS)
    has_indentation = any(line.startswith("  ") or line.startswith("\t") for line in lines[1:])
    
    if (len(lines) > 1 and (has_code_keywords or has_indentation)) or (len(lines) == 1 and has_code_keywords and len(text_clean) > 8):
        snippet_name = lines[0].strip()
        if len(snippet_name) > 35:
            snippet_name = snippet_name[:35] + ".."
        return {
            "type": "code",
            "title": snippet_name,
            "subtitle": f"code snippet • {now_time}",
            "raw_content": text,
            "metadata": {"lines": len(lines)}
        }

    # 5. Default Text
    first_line = lines[0].strip()
    if len(first_line) > 38:
        first_line = first_line[:38] + ".."
    return {
        "type": "text",
        "title": first_line,
        "subtitle": f"Plain text • {now_time}",
        "raw_content": text,
        "metadata": {"length": len(text)}
    }

def classify_image(file_path: str, filename: str, width: int, height: int, size_bytes: int) -> Dict[str, Any]:
    now_time = format_timestamp()
    
    # Format size
    if size_bytes >= 1024 * 1024:
        size_str = f"{size_bytes / (1024 * 1024):.1f} MB"
    elif size_bytes >= 1024:
        size_str = f"{size_bytes / 1024:.1f} KB"
    else:
        size_str = f"{size_bytes} B"
        
    ext = filename.split(".")[-1].upper() if "." in filename else "PNG"
    
    return {
        "type": "image",
        "title": filename,
        "subtitle": f"Image • {width}×{height} • {size_str}",
        "raw_content": file_path,
        "image_path": file_path,
        "metadata": {
            "width": width,
            "height": height,
            "size": size_str,
            "format": ext
        }
    }
