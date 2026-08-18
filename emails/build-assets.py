#!/usr/bin/env python3
"""
Genera los assets de imagen del email de prospeccion (Brevo).
Los email clients no soportan WebP de forma fiable (Outlook Windows no lo pinta),
asi que todo sale en PNG/JPG. Ejecutar desde la raiz del repo:

    python3 emails/build-assets.py

Salida en images/email/ (esa ruta ya se sirve como estatica en
produccion; /emails/ podria chocar con el rewrite catch-all de vercel.json).
"""

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "images", "email")
LOGOS = os.path.join(ROOT, "images", "logos")
FONTS = "/mnt/skills/examples/canvas-design/canvas-fonts"

NAVY = (10, 2, 48)
GRAY_500 = (108, 114, 130)
GRAY_200 = (232, 234, 237)
WHITE = (255, 255, 255)

os.makedirs(OUT, exist_ok=True)


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def flatten(im, bg=WHITE):
    """Aplana transparencia sobre blanco (Outlook pinta el alpha en negro)."""
    im = im.convert("RGBA")
    canvas = Image.new("RGBA", im.size, bg + (255,))
    canvas.alpha_composite(im)
    return canvas.convert("RGB")


# ---------------------------------------------------------------- logo dynamo
def build_logo():
    im = Image.open(os.path.join(ROOT, "images", "2.png"))  # logo a color
    im = flatten(im)
    im.thumbnail((520, 520), Image.LANCZOS)  # se muestra a 260px (retina 2x)
    im.save(os.path.join(OUT, "logo-dynamo.png"), optimize=True)
    print("logo-dynamo.png", im.size)


# ------------------------------------------------------------------ hero foto
def build_hero():
    im = Image.open(os.path.join(ROOT, "images", "HERO-DYNAMO.webp")).convert("RGB")
    # recorte panoramico 1200x460 (se muestra a 600x230)
    target_ratio = 1200 / 460
    w, h = im.size
    if w / h > target_ratio:
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        im = im.crop((left, 0, left + new_w, h))
    else:
        new_h = int(w / target_ratio)
        top = int((h - new_h) * 0.42)
        im = im.crop((0, top, w, top + new_h))
    im = im.resize((1200, 460), Image.LANCZOS)

    # velo oscuro inferior para que se lea el texto sobreimpreso
    veil = Image.new("RGBA", (1200, 460), (0, 0, 0, 0))
    vd = ImageDraw.Draw(veil)
    for y in range(460):
        a = int(200 * max(0, (y - 150) / 310) ** 1.4)
        vd.line([(0, y), (1200, y)], fill=(6, 2, 30, a))
    im = Image.alpha_composite(im.convert("RGBA"), veil).convert("RGB")

    d = ImageDraw.Draw(im)
    d.text((56, 300), "Grupajes y carga completa", font=font("InstrumentSans-Bold.ttf", 54), fill=WHITE)
    d.text((56, 372), "Nacional  ·  Europa  ·  Urgentes 24 h",
           font=font("InstrumentSans-Regular.ttf", 34), fill=(214, 210, 235))
    im.save(os.path.join(OUT, "hero.jpg"), quality=82, optimize=True, progressive=True)
    print("hero.jpg", im.size)


# ------------------------------------------------------- muro de clientes 4x4
CLIENTES = [
    ("jysk.webp", "JYSK", ""),
    ("BIGMAT.webp", "BigMat", ""),
    ("SKLUM.webp", "SKLUM", ""),
    ("STRUGAL.webp", "Strugal", ""),
    ("ghi.webp", "ghi", "Smart Furnaces"),
    ("GRAMOFLOR.webp", "Gramoflor", "Iberica"),
    ("QUIMICAS ORO.webp", "Químicas Oro", ""),
    ("JUMASA.webp", "Jumasa", ""),
    ("RIMOBEL.webp", "Rimobel", ""),
    ("PISCIMAR.webp", "Piscimar", ""),
    ("COAVANTIA.webp", "Coavantia", ""),
    ("DIMASIBER.webp", "Dimasiber", ""),
    ("TRANSMETALICAS.webp", "Transmetálicas", ""),
    ("hidrodiseno.webp", "Hidrodiseño", ""),
    ("aceitunascazorla.webp", "Aceitunas", "Cazorla"),
    ("TODOEMBALAJE.webp", "TodoEmbalaje", ""),
]

COLS, ROWS = 4, 4
CELL_W, CELL_H, GAP = 292, 104, 12
PAD = 8


def build_clientes():
    W = COLS * CELL_W + (COLS - 1) * GAP + PAD * 2
    H = ROWS * CELL_H + (ROWS - 1) * GAP + PAD * 2
    canvas = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(canvas)
    f_name = font("InstrumentSans-Bold.ttf", 25)
    f_sub = font("InstrumentSans-Regular.ttf", 19)

    for i, (fn, name, sub) in enumerate(CLIENTES[: COLS * ROWS]):
        col, row = i % COLS, i // COLS
        x = PAD + col * (CELL_W + GAP)
        y = PAD + row * (CELL_H + GAP)

        d.rounded_rectangle([x, y, x + CELL_W, y + CELL_H], radius=18,
                            fill=WHITE, outline=GRAY_200, width=2)

        logo = flatten(Image.open(os.path.join(LOGOS, fn)))
        logo.thumbnail((64, 64), Image.LANCZOS)
        lx = x + 22
        ly = y + (CELL_H - logo.size[1]) // 2
        canvas.paste(logo, (lx, ly))

        tx = x + 22 + 64 + 20
        avail = (x + CELL_W - 18) - tx

        # encoge el cuerpo si el nombre no cabe en la pastilla
        fn_name, size = f_name, 25
        while d.textlength(name, font=fn_name) > avail and size > 16:
            size -= 1
            fn_name = font("InstrumentSans-Bold.ttf", size)

        if sub:
            d.text((tx, y + 28), name, font=fn_name, fill=NAVY)
            d.text((tx, y + 60), sub, font=f_sub, fill=GRAY_500)
        else:
            bbox = d.textbbox((0, 0), name, font=fn_name)
            d.text((tx, y + (CELL_H - (bbox[3] - bbox[1])) // 2 - 6), name, font=fn_name, fill=NAVY)

    canvas.save(os.path.join(OUT, "clientes.png"), optimize=True)
    print("clientes.png", canvas.size)


# ------------------------------------------------------ banner de cierre
def build_banner():
    """Banda de marca del pie: logo blanco de la web + servicios + contacto.
    Sustituye al antiguo banner dynamo + Agencia de Transporte."""
    W, H, BAR = 1200, 300, 74
    im = Image.new("RGB", (W, H), (51, 0, 204))
    d = ImageDraw.Draw(im)

    # degradado horizontal morado -> navy
    for x in range(W):
        t = x / W
        d.line([(x, 0), (x, H - BAR)],
               fill=(int(51 + (10 - 51) * t), int(0 + (2 - 0) * t), int(204 + (48 - 204) * t)))

    logo = Image.open(os.path.join(ROOT, "images", "4.png")).convert("RGBA")  # logo blanco
    logo.thumbnail((360, 360), Image.LANCZOS)
    im.paste(logo, (56, (H - BAR - logo.size[1]) // 2 - 6), logo)

    # chips de servicio a la derecha
    f_chip = font("InstrumentSans-Bold.ttf", 26)
    chips = [("CARGA COMPLETA", "NACIONAL"), ("GRUPAJE", "EUROPA")]
    cy = 58
    for left, right in chips:
        cx = W - 56
        for label, bg, fg in ((right, (34, 165, 90), WHITE), (left, WHITE, (10, 2, 48))):
            tw = d.textlength(label, font=f_chip)
            box_w = int(tw) + 40
            d.rounded_rectangle([cx - box_w, cy, cx, cy + 46], radius=8, fill=bg)
            d.text((cx - box_w + 20, cy + 10), label, font=f_chip, fill=fg)
            cx -= box_w + 10
        cy += 60

    # barra inferior de contacto
    d.rectangle([0, H - BAR, W, H], fill=(10, 2, 48))
    f_c = font("InstrumentSans-Regular.ttf", 25)
    txt = "955 225 945   ·   628 995 709   ·   info@dynamotrans.com   ·   dynamotrans.com"
    d.text(((W - d.textlength(txt, font=f_c)) / 2, H - BAR + 24), txt, font=f_c, fill=(200, 195, 230))

    im.save(os.path.join(OUT, "banner-dynamo.png"), optimize=True)
    print("banner-dynamo.png", im.size)


# --------------------------------------------------------------- foto firma
def build_alvaro():
    im = flatten(Image.open(os.path.join(ROOT, "images", "ALVARO_circular_ZOOM.png")))
    im = im.resize((160, 160), Image.LANCZOS)  # se muestra a 80px
    im.save(os.path.join(OUT, "alvaro.png"), optimize=True)
    print("alvaro.png", im.size)


if __name__ == "__main__":
    build_logo()
    build_hero()
    build_clientes()
    build_alvaro()
    build_banner()
