# CSV-verkstan

Ett webbaserat verktyg för att läsa in, städa, matcha och exportera CSV- och Excel-data. Det körs **helt i webbläsaren** — ingen fil laddas upp någonstans.

![Skärmbild av CSV-verkstan med en öppnad exempelfil](docs/skarmbild.png)

## Två principer

**Originaltexten är sanningen.** Kolumntypen (`Text` / `Tal` / `Datum` / `E-post`) är en *tolkning* som styr sortering, filter och vilka verktyg som erbjuds. Den skriver aldrig om ett värde. Postnumret `01234` förblir `01234`, telefonnumret `0730-123456` förblir som det är, och `007` blir aldrig `7`.

**Inget ändras utan att du ser resultatet först.** Varje åtgärd visar siffror och exempel innan den körs, och allt går att ångra.

## Integriteten går att kontrollera

Sidan levereras med en säkerhetspolicy som innehåller `connect-src 'none'`. Webbläsaren tillåter alltså inte appen att göra ett enda nätverksanrop — det är inte ett löfte i en text, utan något du kan verifiera själv i utvecklarverktygens nätverksflik. Ett test i CI misslyckas om appen någonsin försöker.

Inga externa typsnitt, inget CDN, ingen analys, ingen felrapportering, ingen inloggning.

## Vad som fungerar idag

- **Öppna** CSV, TXT och TSV genom att släppa filen var som helst i fönstret, eller välja den. Flera filer samtidigt, som flikar.
- **Teckenkodning och avgränsare upptäcks** — UTF-8, UTF-8 med BOM, UTF-16 och Windows-1252, samt `;` `,` tabb och `|`. Importdialogen visar gissningen i stället för att fatta den i tysthet, och säger på svenska om svenska tecken ser rätt ut.
- **Importvarningar** för det som annars försvinner tyst: trasiga rader, dubbletta rubriker, tomma rubriker, Excels `sep=;`-rad och spökrader som bara är avgränsare.
- **Kolumner** kan infogas, tas bort, byta namn, dupliceras, döljas och flyttas — genom att dra rubriken, dra i sidopanelen, eller via kolumnmenyn.
- **Kolumninspektör** med antal ifyllda, tomma, unika och otolkbara värden, plus de vanligaste värdena. Klick på ”Visa de N raderna” filtrerar fram problemen.
- **Redigera** celler direkt (`Enter`, `F2` eller dubbelklick), markera områden med mus eller `Skift`+piltangenter, töm markeringen med `Delete`, och fyll nedåt med `Ctrl+D`.
- **Snabbsumma** i statusraden för markeringen — antal, summa och medel, med svenska tal som `1 240,50` korrekt tolkade.
- **Rader** kan infogas, dubbleras och tas bort. Helt tomma rader och kolumner kan städas bort i ett svep.
- **Urklipp mot Excel**: `Ctrl+C` kopierar markeringen som TSV, `Ctrl+V` klistrar in TSV eller CSV. Är det inklistrade större än markeringen frågar verktyget om det ska lägga till plats eller klippa av — det klipper aldrig av i tysthet. Inklistring i tomma läget öppnar datat som en ny fil.
- **Sök** med `Ctrl+F`, accentokänsligt: `oberg` hittar `Öberg`. Träffarna markeras och räknas.
- **Städa text**: trimma blanksteg, slå ihop dubbla mellanslag, ta bort osynliga tecken, VERSALER, gemener och Stor Första Bokstav.
- **Ångra och gör om** på allt, med en steglista där du kan backa till vilket steg som helst.
- **Export** till CSV med val av avgränsare, teckenkodning, BOM, radslut och vilka rader och kolumner som ska med. Förvalet är Excel-vänligt: semikolon, CRLF och UTF-8 med BOM. Formelskyddet är riskbaserat och rör inte negativa tal.
- Mörkt läge, tomt läge med exempelfil, och en varning innan sidan lämnas med osparat arbete.

## På gång

Excel-filer in och ut, datum- och e-postverktyg, sök & ersätt, flernivåsortering, filterbyggare, dubbletthantering, matchning av två filer med restlistor, samt Combine, Template och profiler.

## Utveckling

```sh
npm install
npm run dev        # utvecklingsserver
npm test           # enhetstester
npm run typecheck  # typkontroll
npm run build      # produktionsbygge till dist/
npx playwright test # röktest i riktig webbläsare
```

Koden är delad i två halvor med en hård gräns emellan:

- `src/core/` är ren logik utan DOM: teckenkodning, parsning, datamodell, typtolkning, export. Den går att testa utan webbläsare och är där enhetstesterna ligger.
- `src/ui/`, `src/state/` och `src/worker/` är gränssnittet och bakgrundstråden.

Filparsning körs i en Web Worker. Datamodellen är kolumnbaserad och ordbokskodad, vilket gör att kolumnernas kod- och flaggarrayer kan överföras mellan trådarna utan kopiering — bara de unika värdena klonas.

## Publicering

GitHub Actions kör typkontroll, enhetstester, bygge och röktest vid varje push, och publicerar till GitHub Pages från `main`. Bygget använder relativ bas, så det fungerar oavsett om sajten ligger under ett repo-namn, på ett eget domännamn eller öppnas direkt från disk.
