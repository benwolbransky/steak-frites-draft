"""Regenerate icons/ — the home-screen icons (a carton of frites).

Run from the repo root:  python3 scripts/make-icons.py    (needs Pillow)
"""
from PIL import Image, ImageDraw

BG   = (20, 17, 15)
CART = (192, 73, 47)
CART_D=(150, 52, 32)
FRY  = (224, 162, 75)
FRY_L= (240, 191, 120)

def draw(size, pad_frac):
    """pad_frac = fraction of the canvas kept as empty margin (maskable safe zone)."""
    S = size * 4                      # supersample
    img = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(img)
    m = S * pad_frac                  # margin
    W = S - 2 * m                     # art box
    cx = S / 2

    # --- fries: 5 rounded bars fanning out of the carton ---
    fry_w = W * 0.115
    tops  = [0.30, 0.20, 0.15, 0.22, 0.32]     # y as fraction of art box
    xs    = [-2, -1, 0, 1, 2]
    lean  = W * 0.012
    for i, (xo, t) in enumerate(zip(xs, tops)):
        x = cx + xo * (fry_w * 1.28)
        top = m + W * t
        bot = m + W * 0.72
        skew = xo * lean
        d.rounded_rectangle(
            [x - fry_w / 2 + skew, top, x + fry_w / 2 + skew, bot],
            radius=fry_w * 0.42, fill=FRY_L if abs(xo) < 2 else FRY,
        )

    # --- carton: tapered box holding them ---
    top_y = m + W * 0.55
    bot_y = m + W * 0.94
    half_t = W * 0.40
    half_b = W * 0.29
    d.polygon(
        [(cx - half_t, top_y), (cx + half_t, top_y),
         (cx + half_b, bot_y), (cx - half_b, bot_y)], fill=CART,
    )
    # darker inner lip so the fries read as being inside it
    lip = W * 0.055
    d.polygon(
        [(cx - half_t, top_y), (cx + half_t, top_y),
         (cx + half_t - lip * 0.3, top_y + lip), (cx - half_t + lip * 0.3, top_y + lip)],
        fill=CART_D,
    )
    return img.resize((size, size), Image.LANCZOS)

for size, pad, name in [
    (180, 0.10, "icon-180.png"),      # apple-touch-icon (iOS masks its own corners)
    (192, 0.10, "icon-192.png"),
    (512, 0.10, "icon-512.png"),
    (512, 0.20, "icon-512-maskable.png"),   # extra margin for Android's mask
]:
    draw(size, pad).save(f"icons/{name}")
    print("wrote", name)
