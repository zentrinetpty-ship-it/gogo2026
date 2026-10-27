"""
Generate every GOGO icon from the new single-G lockup.

The shipped icons were still the retired "GO GO" wordmark. The brand mark is now
a single lime G inside a ringed charcoal disc — lime outer ring, white inner
ring, ink disc, lime G — the same lockup as the header and the launch screen.

Two variants are produced, and the difference matters:

  ANY  (full bleed)  the disc sits inside a white rounded-square tile with a
                     little breathing room. Used for favicons and apple-touch,
                     where the OS shows the image as-is.

  MASKABLE           the disc is scaled to sit inside the safe zone (the middle
                     80%), and the tile fills the whole canvas edge to edge with
                     no rounding, because Android crops it to its own shape. A
                     rounded tile in a maskable slot gets its corners eaten and
                     the ring clips.

Text is drawn as a real glyph in Poppins when available, falling back to
DejaVuSans-Bold. Drawing it as text rather than shipping a path keeps the file
small and the shape correct at every size.
"""

import os
from PIL import Image, ImageDraw, ImageFont

OUT = r"C:\Users\Administrator\_gogo_icons\new"
os.makedirs(OUT, exist_ok=True)

INK = (26, 26, 26)          # #1A1A1A charcoal
LIME = (163, 230, 53)       # #A3E635
WHITE = (255, 255, 255)

# a font that has a clean geometric G. Poppins ships with the site.
FONT_CANDIDATES = [
    r"C:\Users\Administrator\gogo\gogohermes\public\fonts\Poppins-Medium.ttf",
    r"C:\Users\Administrator\gogo\gogohermes\src\assets\fonts\Poppins-Medium.ttf",
    r"C:\Windows\Fonts\Poppins-Medium.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf",
]

def find_font():
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    return None

FONT_PATH = find_font()
print("font:", FONT_PATH or "PIL default (no Poppins found)")


def draw_mark(size, maskable=False, bg=WHITE, transparent=False):
    """The ringed G, drawn at 4x then downsampled for clean edges."""
    S = size * 4
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if not transparent:
        if maskable:
            # full bleed: the OS applies its own shape
            d.rectangle([0, 0, S, S], fill=bg)
        else:
            # rounded tile with a little breathing room
            pad = int(S * 0.06)
            d.rounded_rectangle(
                [pad, pad, S - pad, S - pad],
                radius=int(S * 0.22),
                fill=bg,
            )

    # the disc sits inside the maskable safe zone (80%) when maskable
    inset = S * (0.145 if maskable else 0.16)
    cx = cy = S / 2
    rx = (S / 2) - inset

    # lime ring
    ring_w = max(2, int(rx * 0.11))
    d.ellipse([cx - rx, cy - rx, cx + rx, cy + rx], fill=LIME)

    # white ring
    wr = rx - ring_w
    white_w = max(2, int(rx * 0.10))
    d.ellipse([cx - wr, cy - wr, cx + wr, cy + wr], fill=WHITE)

    # charcoal disc
    dr = wr - white_w
    d.ellipse([cx - dr, cy - dr, cx + dr, cy + dr], fill=INK)

    # the G
    font_size = int(dr * 1.62)
    if FONT_PATH:
        font = ImageFont.truetype(FONT_PATH, font_size)
    else:
        font = ImageFont.load_default()

    text = "G"
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = cx - tw / 2 - bbox[0]
    ty = cy - th / 2 - bbox[1] + dr * 0.02
    d.text((tx, ty), text, font=font, fill=LIME)

    return img.resize((size, size), Image.LANCZOS)


def save(img, name):
    p = os.path.join(OUT, name)
    img.save(p, "PNG", optimize=True)
    print(f"  {name:26s} {img.size[0]}x{img.size[1]}  {os.path.getsize(p):>7} bytes")


print("any-purpose:")
for s in [32, 48, 180, 192, 512]:
    save(draw_mark(s, maskable=False), f"icon-{s}.png")

print("maskable:")
for s in [192, 512]:
    save(draw_mark(s, maskable=True), f"icon-{s}-maskable.png")

# favicon that works on both light and dark browser chrome: the mark on a
# transparent field would vanish in dark mode, so keep the tile.
save(draw_mark(32, maskable=False), "favicon-32.png")
save(draw_mark(16, maskable=False), "favicon-16.png")

# apple touch: iOS masks corners itself, so full-bleed square, no rounding
print("apple-touch (full-bleed square, iOS rounds it):")
img = Image.new("RGBA", (720, 720), WHITE)
d = ImageDraw.Draw(img)
inner = draw_mark(540, maskable=False)
img.paste(inner, (90, 90), inner)
save(img, "apple-touch-icon.png")

print("\ndone ->", OUT)
