"""Color naming utility to give friendly names to HEX/RGB colors."""
import math

NAMED_COLORS = {
    "#F85E2A": "Ubuntu Warm Primary",
    "#E95420": "Ubuntu Orange",
    "#77216F": "Ubuntu Aubergine",
    "#5E2750": "Ubuntu Dark Aubergine",
    "#2C001E": "Canonical Dark Plum",
    "#AEA79F": "Ubuntu Warm Grey",
    "#333333": "Jet Black",
    "#1E1E1E": "Dark Charcoal",
    "#000000": "Black",
    "#FFFFFF": "White",
    "#FF0000": "Red",
    "#00FF00": "Green",
    "#0000FF": "Blue",
    "#FFFF00": "Yellow",
    "#00FFFF": "Cyan",
    "#FF00FF": "Magenta",
    "#FFA500": "Orange",
    "#800080": "Purple",
    "#FFC0CB": "Pink",
    "#A52A2A": "Brown",
    "#808080": "Gray",
    "#D3D3D3": "Light Gray",
    "#1E90FF": "Dodger Blue",
    "#00CED1": "Dark Turquoise",
    "#2ECC71": "Emerald Green",
    "#E74C3C": "Alizarin Red",
    "#3498DB": "Peter River Blue",
    "#9B59B6": "Amethyst Purple",
    "#F1C40F": "Sun Yellow",
    "#34495E": "Wet Asphalt",
    "#1ABC9C": "Turquoise",
    "#27AE60": "Nephritis Green",
    "#2980B9": "Belize Hole Blue",
    "#8E44AD": "Wisteria Purple",
    "#F39C12": "Orange Glow",
    "#D35400": "Pumpkin",
    "#C0392B": "Pomegranate",
    "#BDC3C7": "Silver",
    "#7F8C8D": "Asbestos Gray",
}

def hex_to_rgb(hex_code: str):
    hex_code = hex_code.lstrip("#")
    if len(hex_code) == 3:
        hex_code = "".join(c * 2 for c in hex_code)
    elif len(hex_code) == 8:
        hex_code = hex_code[:6]
    return tuple(int(hex_code[i:i+2], 16) for i in (0, 2, 4))

def get_color_name(hex_code: str) -> str:
    hex_code = hex_code.strip().upper()
    if not hex_code.startswith("#"):
        hex_code = "#" + hex_code
    
    # Exact match check
    for code, name in NAMED_COLORS.items():
        if code.upper() == hex_code:
            return name
            
    try:
        r1, g1, b1 = hex_to_rgb(hex_code)
    except Exception:
        return "Custom Color"
        
    closest_name = "Custom Color"
    min_dist = float("inf")
    
    for code, name in NAMED_COLORS.items():
        try:
            r2, g2, b2 = hex_to_rgb(code)
            dist = math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
            if dist < min_dist:
                min_dist = dist
                closest_name = name
        except Exception:
            continue
            
    return closest_name
