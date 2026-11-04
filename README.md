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

## Automatisk oppdatering

En lenket Sites-plan kaller den private `/api/automation`-ruten. Hentingen får fire
vinduer i Europe/Oslo: 06:00, 13:00, 17:00 og 21:30. Et varig jobbnummer hindrer doble
importer. Ruten kan også behandle eksisterende menneskelige godkjenninger; den kan
aldri godkjenne innhold. Innstillinger i appen kan pause all automatisering.

`python/sync.py` og den manuelle GitHub Actions-jobben er et alternativt inngangspunkt.
Bruk bare én planlegger for gjentakende kjøring. GitHub Secrets for dette er
`SOME_SITE_URL` og `SOME_SITE_SERVICE_TOKEN`. Tjenestetilgang erstatter ikke menneskelig
godkjenning, og nøkkelen skal bare kunne behandles i godkjente tjenesteoppsett.
