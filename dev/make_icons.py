"""Draw the app icons and the Google Play feature graphic.  Usage: python -I dev/make_icons.py"""
import pathlib

from PIL import Image, ImageDraw, ImageFont

root = pathlib.Path(__file__).resolve().parent.parent / "play-store"
BLUE, DARK, WHITE, GOLD = (31, 95, 191), (20, 62, 128), (255, 255, 255), (245, 180, 0)
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def glyph(d, cx, cy, size):
    """White "Ab" with three sound-wave arcs: listen, then spell."""
    f = ImageFont.truetype(BOLD, int(size * 0.42))
    d.text((cx - size * 0.13, cy), "Ab", font=f, fill=WHITE, anchor="mm")
    w = max(3, int(size * 0.035))
    for i, r in enumerate((0.16, 0.25, 0.34)):
        rr = size * r
        x0 = cx + size * 0.10
        d.arc([x0 - rr, cy - rr, x0 + rr, cy + rr], start=-45, end=45, fill=GOLD if i == 0 else WHITE, width=w)
    d.rounded_rectangle([cx - size * 0.36, cy + size * 0.25, cx + size * 0.10, cy + size * 0.25 + w * 1.4], radius=w, fill=GOLD)


def icon(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:  # full-bleed background; artwork inside the 80% safe zone
        d.rectangle([0, 0, size, size], fill=BLUE)
        glyph(d, size / 2, size / 2, size * 0.78)
    else:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=BLUE)
        glyph(d, size / 2, size / 2, size)
    return img


for s in (192, 512):
    icon(s).save(root / "site" / "icons" / f"icon-{s}.png")
icon(512, maskable=True).save(root / "site" / "icons" / "maskable-512.png")
# Google Play: 512x512 icon (32-bit PNG, no transparency needed) and 1024x500 feature graphic
store = icon(512, maskable=True).convert("RGB")
store.save(root / "store-listing" / "play-icon-512.png")
fg = Image.new("RGB", (1024, 500), BLUE)
d = ImageDraw.Draw(fg)
d.rectangle([0, 0, 1024, 500], fill=BLUE)
d.ellipse([700, -160, 1260, 400], fill=DARK)
glyph(d, 840, 250, 380)
d.text((60, 150), "Spelling Dictation", font=ImageFont.truetype(BOLD, 60), fill=WHITE)
d.text((60, 225), "for IELTS Practice", font=ImageFont.truetype(REG, 44), fill=WHITE)
d.text((60, 320), "Listen · Type · Learn the meaning", font=ImageFont.truetype(REG, 30), fill=(220, 230, 250))
fg.save(root / "store-listing" / "feature-graphic-1024x500.png")
print("icons and feature graphic written")
