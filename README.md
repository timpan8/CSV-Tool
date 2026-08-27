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
- **Importvarningar** för det som annars försvinner tyst: trasiga rader, dubbletta rubriker, tomma rubriker, Excels `sep=;`-rad och spökrader som bara är avgränsare. Öppnar du en fil vars innehåll är identiskt med en redan öppen flik sägs det rakt ut — men som en varning, inte som en fråga, eftersom man ibland vill ha två kopior att jämföra.
- **Kolumner** kan infogas, tas bort, byta namn, dupliceras, döljas och flyttas — genom att dra rubriken, dra i sidopanelen, eller via kolumnmenyn.
- **Kolumninspektör** med antal ifyllda, tomma, unika och otolkbara värden, plus de vanligaste värdena. Klick på ”Visa de N raderna” filtrerar fram problemen.
- **Kolumnöversikt** som svarar på frågan man ställer innan man börjar: *vad är det här för fil?* En rad per kolumn med typ, ifyllnad, unika värden, problem — och vad innehållet talar för att du gör härnäst. Klick på ett förslag öppnar rätt verktyg på rätt kolumn.
- **Högerklick** på en cell, en rubrik eller ett radnummer. Cellmenyn är kortare än kolumnmenyn med flit: kolumnens sällanåtgärder hör hemma på rubriken. Menyn kan styras med piltangenterna, och menytangenten öppnar den vid markeringen. En flercellsmarkering överlever högerklicket.
- **Verktygen föreslås utifrån innehållet, inte utifrån typen.** Kolumntypen kan inte uttrycka att en kolumn innehåller telefonnummer, och en kolumn med adresser kan mycket väl stå som text för att importen inte vågade gissa. Menyn frågar i stället verktygens egna inventeringsfunktioner och sätter det som passar överst, med sitt skäl utskrivet: *E-post → namn — 14 av 16 ser ut som adresser*. Resten göms inte, de ligger under *Fler verktyg*.
- **Redigera** celler direkt (`Enter`, `F2` eller dubbelklick), markera områden med mus eller `Skift`+piltangenter, töm markeringen med `Delete`, och fyll nedåt med `Ctrl+D`.
- **Snabbsumma** i statusraden för markeringen — antal, summa och medel, med svenska tal som `1 240,50` korrekt tolkade.
- **Rader** kan infogas, dubbleras och tas bort. Helt tomma rader och kolumner kan städas bort i ett svep.
- **Urklipp mot Excel**: `Ctrl+C` kopierar markeringen som TSV, `Ctrl+V` klistrar in TSV eller CSV. Är det inklistrade större än markeringen frågar verktyget om det ska lägga till plats eller klippa av — det klipper aldrig av i tysthet. Inklistring i tomma läget öppnar datat som en ny fil.
- **Sök** med `Ctrl+F`, accentokänsligt: `oberg` hittar `Öberg`. Träffarna markeras och räknas.
- **Städa text**: trimma blanksteg, slå ihop dubbla mellanslag, ta bort osynliga tecken, VERSALER, gemener och Stor Första Bokstav.
- **Verktyg över flera kolumner.** Datum, tal, telefon och sök & ersätt kör över hela markeringen: markera tolv månadskolumner, högerklicka och kör en gång. Inventeringen räknar cellerna i alla de valda kolumnerna, förhandsvisningen ritas i var och en, och `Ctrl+Z` backar hela körningen som ett steg. Verktygen som *skapar* kolumner arbetar på den kolumn du klickade i — tolv nya kolumner ur en markering är sällan vad någon menade.
- **Städverktyg med förhandsvisning i tabellen.** Panelen ligger bredvid tabellen, inte över den, och visar förslaget på ditt eget data medan du ställer in. En omskrivning ritas som <code>före → efter</code> i cellen; en ny kolumn ritas som en spökkolumn med streckad ram intill sin källa. `Bara ändrade` och `Bara problem` filtrerar fram just de raderna. Ingenting ändras förrän du klickar Tillämpa, och `Ctrl+Z` tar tillbaka det.
  - **Datum** — inventerar vilka format kolumnen faktiskt innehåller, med antal och exempel ur din fil. Tvetydiga format gissas aldrig: `03/04/2026` kan vara 3 april eller 4 mars, och verktyget letar först efter bevis i kolumnen (ett värde där ena talet är större än 12) innan det frågar. Ett datum passerar aldrig ett `Date`-objekt, så inga tidszoner kan förskjuta dygnet. Exceldatum som serienummer tolkas bara om du ber om det.
  - **Tal** — skalar av `kr`, `%` och tusentalsavgränsare, läser bokföringens `(1 240,50)` och `1240–` som negativa tal, och skriver om till decimalkomma eller decimalpunkt. Punktens tvetydighet (`1.234`) hanteras som datumens: bevis först, fråga sedan.
  - **Telefon** — normaliserar till `+46701234567` eller `0701234567` så att nummer går att jämföra. Ingen snygg gruppering, eftersom riktnumrets längd varierar och en gissning som blir fel ser rimlig ut.
  - **E-post → namn** — förnamn, efternamn, båda två som var sin kolumn i ett svep, `Förnamn Efternamn`, domän, domän utan toppdomän eller toppdomän, som nya kolumner bredvid adressen. Funktionsadresser som `info@` blir inte personer. Panelen säger rakt ut att å, ä och ö inte går att få tillbaka.
  - **Dela kolumn** — vid varje, första eller sista förekomsten av ett tecken, eller på en fast position. Det som inte får plats hamnar i sista kolumnen i stället för att försvinna.
  - **Slå ihop kolumner** — en mall som `{Förnamn} {Efternamn}`. Kolumnnamn som inte finns rapporteras i stället för att tyst bli tomma.
  - **Sök och ersätt** — bokstavligt eller reguljärt uttryck, med felet visat medan du skriver. Bokstavlig sökning är bokstavlig: `1.5` matchar inte `125`.
- **Flernivåsortering** med svensk kollation, så att `Öberg` hamnar efter `Zetterlund` och `Kund 2` före `Kund 10`. Klicka på pilen i en rubrik, skift-klicka för att lägga till en nivå till. Talkolumner sorteras numeriskt och datumkolumner som datum oavsett hur de är skrivna; tomma celler hamnar alltid sist, i båda riktningarna — en tom cell är inte det minsta värdet, den saknas.
  **Ordningen fryses.** Rättar du en cell efter att ha sorterat ligger raden kvar under markören, och statusraden erbjuder *Sortera om*. Att raden hoppar iväg just när du rättat den är annars det som gör en sorterad lista omöjlig att arbeta sig igenom. Verktyget säger bara till när ändringen faktiskt rör en kolumn du sorterat på.
- **Filter** som en regellista: varje regel kan slås av utan att tas bort, och du väljer om alla regler måste stämma eller om någon räcker. Reglerna står som chips ovanför tabellen, för ett filter man glömt bort är ett filter som får en att dra fel slutsats om sitt data. Operatorerna följer kolumnens typ — storleksjämförelser och `mellan` bara på tal och datum — och räknas på ordboken, så en kolumn med 300 orter kostar 300 jämförelser oavsett om tabellen har tusen rader eller en miljon. En tom cell matchar bara `är tom`: den är inte ”inte Malmö”, den är okänd. Ett trasigt reguljärt uttryck visas som ett fel medan du skriver, och en regel vars kolumn du tagit bort ritas trasig och vaknar till liv igen med `Ctrl+Z`.
  Filtret går också att **vända** — *visa i stället de rader filtret döljer* — vilket är det enda sättet att märka att man sorterat bort fel saker. Vändningen gäller filtret som helhet: ”inte (A och B)” är inte samma mängd som ”inte A och inte B”. När urvalet stämmer gör två knappar det permanent: *behåll bara de som visas* eller *ta bort de som visas*, båda ångringsbara.
- **Dubbletter** på hela raden eller på de kolumner du väljer — det senare är nästan alltid det du vill, eftersom två poster om samma person brukar skilja sig på ett löpnummer eller ett datum. Du kan välja att strunta i skiftläge, extra blanksteg och å/ä/ö vid jämförelsen. Verktyget visar hur många grupper som hittades och hur många rader en rensning skulle ta bort *innan* du kör den, och grupperna visas samlade med en linje mellan sig. Borttagningen behåller den första eller den sista raden **i filens ordning**, inte i den du råkar titta på, och går att ångra.
  Verktyget skiljer också på grupper som är identiska i *varje* kolumn och grupper som bara är lika i nyckeln. De första kan tas bort utan att du tittar; de senare kan bära olika uppgifter — den ena raden har telefonnummer, den andra e-post. För dem finns ett tredje val: *den jag väljer*, med en ring vid radnumret för den rad som ska stanna.
- **Slå ihop två filer** på ett eller flera kolumnpar — `Namn` mot `Name`, eller `Namn`+`E-post` mot `Name`+`mail`. Verktyget föreslår paret utifrån rubrikernas namn och **räknar träffarna medan du ställer in**: hur många rader som hittar en träff, hur många som blir över på båda sidor, hur många som matchar mer än en rad, och hur många som har tom nyckel. Ett par kolumner som ger 3 träffar av 5 000 rader är nästan alltid fel kolumnpar — och det ska synas innan du kör, inte efteråt.
  Matchningstyperna är alla ekvivalensrelationer och körs som hashjoin: vanlig (struntar i versaler och blanksteg), teckenexakt, utan å ä ö, bara siffror, e-post mot namn, och namn mot förnamn + efternamn — den sista läser två kolumner på högersidan och sorterar orden, så att `Karlsson Anna` matchar `Anna Karlsson`. Det är inte en bekvämlighetsgräns utan en storleksordning — `börjar med` och luddig matchning kräver att varje rad jämförs med varje rad, alltså tio miljarder jämförelser för två filer med 100 000 rader. De hör hemma i restlistan, där antalet rader är litet och varje förslag ändå ska granskas.
  **Tomma nycklar matchar aldrig.** Två rader som båda saknar personnummer är inte samma person. Resultatet blir en ny flik där alla rader ur den första filen följer med, även de utan träff — de får tomma celler i stället för att försvinna.
- **Matchningsverkstaden** för raderna som blev över. En sammanslagning slutar aldrig på hundra procent, och resten är det arbete verktyg brukar lämna åt användaren. Här blir de omatchade raderna två listor att beta av, med fyra vägar ut: en ny runda på en annan kolumn, ett par gjort för hand, ett värde som rättas på plats så att raden hittar sin partner av sig själv, eller att skriva av raden när ingen partner finns. Sammanslagningen sker först när du är nöjd, och bara en gång. Restlistorna går att exportera som var sin CSV — raderna som blev över är ofta det man behöver skicka vidare till den som kan svara på varför de saknas.
  **Luddig likhet finns bara här** — aldrig som matchningstyp över hela filen, alltid på en kort lista och alltid granskad. Poängen visas som två tal, stavning och ordning, så att den säger *varför*: `Ängström Ida` mot `Ida Ängström` får sitt höga tal av ordmängden och inte av teckenlikheten. Talkolumner vägras rakt av — `10021` och `10024` liknar varandra som text men är olika kunder.
- **Kombinera filer** genom att lägga dem på varandra. Tolv månadsfiler, tre säljares kundlistor, fyra kommuners deltagarlistor: samma sorts data, men rubrikerna heter olika. Aliaskartan visar en rad per målkolumn och en spalt per fil, och gissar ihop `Namn`, `Name` och `kundnamn`. Kolumner som bara finns i vissa filer **beslutas en och en före körningen** — att ta med dem ger tomma celler, att hoppa över dem tappar värden, och båda kan vara rätt. En kolumn med källfilens namn följer med som förval, eftersom radnumret börjar om för varje fil.
  Formen kan också komma ur en **mallfil**: ett dokument med bara rubriker, eventuellt med några exempelrader. Då bestämmer mallen vilka kolumner resultatet har, vad de heter och i vilken ordning de kommer. Exempelraderna följer aldrig med, men visas som ledtråd i kartan — det är hela skälet att en mall får innehålla exempeldata. Kolumner som finns i filerna men inte i mallen kastas inte i tysthet; de frågas om, precis som alla andra.
- **Profiler** som sparar en hel arbetsgång och kör om den på nästa fil. Samma exportfil kommer varje månad, och samma tio handgrepp behöver göras om varje gång — en profil är listan över de handgreppen. Den sparas i din webbläsare och går att spara till fil om den ska följa med någon annanstans.
  Bara det som faktiskt går att upprepa kommer med: en handredigerad cell, en inklistring eller en borttagen rad pekar på rader i just den filen och står därför gråmarkerad med sitt skäl i stället för att tyst utelämnas. Kolumner matchas på namn, eftersom ett kolumn-id inte betyder något i en annan fil — och hittar ett steg inte sin kolumn säger det ifrån i stället för att välja en granne. Efter körningen står det steg för steg vad som hände och hur många celler som ändrades, och `Ctrl+Z` backar ett steg i taget.
- **Kommandopalett** med `Ctrl+K`. Verktyget har vuxit förbi vad en verktygsrad rymmer, och kolumnmenyn kräver att du först vet vilken kolumn åtgärden hör till — paletten är vägen för den som vet *vad* hen vill göra men inte var knappen sitter. Sökningen är bokstavlig och accentokänslig, och hittar även på engelska: `undo`, `join`, `makro`. Kolumnkommandona gäller den kolumn markören står i, och står med kolumnens namn i klartext, så att du ser vad du träffar innan du trycker Enter.
- **Ångra och gör om** på allt, med en steglista där du kan backa till vilket steg som helst.
- **Export** till Excel (`.xlsx`) eller CSV. Excel är förvalt, eftersom det är det enda formatet som både bevarar `01234` som `01234` och skriver talkolumner som riktiga tal så att `SUMMA` fungerar. CSV-exporten har val av avgränsare, teckenkodning, BOM och radslut, med en Excel-vänlig profil (semikolon, CRLF, UTF-8 med BOM) och ett riskbaserat formelskydd som inte rör negativa tal.
- Mörkt läge, tomt läge med exempelfil, och en varning innan sidan lämnas med osparat arbete.

En Excel-fil innehåller typade värden i stället för text, så importen måste skriva om dem. Det sägs rakt ut i dialogen: datum blir `ÅÅÅÅ-MM-DD` (läst i UTC, så dagen aldrig förskjuts) och tal får det decimaltecken du väljer, utan tusentalsavgränsare.


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

GitHub Actions kör typkontroll, enhetstester, bygge och röktest på varje pull request och på varje push till `main`, och publicerar till GitHub Pages från `main`. En utvecklingsgren får alltså sina kontroller så snart den har en öppen PR — vilket också är det som gör att varje commit bara körs en gång. Bygget använder relativ bas, så det fungerar oavsett om sajten ligger under ett repo-namn eller på ett eget domännamn. Att öppna `dist/index.html` direkt från disk fungerar däremot inte: koden laddas som ES-moduler, och från `file://` är sidans ursprung opakt, så webbläsaren blockerar både modulskriptet och bakgrundstråden som korsursprung.
