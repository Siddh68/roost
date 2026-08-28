"""
Roost promo video renderer.
Pure-Python procedural animation: every frame is drawn with Pillow, then
streamed as raw video into ffmpeg (via imageio-ffmpeg's bundled binary) to
produce a real H.264 .mp4 (and, separately, a VP9 .webm).

Run: python render_promo.py [--test]
  --test renders only the first few seconds, for fast iteration.
"""
import math
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

# ---------------------------------------------------------------------------
# Canvas / timing
# ---------------------------------------------------------------------------
W, H = 1920, 1080
FPS = 30
OUT_DIR = Path(__file__).parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# ---------------------------------------------------------------------------
# Roost design tokens (from packages/web/app/globals.css)
# ---------------------------------------------------------------------------
BG = (10, 14, 20)
SURFACE = (18, 24, 31)
SURFACE_RAISED = (26, 34, 44)
BORDER = (35, 45, 58)
WHITE = (255, 255, 255)
TEXT_PRIMARY = (231, 237, 245)
TEXT_SECONDARY = (139, 152, 171)
ACCENT = (74, 222, 128)
ACCENT_DIM = (26, 51, 38)
WARN = (251, 191, 36)
DANGER = (248, 113, 113)
INFO = (96, 165, 250)
LEDGER = (217, 171, 92)

# ---------------------------------------------------------------------------
# Fonts
# ---------------------------------------------------------------------------
FONT_DIR = Path(r"C:\Windows\Fonts")
def font(name, size):
    # An animated value driving a font size (e.g. a count-up or scale-in)
    # can round down to 0 in the first instant of its reveal - PIL raises
    # on that, so floor it defensively rather than guarding every call site.
    return ImageFont.truetype(str(FONT_DIR / name), max(1, int(size)))

F_DISPLAY_BOLD = lambda s: font("segoeuib.ttf", s)
F_DISPLAY_SEMILIGHT = lambda s: font("segoeuisl.ttf", s)
F_BODY = lambda s: font("segoeui.ttf", s)
F_BODY_BOLD = lambda s: font("segoeuib.ttf", s)
F_MONO = lambda s: font("consola.ttf", s)
F_MONO_BOLD = lambda s: font("consolab.ttf", s)

# ---------------------------------------------------------------------------
# Easing
# ---------------------------------------------------------------------------
def clamp01(x):
    return max(0.0, min(1.0, x))

def ease_out_cubic(x):
    x = clamp01(x)
    return 1 - (1 - x) ** 3

def ease_in_out_cubic(x):
    x = clamp01(x)
    return 4 * x**3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2

def ease_out_back(x):
    x = clamp01(x)
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2

def inr(n):
    """Format an integer with Indian-style digit grouping: 754925 -> '7,54,925'."""
    s = str(int(n))
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ",".join(parts) + "," + tail

def local_t(global_t, start, end):
    """Progress within [start, end], clamped to [0, 1]."""
    if end <= start:
        return 1.0
    return clamp01((global_t - start) / (end - start))

# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------
def rgba(c, a=255):
    return (c[0], c[1], c[2], a)

def new_canvas():
    return Image.new("RGB", (W, H), BG)

def vertical_gradient(im, top, bottom):
    draw = ImageDraw.Draw(im)
    for y in range(H):
        f = y / H
        c = tuple(int(top[i] + (bottom[i] - top[i]) * f) for i in range(3))
        draw.line([(0, y), (W, y)], fill=c)

def radial_glow(base_rgba_im, cx, cy, radius, color, max_alpha=90):
    """Paints a soft radial glow onto an RGBA layer (additive-ish via alpha_composite)."""
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=rgba(color, max_alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(radius * 0.5))
    base_rgba_im.alpha_composite(glow)

def rounded_rect(draw, box, radius, fill=None, outline=None, width=1):
    # Pillow's rounded_rectangle produces garbled/self-intersecting corners
    # when the radius exceeds half the box's own width or height (bit us
    # during a scale-in animation whose box starts near-zero size) - clamp
    # defensively so no caller can ever hit that degenerate case.
    bw = box[2] - box[0]
    bh = box[3] - box[1]
    if bw <= 0 or bh <= 0:
        return
    r = max(0, min(radius, bw / 2, bh / 2))
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

def text_size(draw, txt, f):
    bbox = draw.textbbox((0, 0), txt, font=f)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]

def draw_text(draw, xy, txt, f, fill, anchor="la"):
    draw.text(xy, txt, font=f, fill=fill, anchor=anchor)

LOGO_PATH = Path(__file__).resolve().parents[2] / "packages" / "web" / "public" / "roost-logo.png"
_LOGO_CACHE = {}

def logo_image(size_px):
    """Roost's real logo, resized (cached) to a square of size_px."""
    size_px = max(1, int(size_px))
    if size_px not in _LOGO_CACHE:
        src = Image.open(LOGO_PATH).convert("RGBA")
        _LOGO_CACHE[size_px] = src.resize((size_px, size_px), Image.LANCZOS)
    return _LOGO_CACHE[size_px]

def paste_logo(layer, cx, cy, size_px, alpha=255):
    if size_px < 1:
        return
    img = logo_image(size_px)
    if alpha < 255:
        img = fade_layer(img, alpha / 255)
    layer.alpha_composite(img, (int(cx - size_px / 2), int(cy - size_px / 2)))

def draw_checkmark(draw, cx, cy, size, color, width=4):
    """A small vector checkmark - avoids relying on a font's glyph coverage."""
    x0, y0 = cx - size * 0.5, cy
    x1, y1 = cx - size * 0.12, cy + size * 0.38
    x2, y2 = cx + size * 0.55, cy - size * 0.42
    draw.line([(x0, y0), (x1, y1)], fill=color, width=width, joint="curve")
    draw.line([(x1, y1), (x2, y2)], fill=color, width=width, joint="curve")

def fade_layer(layer, alpha_mult):
    """Scale an RGBA layer's alpha channel by alpha_mult (0..1) and return it."""
    if alpha_mult >= 0.999:
        return layer
    r, g, b, a = layer.split()
    a = a.point(lambda v: int(v * alpha_mult))
    return Image.merge("RGBA", (r, g, b, a))

# ---------------------------------------------------------------------------
# Scene scaffolding: each scene renders into an RGBA layer, composited onto
# the base canvas for that frame. Every scene fades its own layer in over
# its first 0.18s and out over its last 0.18s so hard cuts don't strobe.
# ---------------------------------------------------------------------------
SCENES = []  # populated by @scene decorator: (start, end, fn)

def scene(start, end):
    def deco(fn):
        SCENES.append((start, end, fn))
        return fn
    return deco

EDGE_FADE = 0.18

def scene_alpha(global_t, start, end):
    if global_t < start or global_t > end:
        return 0.0
    fade_in = clamp01((global_t - start) / EDGE_FADE) if EDGE_FADE > 0 else 1.0
    fade_out = clamp01((end - global_t) / EDGE_FADE) if EDGE_FADE > 0 else 1.0
    return min(fade_in, fade_out)

# ---------------------------------------------------------------------------
# Render loop
# ---------------------------------------------------------------------------
def render(duration, out_path, test=False):
    n_frames = int(duration * FPS)
    cmd = [
        FFMPEG, "-y",
        "-f", "rawvideo", "-vcodec", "rawvideo",
        "-s", f"{W}x{H}", "-pix_fmt", "rgb24", "-r", str(FPS),
        "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-preset", "medium",
        str(out_path),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

    t0 = time.time()
    for i in range(n_frames):
        gt = i / FPS
        base = new_canvas()
        base_rgba = base.convert("RGBA")
        for (start, end, fn) in SCENES:
            a = scene_alpha(gt, start, end)
            if a <= 0.001:
                continue
            layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            fn(layer, ImageDraw.Draw(layer), local_t(gt, start, end), gt)
            layer = fade_layer(layer, a)
            base_rgba.alpha_composite(layer)
        frame = base_rgba.convert("RGB")
        proc.stdin.write(frame.tobytes())
        if i % 30 == 0:
            print(f"frame {i}/{n_frames}  t={gt:.2f}s  elapsed={time.time()-t0:.1f}s", flush=True)

    proc.stdin.close()
    proc.wait()
    print("done ->", out_path)


if __name__ == "__main__":
    test = "--test" in sys.argv
    # placeholder scenes are added by the importing script; see build script below
