"""Lagar ein 1080x1080 Instagram-post i Bygdebladet-malen."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

A = Path(__file__).parent / "assets"
W = H = 1080
PH = 700                      # høgda på fotoet
RED = (216, 29, 30)
BG = (18, 18, 20)


def _font(name, size):
    return ImageFont.truetype(str(A / name), size)


def _wrap(d, text, font, maxw):
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if d.textlength(t, font=font) <= maxw:
            cur = t
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def _balance(d, text, font, maxw):
    """Del ein tolinjes tittel så linjene blir jamlange, helst etter : eller ?"""
    ws, best = text.split(), None
    for i in range(1, len(ws)):
        a, b = " ".join(ws[:i]), " ".join(ws[i:])
        m = max(d.textlength(a, font=font), d.textlength(b, font=font))
        if m > maxw:
            continue
        score = m - (400 if a[-1] in ":?" else 0)
        if best is None or score < best[0]:
            best = (score, [a, b])
    return best[1] if best else None


def lag_post(bilete, tittel, ut, stikktittel=None, merke=None, fy=0.4):
    """bilete: filsti eller PIL.Image.
    merke: tekst nedst til høgre på fotoet, t.d. 'Illustrasjon: KI'.
    fy: 0 = bruk toppen av fotoet, 1 = botnen."""
    c = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(c)

    ph = bilete if isinstance(bilete, Image.Image) else Image.open(bilete)
    ph = ph.convert("RGB")
    s = max(W / ph.width, PH / ph.height)
    ph = ph.resize((round(ph.width * s), round(ph.height * s)), Image.LANCZOS)
    ox, oy = (ph.width - W) // 2, int((ph.height - PH) * fy)
    c.paste(ph.crop((ox, oy, ox + W, oy + PH)), (0, 0))

    # Logo øvst til høgre
    wm = Image.open(A / "wm.png")
    lw = 300
    lh = int(wm.height * lw / wm.width)
    wm = wm.resize((lw, lh), Image.LANCZOS)
    pad = 14
    bx, by = W - lw - 2 * pad - 28, 28
    d.rectangle([bx, by, bx + lw + 2 * pad, by + lh + 2 * pad], fill=RED)
    c.paste(wm, (bx + pad, by + pad))

    if merke:
        f = _font("Lato-Bold.ttf", 22)
        tw = d.textlength(merke, font=f)
        d.rounded_rectangle([W - tw - 44, PH - 56, W - 20, PH - 18], radius=6, fill=(0, 0, 0))
        d.text((W - tw - 32, PH - 50), merke, font=f, fill=(255, 255, 255))

    d.rectangle([0, PH, W, PH + 8], fill=RED)
    if stikktittel:
        d.text((60, PH + 42), stikktittel.upper(),
               font=_font("BarlowCondensed-Bold.ttf", 36), fill=RED)
        y0 = PH + 88
    else:
        y0 = PH + 50
    rom = H - 80 - y0

    for size in range(92, 50, -2):
        f = _font("BarlowCondensed-ExtraBold.ttf", size)
        lines = _wrap(d, tittel, f, 960)
        lh_ = int(size * 1.06)
        if len(lines) * lh_ <= rom:
            break
    if len(lines) == 2:
        lines = _balance(d, tittel, f, 960) or lines
    y = y0
    for line in lines:
        d.text((60, y), line, font=f, fill=(255, 255, 255))
        y += lh_

    d.text((60, H - 58), "Les heile saka på bygdebladet.com",
           font=_font("Lato-Regular.ttf", 28), fill=(190, 190, 190))
    c.convert("RGB").save(ut, quality=92)
    return ut
