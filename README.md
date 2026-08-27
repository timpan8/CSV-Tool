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

- **Öppna** CSV, TXT, TSV och Excel (`.xlsx`) genom att släppa filen var som helst i fönstret, eller välja den. Flera filer samtidigt, som flikar. Arbetsböcker med flera blad låter dig välja blad.
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
- **Städverktyg med förhandsvisning i tabellen.** Panelen ligger bredvid tabellen, inte över den, och visar förslaget på ditt eget data medan du ställer in. En omskrivning ritas som <code>före → efter</code> i cellen; en ny kolumn ritas som en spökkolumn med streckad ram intill sin källa. `Bara ändrade` och `Bara problem` filtrerar fram just de raderna. Ingenting ändras förrän du klickar Tillämpa, och `Ctrl+Z` tar tillbaka det.
  - **Datum** — inventerar vilka format kolumnen faktiskt innehåller, med antal och exempel ur din fil. Tvetydiga format gissas aldrig: `03/04/2026` kan vara 3 april eller 4 mars, och verktyget letar först efter bevis i kolumnen (ett värde där ena talet är större än 12) innan det frågar. Ett datum passerar aldrig ett `Date`-objekt, så inga tidszoner kan förskjuta dygnet. Exceldatum som serienummer tolkas bara om du ber om det.
  - **Tal** — skalar av `kr`, `%` och tusentalsavgränsare, läser bokföringens `(1 240,50)` och `1240–` som negativa tal, och skriver om till decimalkomma eller decimalpunkt. Punktens tvetydighet (`1.234`) hanteras som datumens: bevis först, fråga sedan.
  - **Telefon** — normaliserar till `+46701234567` eller `0701234567` så att nummer går att jämföra. Ingen snygg gruppering, eftersom riktnumrets längd varierar och en gissning som blir fel ser rimlig ut.
  - **E-post → namn** — förnamn, efternamn, `Förnamn Efternamn`, domän, domän utan toppdomän eller toppdomän, som en ny kolumn bredvid adressen. Funktionsadresser som `info@` blir inte personer. Panelen säger rakt ut att å, ä och ö inte går att få tillbaka.
  - **Dela kolumn** — vid varje, första eller sista förekomsten av ett tecken, eller på en fast position. Det som inte får plats hamnar i sista kolumnen i stället för att försvinna.
  - **Slå ihop kolumner** — en mall som `{Förnamn} {Efternamn}`. Kolumnnamn som inte finns rapporteras i stället för att tyst bli tomma.
  - **Sök och ersätt** — bokstavligt eller reguljärt uttryck, med felet visat medan du skriver. Bokstavlig sökning är bokstavlig: `1.5` matchar inte `125`.
- **Ångra och gör om** på allt, med en steglista där du kan backa till vilket steg som helst.
- **Export** till Excel (`.xlsx`) eller CSV. Excel är förvalt, eftersom det är det enda formatet som både bevarar `01234` som `01234` och skriver talkolumner som riktiga tal så att `SUMMA` fungerar. CSV-exporten har val av avgränsare, teckenkodning, BOM och radslut, med en Excel-vänlig profil (semikolon, CRLF, UTF-8 med BOM) och ett riskbaserat formelskydd som inte rör negativa tal.
- Mörkt läge, tomt läge med exempelfil, och en varning innan sidan lämnas med osparat arbete.

En Excel-fil innehåller typade värden i stället för text, så importen måste skriva om dem. Det sägs rakt ut i dialogen: datum blir `ÅÅÅÅ-MM-DD` (läst i UTC, så dagen aldrig förskjuts) och tal får det decimaltecken du väljer, utan tusentalsavgränsare.

## På gång

Flernivåsortering, filterbyggare, dubbletthantering, matchning av två filer med restlistor, samt Combine, Template och profiler.

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

GitHub Actions kör typkontroll, enhetstester, bygge och röktest på varje pull request och på varje push till `main`, och publicerar till GitHub Pages från `main`. En utvecklingsgren får alltså sina kontroller så snart den har en öppen PR — vilket också är det som gör att varje commit bara körs en gång. Bygget använder relativ bas, så det fungerar oavsett om sajten ligger under ett repo-namn, på ett eget domännamn eller öppnas direkt från disk.
