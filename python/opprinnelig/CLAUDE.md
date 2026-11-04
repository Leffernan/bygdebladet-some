# Instagram-postar for Bygdebladet – oppgåve for Claude Code

Koden i denne mappa er ferdig skriven og testa mot ei simulert nettside, men IKKJE mot
den ekte bygdebladet.com. Jobben din er å teste mot den ekte sida, rette det som ikkje
stemmer, og leggje alt i GitHub-repoet `r92654500-star/instagram-postar`.

## Filer
- `lag_post.py` – malen (1080x1080). Ikkje endre utsjånaden utan at Reidar ber om det.
- `hent_saker.py` – finn nye saker, lagar postar, sender e-post.
- `.github/workflows/instagram.yml` – køyrer kl. 06.00, 13.00, 17.00 og 21.30 norsk tid.
- `assets/` – fontar (OFL-lisens) og logoen.

## Steg
1. `pip install -r requirements.txt`, så `python hent_saker.py --test`.
   Sjekk i mappa `ut/` at dei 3 nyaste sakene får rett tittel, bilete og bildetekst.
2. Kontroller mot den ekte sida og rett i `hent_saker.py` om nødvendig:
   - At `finn_saker()` finn saklenkjene på forsida (mønster `/19.<id>` eller `/19.1.<id>`).
     Finst det ein RSS-feed, kan han brukast i staden om han er meir påliteleg.
   - At `og:title`, `og:description` og `og:image` finst, og at tittelen ikkje får
     « - Bygdebladet» eller liknande på slutten.
   - At KI-illustrasjonar får merket «Illustrasjon: KI», og at «Foto: Namn» blir plukka
     frå bilettekst til hovudbiletet, ikkje frå andre bilete på sida.
   - At stikktittel blir henta frå adressa (t.d. `/lov-og-rett/...`). Legg til fleire
     seksjonar i `SEKSJONAR` om sida brukar andre.
3. Vis Reidar biletfilene og bildetekstane før du går vidare.
4. Last opp til repoet (`gh` er innlogga). `sett.json` skal IKKJE lastast opp no;
   første køyring på GitHub lagar han sjølv.
5. Start éin manuell køyring: `gh workflow run instagram.yml -R r92654500-star/instagram-postar`
   og følg han med `gh run watch`. Første køyring sender dei 3 nyaste sakene på e-post.

## Reglar
- Secrets (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_TO`) ligg i GitHub.
  Skriv dei aldri inn i kode eller filer.
- Ingen nye saker = ingen e-post. Feil = éin kort e-post.
