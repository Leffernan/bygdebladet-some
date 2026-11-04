# Koble til Facebook og Instagram

1. Bekreft at Instagram er en profesjonell konto koblet til riktig Facebook-side.
2. Opprett en Meta-app for redaksjonens egen publisering og gi nødvendige roller.
3. Bruk Facebook Login og be bare om `pages_show_list`, `pages_read_engagement`,
   `pages_manage_posts`, `instagram_basic` og `instagram_content_publish`.
4. Hent riktig Page Access Token. Kontroller kontoens oppgaver/roller og faktiske scopes.
   Behov for App Review eller Business Verification avhenger av appens bruk og tilgang.
5. Sett beskyttede Sites-serverinnstillinger: `META_PAGE_ID`, `META_INSTAGRAM_ID`,
   `META_PAGE_ACCESS_TOKEN` og `META_API_VERSION` (en gjeldende støttet versjon fra Meta).
6. Publiser ny Sites-versjon etter endring av serverinnstillinger og trykk
   «Kontroller tilkoblingen». Dette er en lesetest, ingen publisering.
7. Godkjenn ett testinnlegg som faktisk kan publiseres. Kontroller begge innleggene,
   bildet, teksten og kanalstatus før dere bruker systemet ordinært.

## Bilder på privat Site

Meta kan ikke hente en fil bak ChatGPT-innlogging. Appen laster derfor den godkjente
JPEG-filen opp som et **upublisert** bilde på Facebook-siden. Facebook-posten bruker
bilde-ID-en. Instagram-beholderen bruker bildets Facebook CDN-adresse.

Meta dokumenterer byggesteinene (upubliserte Page-foto, `images`/`source`, `attached_media`
og Instagram `image_url`), men kombinasjonen er en teknisk tilpasning som må prøves
med de faktiske kontoene. Appen gjetter aldri en offentlig URL til det private bildet.
Hvis CDN-adressen ikke godtas, vil Instagram få en synlig feil; da trengs en egen
publiseringsbildevert før Instagram kan tas i bruk.

## Feil og ny kjøring

- «Feilet»: vis feilmeldingen og rett opp før ny kontroll/publisering.
- «Bildet klargjøres»: kontroller igjen etter minst ett minutt.
- «Må kontrolleres»: Meta kan ha mottatt publiseringen. Appen prøver å avklare via
  lagret beholder-ID eller `page_story_id`. Den sender ikke samme siste kall på nytt.
- En vellykket kanal gjentas aldri fordi den andre kanalen feilet.
- En avvist sak hentes ikke inn som nytt utkast igjen automatisk.

## Primærkilder

- https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- https://github.com/meta/facebook-python-business-sdk/blob/main/examples/PagePhotosPost.py
- https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/page.py
- https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/photo.py
- https://github.com/facebookincubator/catalogue-of-api-solutions/blob/main/solutions/creators/organic-content-creation.md
