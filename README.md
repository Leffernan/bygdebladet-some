# Bygdebladet SoMe

Privat redaksjonelt arbeidsrom for å hente toppsaker, produsere 1080 × 1080-poster,
redigere bilde og kanaltekster, og godkjenne publisering til Facebook og Instagram.

## Gjenbrukt fra Python-prosjektet

Logo, Lato og Barlow Condensed, bildemalens mål og farger, balansering av overskrifter,
OG-metadata og kommuneforslag er gjenbrukt. `python/opprinnelig/` bevarer kildeprosjektet
som referanse. Den gamle e-postflyten kjører ikke automatisk.

Hentingen er flyttet til serveren slik at «Hent toppsaker» virker direkte. Den leser
nettavisens redaksjonelle tittellenker i forsiderekkefølge, utelater meny og reklame,
og fjerner duplikater med saksnummer. Den sorterer ikke etter saksnummer.

## Kjøring

Node 22.13+, `npm ci`, `npm run db:generate` ved schemaendringer, og `npm run dev`.
Kjør `node --test tests/*.test.mjs` og `npx tsc --noEmit` før bygging.
Publiser via Sites-verktøyene. `.openai/hosting.json` peker på eksisterende prosjekt.
D1 og R2 provisioneres av Sites. Lokale og produserte data er separate.

## Godkjenning

Godkjenning krever innlogget bruker, gjeldende revisjon og tre eksplisitte kontroller.
Det ferdige JPEG-bildet lagres uforanderlig med SHA-256, revisjon, godkjenner og tidspunkt.
Publisering bruker denne lagrede filen og de låste kanaltekstene. Redigering opphever
godkjenningen. Endringer er sperret når en kanal er publisert eller utfallet er ukjent.
Hver kanal har egen status og et atomisk sendelås. Nettverksfeil under siste sendekall
blir «ukjent utfall», ikke automatisk repetisjon. Meta-status må avklares først.

## Meta-oppsett

Se `docs/META_OPPSETT.md`. Faktisk publisering er ikke verifisert før eieren kobler til
Meta og tester med et uttrykkelig godkjent innlegg. Ingen tilgangsnøkler ligger i repoet.

## Brukere og profil

Toppfeltet følger produksjonshuben. Innstillinger → Profil styrer avisnavn, løsningsnavn,
profilfarge og logo for arbeidsrommet. Postbildenes redaksjonelle mal er separat;
godkjente bilder endres aldri av en profilendring. Logoer lagres i R2 og valideres før bruk.

Innstillinger → Brukere viser aktive og deaktiverte brukere, første innlogging og sist sett.
Navn og e-post kan registreres før personen logger inn. ChatGPT bekrefter identiteten,
og første innlogging binder kontoen til det stabile, Site-spesifikke subjektet. Alle aktive
brukere har full tilgang. Eieren og egen konto kan ikke deaktiveres. Historikk slettes ikke.
En bruker må også ha adgang gjennom Sites-delingen i ChatGPT; brukeropprettelsen alene
sender ingen invitasjon og endrer ikke Sites-tilgangen. Skjemaet har en kopierbar forespørsel
for å fullføre delingen i ChatGPT. Sites-koblingen kan ikke kalles fra denne appen.

`APP_OWNER_EMAIL` og `APP_OWNER_NAME` er native Sites-innstillinger hentet fra den
bekreftede eieren. Den eksisterende eieren registreres automatisk. Andre kan ikke
registrere seg selv. Godkjenninger lagrer både bruker-ID og navnet ved godkjenning.

## Automatisk oppdatering

En lenket Sites-plan kaller den private `/api/automation`-ruten. Hentingen får fire
vinduer i Europe/Oslo: 06:00, 13:00, 17:00 og 21:30. Et varig jobbnummer hindrer doble
importer. Ruten kan også behandle eksisterende menneskelige godkjenninger; den kan
aldri godkjenne innhold. Innstillinger i appen kan pause all automatisering.

`python/sync.py` og den manuelle GitHub Actions-jobben er et alternativt inngangspunkt.
Bruk bare én planlegger for gjentakende kjøring. GitHub Secrets for dette er
`SOME_SITE_URL` og `SOME_SITE_SERVICE_TOKEN`. Tjenestetilgang erstatter ikke menneskelig
godkjenning, og nøkkelen skal bare kunne behandles i godkjente tjenesteoppsett.
