"""Hentar nye saker frå bygdebladet.com, lagar Instagram-postar og sender dei på e-post.

Køyr:  python hent_saker.py            (vanleg køyring)
       python hent_saker.py --test     (lagar postar for dei 3 nyaste sakene, sender ikkje e-post,
                                        legg filene i mappa ut/)
"""
import io
import json
import os
import re
import smtplib
import sys
import traceback
from email.message import EmailMessage
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from PIL import Image

from lag_post import lag_post

FORSIDE = "https://bygdebladet.com/"
SETT = Path(__file__).parent / "sett.json"
UT = Path(__file__).parent / "ut"
UA = {"User-Agent": "Bygdebladet-Instagram-postar/1.0"}
MAKS_PER_KOYRING = 15
ID_RE = re.compile(r"/19\.(?:1\.)?(\d{4,})")

# Stikktitlar ut frå første del av adressa (t.d. /lov-og-rett/...)
SEKSJONAR = {
    "lov-og-rett": "Lov og rett", "kultur": "Kultur", "sport": "Sport",
    "naering": "Næring", "næring": "Næring", "nyheiter": "Nyheiter",
    "nyheter": "Nyheiter", "folk": "Folk", "meiningar": "Meiningar",
}

# Stadnamn -> kommune, for emneknaggar
KOMMUNAR = {
    "Ålesund": ["ålesund", "skodje", "ørskog", "sjøholt", "spjelkavik", "moa",
                "ellingsøy", "stette", "valle"],
    "Haram": ["haram", "brattvåg", "søvik", "vatne", "tennfjord", "lepsøy"],
    "Vestnes": ["vestnes", "tomrefjord", "vikebukt", "vike", "fiksdal", "helland"],
    "Fjord": ["fjord kommune", "stordal", "norddal", "valldal", "eidsdal", "tafjord"],
}


def hent(url):
    r = requests.get(url, headers=UA, timeout=30)
    r.raise_for_status()
    return r


def finn_saker():
    """Returnerer {id: url} for saker lenka frå forsida, nyaste (høgast id) først."""
    html = hent(FORSIDE).text
    saker = {}
    for href in re.findall(r'href="([^"]+)"', html):
        m = ID_RE.search(href)
        if not m:
            continue
        url = requests.compat.urljoin(FORSIDE, href.split("?")[0])
        if "bygdebladet.com" in url:
            saker.setdefault(m.group(1), url)
    return dict(sorted(saker.items(), key=lambda kv: -int(kv[0])))


def meta(soup, prop):
    t = soup.find("meta", attrs={"property": prop}) or soup.find("meta", attrs={"name": prop})
    return t["content"].strip() if t and t.get("content") else None


def les_sak(url):
    soup = BeautifulSoup(hent(url).text, "html.parser")
    tittel = meta(soup, "og:title") or (soup.title.string if soup.title else "")
    tittel = re.sub(r"\s*[-|–]\s*Bygdebladet.*$", "", tittel or "").strip()
    ingress = meta(soup, "og:description") or ""
    bilete_url = meta(soup, "og:image")

    tekst = soup.get_text(" ", strip=True)
    merke = None
    if re.search(r"(laget|laga|lagd|generert)\s+(med|av)\s+(KI|AI)|KI-generert|KI-illustrasjon", tekst, re.I):
        merke = "Illustrasjon: KI"
    else:
        m = re.search(r"Foto:\s*([A-ZÆØÅ][\wæøåÆØÅ.\-]+(?:\s+[A-ZÆØÅ][\wæøåÆØÅ.\-]+){0,2})", tekst)
        if m:
            merke = "Foto: " + m.group(1)

    del_ = [p for p in requests.compat.urlparse(url).path.split("/") if p]
    stikk = SEKSJONAR.get(del_[0].lower()) if len(del_) >= 3 else None
    return {"url": url, "tittel": tittel, "ingress": ingress,
            "bilete_url": bilete_url, "merke": merke, "stikk": stikk}


def emneknaggar(sak):
    tekst = (sak["tittel"] + " " + sak["ingress"]).lower()
    k = ["#bygdebladet"]
    for kommune, ord_ in KOMMUNAR.items():
        if any(re.search(rf"\b{re.escape(o)}\b", tekst) for o in ord_):
            k.append("#" + kommune.lower().replace(" ", ""))
    return " ".join(dict.fromkeys(k))


def bildetekst(sak):
    return (f"{sak['ingress']}\n\nLes heile saka på bygdebladet.com (lenke i bio)\n\n"
            f"{emneknaggar(sak)}").strip()


def lag(sak, sakid):
    UT.mkdir(exist_ok=True)
    if not sak["bilete_url"]:
        raise ValueError("fann ikkje noko bilete i saka")
    bilete = Image.open(io.BytesIO(hent(sak["bilete_url"]).content))
    slug = sak["tittel"].lower().translate(str.maketrans({"æ": "ae", "ø": "o", "å": "a"}))
    slug = re.sub(r"[^a-z0-9]+", "-", slug)[:40].strip("-")
    fil = UT / f"{sakid}-{slug}.jpg"
    lag_post(bilete, sak["tittel"], fil, stikktittel=sak["stikk"], merke=sak["merke"])
    return fil


def send(emne, tekst, vedlegg=None):
    msg = EmailMessage()
    msg["From"] = os.environ["SMTP_USER"]
    msg["To"] = os.environ["MAIL_TO"]
    msg["Subject"] = emne
    msg.set_content(tekst)
    if vedlegg:
        msg.add_attachment(Path(vedlegg).read_bytes(), maintype="image",
                           subtype="jpeg", filename=Path(vedlegg).name)
    with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", 587))) as s:
        s.starttls()
        s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
        s.send_message(msg)


def main():
    test = "--test" in sys.argv
    saker = finn_saker()
    if not saker:
        raise RuntimeError("Fann ingen saker på forsida – har nettsida endra seg?")

    forste_gong = not SETT.exists()
    sett = set(json.loads(SETT.read_text())) if SETT.exists() else set()

    if test:
        nye = list(saker.items())[:3]
    elif forste_gong:
        # Første køyring: send dei 3 nyaste som test, merk resten som sett
        nye = list(saker.items())[:3]
        sett |= set(saker)
    else:
        nye = [(i, u) for i, u in saker.items() if i not in sett][:MAKS_PER_KOYRING]

    feil = []
    for sakid, url in reversed(nye):          # eldste først, så nyaste ligg øvst i innboksen
        try:
            sak = les_sak(url)
            fil = lag(sak, sakid)
            tekst = f"{bildetekst(sak)}\n\n---\nSak: {url}"
            if test:
                (UT / f"{fil.stem}.txt").write_text(tekst, encoding="utf-8")
                print("Laga", fil)
            else:
                send(f"Instagram: {sak['tittel']}", tekst, fil)
            sett.add(sakid)
        except Exception as e:                # ei sak som feilar skal ikkje stoppe resten
            feil.append(f"{url}: {e}")
            sett.add(sakid)                   # ikkje prøv same saka igjen ved neste køyring

    if not test:
        SETT.write_text(json.dumps(sorted(sett, key=int)[-2000:]))
    if feil:
        raise RuntimeError("Nokre saker feila:\n" + "\n".join(feil))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        melding = traceback.format_exc()
        print(melding)
        if "--test" not in sys.argv and os.environ.get("SMTP_USER"):
            try:
                send("Instagram-postar: køyringa feila", melding[-3000:])
            except Exception:
                pass
        sys.exit(1)
