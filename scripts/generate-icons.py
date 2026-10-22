"""Generates the GO Compass app icons (compass mark) with Pillow. Run: python scripts/generate-icons.py"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "assets" / "images"
LIME = (167, 243, 107, 255)
WHITE = (246, 248, 252, 255)
BG_TOP = (16, 21, 33)
BG_BOTTOM = (8, 11, 18)
SS = 4  # supersampling


def gradient_bg(size):
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        col = tuple(int(BG_TOP[i] * (1 - t) + BG_BOTTOM[i] * t) for i in range(3)) + (255,)
        for x in range(size):
            px[x, y] = col
    return img


def compass(size, color_ring=LIME, color_needle_a=LIME, color_needle_b=WHITE, scale=1.0, bg=True, mono=False):
    big = size * SS
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx = cy = big / 2
    r = big * 0.34 * scale
    ring_w = big * 0.045 * scale
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color_ring, width=int(ring_w))
    # tick marks
    for i in range(4):
        a = math.radians(i * 90)
        x1 = cx + math.sin(a) * (r - ring_w * 1.6)
        y1 = cy - math.cos(a) * (r - ring_w * 1.6)
        x2 = cx + math.sin(a) * (r + ring_w * 1.2)
        y2 = cy - math.cos(a) * (r + ring_w * 1.2)
        d.line([x1, y1, x2, y2], fill=color_ring, width=int(ring_w * 0.9))
    # needle (rotated 35 degrees)
    ang = math.radians(35)
    def pt(dx, dy):
        return (cx + dx * math.cos(ang) - dy * math.sin(ang), cy + dx * math.sin(ang) + dy * math.cos(ang))
    L = r * 0.78
    W = r * 0.2
    d.polygon([pt(0, -L), pt(-W, 0), pt(W, 0)], fill=color_needle_a)
    d.polygon([pt(0, L), pt(-W, 0), pt(W, 0)], fill=color_needle_b)
    d.ellipse([cx - W * 0.45, cy - W * 0.45, cx + W * 0.45, cy + W * 0.45], fill=(8, 11, 18, 255) if not mono else (0, 0, 0, 255))
    layer = layer.resize((size, size), Image.LANCZOS)
    if not bg:
        return layer
    base = gradient_bg(size)
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([size * 0.2, size * 0.2, size * 0.8, size * 0.8], fill=(167, 243, 107, 40))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.08))
    base = Image.alpha_composite(base, glow)
    return Image.alpha_composite(base, layer)


OUT.mkdir(parents=True, exist_ok=True)
compass(1024).convert("RGB").save(OUT / "icon.png")
compass(1024, scale=0.8, bg=False).save(OUT / "android-icon-foreground.png")
mono = compass(1024, color_ring=(0, 0, 0, 255), color_needle_a=(0, 0, 0, 255), color_needle_b=(0, 0, 0, 255), scale=0.8, bg=False, mono=True)
mono.save(OUT / "android-icon-monochrome.png")
Image.new("RGBA", (1024, 1024), (8, 11, 18, 255)).save(OUT / "android-icon-background.png")
compass(512, bg=False).save(OUT / "splash-icon.png")
compass(48).convert("RGB").save(OUT / "favicon.png")
print("icons written to", OUT)
