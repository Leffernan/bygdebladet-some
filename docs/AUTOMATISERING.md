# Automatisk oppdatering av denne appen

Appens private oppdateringsrute er `POST /api/automation` med JSON `{}`.
Sites sin `get_site` returnerer denne appens `current_live_url` og, når det er støttet,
`siwc_bypass_bearer_token`. Bruk bare dette tokenet som
`OAI-Sites-Authorization: Bearer ...` til samme Site. Hold tokenet i minnet, ikke i
kommandoargumenter, filer, logger, oppgavebeskrivelsen eller modellutskrift.

Rutinen kontrollerer pauseinnstillingen, importerer i de fire norske tidsvinduene,
og publiserer kun poster med lagret menneskelig godkjenning for gjeldende revisjon.
Den endrer aldri godkjenning. Hver import har en varig jobblås; feil kan prøves igjen.
`GET /api/data` viser køen og siste hentestatus for kontroll etter en kjøring.
`{"forceCollection":true}` brukes bare til en uttrykkelig manuell henting eller
førstegangskontroll, aldri til vanlige planlagte kjøringer.

De lenkede planene kjører klokken 06:00, 13:00, 17:00 og 21:30 i Europe/Oslo.
De følger også opp allerede godkjente poster. Mens en godkjent post er åpen i appen,
kontrolleres ventende publisering etter minst ett minutt, inntil fem ganger. Lukkes
posten, vil neste planlagte kjøring følge den opp. Knappen i appen kan også brukes. Ikke godkjenn eller lag testinnlegg som del av automatiseringen.
Varsle redaksjonen ved feil som krever oppfølging; normale kjøringer trenger ikke
noen beskjed. Hentingsfeil finnes også i appens historikk.
