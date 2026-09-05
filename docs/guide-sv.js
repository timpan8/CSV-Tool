/**
 * Användarguidens innehåll, på svenska.
 *
 * Samma text som `docs/ANVANDARGUIDE.md`, men strukturerad: guiden vet
 * skillnaden på ett steg, en sak som är värt att veta, och ett före→efter.
 * Markdown kan bara skriva alla tre som stycken, och sidan kan därför ge dem
 * var sin form — numrerade steg, en egen lista under en tunn linje, två rutor
 * bredvid varandra — utan att någon behöver hålla formateringen i huvudet.
 *
 * Filen läses av `guide.html` som ett vanligt skript, inte som en modul: en
 * modul är korsursprung från `file://` och skulle göra sidan blank för den
 * som bara öppnar filen från disk.
 *
 * `tests/unit/guide.test.ts` vaktar att den här filen och den svenska/engelska
 * motsvarigheten har samma avsnitt, och att varje `img` finns i
 * `docs/bilder/sv/`. Lägger du till ett avsnitt här ska det också finnas i
 * markdown-guiden — det är samma guide, inte två.
 *
 * Fälten:
 *   lead    — brödtext, med **fet**, `kod` och *kursiv*
 *   steps   — "Så gör du", numrerade
 *   notes   — "Värt att veta", punkter
 *   legend  — numrerad förklaring som hör ihop med bildens siffror
 *   before  / after — två rutor med samma antal rader
 *   table   — { head, rows }
 *   kbd     — [tangent, vad den gör]
 *   warn    — röd ruta, för det som inte går att ångra
 *   img     — filnamn i docs/bilder/sv/, cap är dess bildtext
 *   imgWidth — maxbredd i pixlar för smala bilder; utan den blir en liten
 *             dialogruta uppblåst till hela spaltbredden och ser suddig ut
 */
window.GUIDE_SV = {
  lang: 'sv',
  title: 'Användarguide',
  tagline: 'CSV-verkstan, ett verktyg i taget. Varje avsnitt säger vad verktyget gör, hur du kör det och vad som är värt att veta — inget mer.',
  facts: [
    { k: 'Inget lämnar datorn', v: 'Filen öppnas i webbläsaren och stannar där. Sidan får inte ens göra ett nätverksanrop.' },
    { k: 'Inget ändras i tysthet', v: 'Varje verktyg visar siffror och exempel innan det körs, och Ctrl+Z tar tillbaka.' }
  ],
  ui: {
    search: 'Sök i guiden…',
    noHits: 'Inga träffar',
    contents: 'Innehåll',
    steps: 'Så gör du',
    notes: 'Värt att veta',
    top: 'Till toppen',
    close: 'Stäng',
    zoom: 'Klicka för att förstora',
    prev: 'Föregående',
    next: 'Nästa',
    inThisSection: 'I det här avsnittet'
  },
  groups: [
    {
      id: 'kom-igang', t: 'Kom igång', sub: 'Första filen, och vad du tittar på',
      sections: [
        {
          id: 'oppna-forsta', t: 'Öppna din första fil', img: 'tomt-lage.png',
          cap: 'Tomma läget: släpp en fil var som helst, eller öppna exempelfilen.',
          lead: 'Släpp en fil var som helst i fönstret, eller klicka **Välj fil…**. Vill du bara prova finns **Öppna exempelfil** — sexton rader stökig svensk data där varje verktyg har något att bita i.',
          notes: [
            'Öppnar CSV, TXT, TSV och Excel (`.xlsx`). Flera filer samtidigt blir flera flikar.',
            'Ingen fil laddas upp någonstans. Allt arbete sker i din webbläsare.'
          ]
        },
        {
          id: 'skarmen', t: 'Så ser skärmen ut', img: 'oversikt-app.png',
          cap: 'Hela fönstret med exempelfilen öppen.',
          lead: 'Sex områden, och de ligger alltid på samma ställe.',
          legend: [
            { t: 'App-raden', d: 'Filens ärenden: öppna, profiler, exportera. Längst till höger språkval, ljust/mörkt läge och kugghjulet.' },
            { t: 'Flikraden', d: 'En flik per öppen fil.' },
            { t: 'Redigeringsfältet', d: 'Ångra och gör om, sedan det som ändrar vyn (sortera, filter, dubbletter), sedan det som skapar data (städa, sammanfatta, pivot, flera filer).' },
            { t: 'Kolumnlistan', d: 'Till vänster: sök, dölj och dra om kolumner.' },
            { t: 'Tabellen och panelen', d: 'Tabellen i mitten, panelen till höger — inspektören, eller det verktyg du öppnat.' },
            { t: 'Statusraden', d: 'Nederst: antal rader, sortering, snabbsumma för markeringen.' }
          ]
        }
      ]
    },
    {
      id: 'oppna-exportera', t: 'Öppna och exportera', sub: 'In i verkstan och ut igen',
      sections: [
        {
          id: 'oppna-en-fil', t: 'Öppna en fil', img: 'import.png',
          cap: 'Importdialogen med gissad teckenkodning och avgränsare.',
          steps: [
            'Släpp filen i fönstret, eller **Öppna** i app-raden.',
            'Dialogen visar sin gissning av teckenkodning och avgränsare, med en förhandsvisning. Ändra om den gissat fel.',
            'Klicka **Öppna filen**.'
          ],
          notes: [
            'Har filen svenska tecken säger dialogen rakt ut om de ser rätt ut. Gör de inte det, prova en annan teckenkodning.',
            'Trasiga rader, dubbletta rubriker och Excels `sep=;`-rad rapporteras i stället för att försvinna tyst.',
            'En Excel-arbetsbok med flera blad låter dig välja blad. Datum blir `ÅÅÅÅ-MM-DD` och tal får det decimaltecken du väljer.'
          ]
        },
        {
          id: 'exportera', t: 'Exportera', img: 'export.png',
          cap: 'Exportdialogen med format och radval.',
          steps: [
            '**Exportera** i app-raden, eller `Ctrl+S`.',
            'Välj format: **Excel-fil (.xlsx)**, **CSV, Excel-vänlig**, **CSV, komma + UTF-8** eller **CSV, eget**.',
            'Välj om **alla rader** eller bara de som visas ska med, och om dolda kolumner ska följa med.',
            'Klicka **Exportera**.'
          ],
          notes: [
            'Excel är förvalt: det är det enda formatet som både behåller `01234` som `01234` och skriver talkolumner som riktiga tal, så att `SUMMA` fungerar.',
            'Väljer du **CSV, eget** får du styra avgränsare, teckenkodning, BOM och radslut var för sig.'
          ]
        },
        {
          id: 'klistra-in', t: 'Klistra in som en ny fil',
          lead: 'Har du kopierat en hel tabell någon annanstans ifrån öppnar `Ctrl+Skift+V` den som en egen flik i stället för att skriva in den i tabellen du står i.',
          notes: [
            '`Ctrl+C` kopierar markeringen som TSV, alltså det Excel förstår. `Ctrl+V` klistrar in TSV eller CSV.',
            'Är det inklistrade större än markeringen frågar verktyget om det ska lägga till plats, klippa av, eller öppna som en egen fil. Det klipper aldrig av i tysthet.'
          ]
        }
      ]
    },
    {
      id: 'tabellen', t: 'Tabellen', sub: 'Ordna, gallra och hitta',
      sections: [
        {
          id: 'sortera', t: 'Sortera', img: 'sortera.png',
          cap: 'Sorteringspanelen med två nivåer.',
          lead: 'Flernivåsortering med svensk ordning: `Öberg` efter `Zetterlund`, och `Kund 2` före `Kund 10`.',
          steps: [
            'Klicka på pilen i en kolumnrubrik. Skift-klicka i nästa rubrik för att lägga till en nivå.',
            'Eller öppna **Sortera** i redigeringsfältet och bygg listan där — nivåerna går att dra om.'
          ],
          notes: [
            'Talkolumner sorteras numeriskt och datumkolumner som datum, oavsett hur de är skrivna. Tomma celler hamnar alltid sist, åt båda hållen.',
            'Rättar du en cell efter att ha sorterat ligger raden kvar under markören. Statusraden erbjuder **Sortera om** när du är klar.'
          ]
        },
        {
          id: 'filter', t: 'Filter', img: 'filter.png',
          cap: 'Filterpanelen med en regel på Ort.',
          lead: 'Ett filter är en lista med regler. Varje regel går att stänga av utan att tas bort.',
          steps: [
            '**Filter** i redigeringsfältet → **＋ Lägg till regel**.',
            'Välj kolumn, operator och värde. Reglerna visas som chips ovanför tabellen.',
            'Välj om **alla regler måste stämma** eller om **någon räcker**.'
          ],
          notes: [
            'Operatorerna följer kolumnens typ: storleksjämförelser och `mellan` finns bara på tal och datum.',
            '**Visa i stället de rader filtret döljer** vänder urvalet — det enklaste sättet att upptäcka att du sorterat bort fel saker.',
            'När urvalet stämmer gör **behåll bara de som visas** eller **ta bort de som visas** det permanent. Båda går att ångra.',
            'En tom cell matchar bara `är tom`. Den är inte ”inte Malmö”, den är okänd.'
          ]
        },
        {
          id: 'dubbletter', t: 'Dubbletter', img: 'dubbletter.png',
          cap: 'Dubblettpanelen med Namn och E-post som nyckel.',
          lead: 'Hittar rader som är lika i de kolumner du väljer — nästan alltid det du vill, eftersom två poster om samma person brukar skilja sig på ett löpnummer eller ett datum.',
          steps: [
            '**Dubbletter** i redigeringsfältet.',
            'Kryssa i de kolumner som avgör vad som är samma rad.',
            'Panelen säger hur många grupper som hittades och hur många rader en rensning skulle ta bort — innan du kör.',
            'Välj vilken rad som ska stanna och **Ta bort**.'
          ],
          notes: [
            '**Strunta i** VERSALER, extra blanksteg och å ä ö vid jämförelsen om skrivsätten varierar.',
            'Borttagningen behåller den första eller den sista raden **i filens ordning**, inte i den du råkar titta på.',
            'Skiljer sig raderna i andra kolumner kan du välja **den jag väljer** och ringa in den rad som ska stanna, grupp för grupp.'
          ]
        },
        {
          id: 'sok', t: 'Sök', img: 'sok.png',
          cap: 'Sökraden med träffräknare.',
          lead: '`Ctrl+F` söker accentokänsligt: `oberg` hittar `Öberg`. Träffarna markeras och räknas.'
        },
        {
          id: 'angra', t: 'Ångra och gör om',
          lead: '`Ctrl+Z` ångrar, `Ctrl+Y` gör om — på allt. Kolumnpanelen har en steglista där du kan backa till vilket steg som helst.',
          notes: ['Ett verktyg som körts över flera kolumner backas som ett enda steg.']
        }
      ]
    },
    {
      id: 'stada', t: 'Städa och skriva om', sub: 'Nio verktyg som skriver om värden',
      intro: 'De åtta panelverktygen ligger i **kolumnmenyn** (klicka `⋮` i rubriken, eller högerklicka), i **cellmenyn** och i kommandopaletten. Menyn sätter de verktyg som passar kolumnens innehåll överst, med sitt skäl utskrivet; resten ligger under **Fler verktyg**.',
      introNotes: [
        'Alla panelerna fungerar likadant: de ligger **bredvid** tabellen, ritar förslaget i dina egna celler medan du ställer in, och ändrar ingenting förrän du klickar **Tillämpa**.',
        '`Bara ändrade` och `Bara problem` filtrerar fram just de raderna. `Ctrl+Z` tar tillbaka.',
        'Datum, tal, telefon och sök & ersätt kör över **hela markeringen**: markera tolv månadskolumner, högerklicka och kör en gång.'
      ],
      sections: [
        {
          id: 'snabbstadning', t: 'Snabbstädning av text', img: 'stada-meny.png', imgWidth: 520,
          cap: 'Städmenyn med de sex textåtgärderna.',
          lead: 'Sex åtgärder utan panel, direkt på markeringen. **Städa ▾** i redigeringsfältet.',
          table: {
            head: ['Åtgärd', 'Gör'],
            rows: [
              ['Trimma blanksteg', 'Tar bort blanksteg först och sist'],
              ['Slå ihop dubbla mellanslag', 'Flera mellanslag blir ett'],
              ['Ta bort osynliga tecken', 'Nollbreddstecken, hårda mellanslag, uppdelade bokstäver'],
              ['VERSALER · gemener · Stor Första Bokstav', 'Ändrar skiftläge — Anna-Lena och O’Brien klarar sig']
            ]
          },
          notes: ['I samma meny ligger **Ta bort helt tomma rader** och **Ta bort helt tomma kolumner**.']
        },
        {
          id: 'datum', t: 'Datum', img: 'datum.png',
          cap: 'Datumverktyget listar de format kolumnen faktiskt innehåller, med antal och exempel ur din fil.',
          lead: 'Skriver om blandade datumformat till ett enda.',
          steps: [
            'Kolumnmenyn → **Datum…**',
            'Panelen listar de format kolumnen faktiskt innehåller, med antal och exempel ur din fil.',
            'Välj **Skriv om till**, t.ex. `ÅÅÅÅ-MM-DD`. Tabellen visar `före → efter` direkt.',
            'Klicka **Tillämpa**.'
          ],
          before: { label: 'Blandat i filen', items: ['2026-08-27', '27/8 2026', '27 aug 2026', '45231'] },
          after: { label: 'Efter Tillämpa', items: ['2026-08-27', '2026-08-27', '2026-08-27', '2026-08-27'] },
          notes: [
            '`03/04/2026` kan vara 3 april eller 4 mars. Verktyget letar först efter bevis i kolumnen och frågar bara när inget finns.',
            'Exceldatum som ligger kvar som serienummer (`45231`) tolkas bara om du kryssar i det.',
            'Kryssa i **Lägg resultatet i en ny kolumn** om du vill behålla både `2026-08-27 12:55` och `2026-08-27`.',
            'Rader som inte går att tolka kan lämnas som de är, skrivas `OGILTIGT` eller tömmas — du väljer.'
          ]
        },
        {
          id: 'tal', t: 'Tal', img: 'tal.png',
          cap: 'Talverktyget skalar av kr, procent och tusentalsavgränsare.',
          lead: 'Gör text som ser ut som tal till riktiga tal.',
          steps: [
            'Kolumnmenyn → **Tal…**',
            'Välj **decimalkomma** eller **decimalpunkt**, och hur många decimaler.',
            'Klicka **Tillämpa**.'
          ],
          before: { label: 'Text i filen', items: ['1 240,50 kr', '(1 240,50)', '1240–', '12 %'] },
          after: { label: 'Riktiga tal', items: ['1240,50', '−1240,50', '−1240,00', '12,00'] },
          notes: [
            'Skalar av `kr`, `%` och tusentalsavgränsare, och läser bokföringens `(1 240,50)` och `1240–` som negativa tal.',
            'Punktens tvetydighet hanteras som datumens: är `1.234` ett decimaltal eller ett tusental? Bevis först, fråga sedan.',
            'Kolumnen blir typad som tal, så sorteringen går den numeriska vägen och Excel-exporten skriver riktiga tal.'
          ]
        },
        {
          id: 'telefon', t: 'Telefon', img: 'telefon.png',
          cap: 'Telefonverktyget normaliserar nummer så att de går att jämföra mellan filer.',
          lead: 'Normaliserar telefonnummer så att de går att jämföra mellan filer.',
          steps: [
            'Kolumnmenyn → **Telefon…**',
            'Välj vilket land nummer utan landskod tillhör.',
            'Välj `+46701234567` eller `0701234567`, och **Tillämpa**.'
          ],
          before: { label: 'Som det står', items: ['070-123 45 67', '0046 70 1234567', '+46 (0)70 123 45 67'] },
          after: { label: 'Normaliserat', items: ['+46701234567', '+46701234567', '+46701234567'] },
          notes: ['Ingen snygg gruppering med mellanslag — riktnumrets längd varierar, och en gissning som blir fel ser rimlig ut.']
        },
        {
          id: 'epost', t: 'E-post till namn', img: 'epost.png',
          cap: 'E-postverktyget plockar ut namn- och domändelar som nya kolumner.',
          lead: 'Plockar ut namn- och domändelar ur en adress, som **nya** kolumner bredvid.',
          steps: [
            'Kolumnmenyn → **E-post → namn…**',
            'Välj vad du vill ha under **Hämta**: förnamn, efternamn, båda som var sin kolumn, `Förnamn Efternamn`, domän, domän utan toppdomän eller toppdomän.',
            'Klicka **Skapa kolumnen**.'
          ],
          notes: [
            'Funktionsadresser som `info@` blir inte personer.',
            'Å, ä och ö går inte att få tillbaka ur en adress. Panelen säger det rakt ut.'
          ]
        },
        {
          id: 'dela', t: 'Dela en kolumn', img: 'dela.png',
          cap: 'De nya kolumnerna ritas som spökkolumner med streckad ram innan de skapas.',
          lead: 'Delar en kolumn i flera nya.',
          steps: [
            'Kolumnmenyn → **Dela kolumnen…**',
            'Välj var delningen sker: **vid varje**, **vid första**, **vid sista** förekomsten av ett tecken, eller **efter antal tecken**.',
            'Välj tecken och antal nya kolumner, och klicka **Skapa 2 kolumner**.'
          ],
          notes: [
            '**Vid sista** mellanslaget håller ihop dubbelnamn: `Anna Karlsson` och `Carl-Johan Nilsson` delas lika.',
            'Det som inte får plats hamnar i sista kolumnen i stället för att försvinna. Panelen varnar när det händer.'
          ]
        },
        {
          id: 'slaihop-kolumner', t: 'Slå ihop kolumner', img: 'slaihop-kolumner.png',
          cap: 'Mallverktyget bygger en ny kolumn ur en mall.',
          lead: 'Bygger en ny kolumn ur en mall.',
          steps: [
            'Kolumnmenyn → **Slå ihop kolumner…**',
            'Skriv mallen, t.ex. `{Förnamn} {Efternamn}` eller `{Namn}, {Ort}`. **Lägg till kolumn** sätter in ett namn åt dig.',
            'Klicka **Skapa kolumnen**.'
          ],
          notes: [
            'Kolumnnamn som inte finns rapporteras som ett fel i stället för att tyst bli tomma.',
            '**Städa bort luckor efter tomma värden** tar bort de dubbla mellanslag som annars uppstår när ett fält är tomt.'
          ]
        },
        {
          id: 'rakna', t: 'Räkna', img: 'rakna.png',
          cap: 'Räkneverktyget med en formel. Felet visas medan du skriver.',
          lead: 'En ny kolumn ur en formel.',
          steps: [
            'Kolumnmenyn → **Räkna…**',
            'Skriv formeln, t.ex. `{Antal} * {Pris}`, `RUNDA({Belopp} * 1,25; 2)` eller `{Slut} - {Start}`.',
            'Välj decimaler och decimaltecken, och klicka **Skapa kolumnen**.'
          ],
          notes: [
            'Fyra räknesätt, parenteser och funktionerna `RUNDA`, `ABS`, `MIN`, `MAX`. Felet i formeln visas medan du skriver.',
            'Tal skrivs som i filen: `1 240,50` fungerar lika bra som `1240.5`.',
            'En datumkolumn räknas som antal dagar, så `{Slut} - {Start}` ger skillnaden i dagar.',
            'Tomma celler, text som inte är tal och division med noll ger **tomt, inte noll**. En lucka går att se; en felaktig nolla gör det inte.'
          ]
        },
        {
          id: 'ersatt', t: 'Sök och ersätt', img: 'ersatt.png',
          cap: 'Sök och ersätt med bokstavlig sökning.',
          steps: [
            'Kolumnmenyn → **Sök och ersätt…**',
            'Skriv vad som ska sökas och vad det ska bli.',
            'Klicka **Tillämpa**.'
          ],
          notes: [
            'Bokstavlig sökning är bokstavlig: `1.5` matchar inte `125`.',
            'Kryssa i **Reguljärt uttryck** för mönster. Felet visas medan du skriver.',
            '**Hela cellen** ersätter bara när hela värdet stämmer, inte en del av det.'
          ]
        }
      ]
    },
    {
      id: 'sammanfatta', t: 'Sammanfatta och analysera', sub: 'Svar ur datat, utan att röra det',
      sections: [
        {
          id: 'gruppera', t: 'Gruppera och summera', img: 'gruppera.png',
          cap: 'Grupperingsdialogen med summa per ort. Rutan ”Så här blir det” visar resultatet medan du ställer in.',
          lead: '*Summa Belopp per Ort*, *antal ordrar per kund*, *första och sista datum per projekt* — en rad per grupp.',
          steps: [
            '**Sammanfatta…** i redigeringsfältet.',
            'Välj kolumnerna att **gruppera på**.',
            'Lägg till beräkningarna: antal rader, summa, snitt, minsta, största, antal ifyllda, antal unika, första, sista eller värdena uppradade.',
            'Rutan **Så här blir det** visar resultatet medan du ställer in. Klicka **Skapa fliken**.'
          ],
          notes: [
            'Resultatet blir en **ny flik**. Originalet rörs inte.',
            'Grupperingen går på **det du ser**: har du filtrerat till 2024 är summan 2024 års summa.',
            'En summa utan läsbara tal blir **tom, inte noll**.',
            'Rader som saknar värde i grupperingskolumnerna räknas inte in i någon grupp — de rapporteras, och kan tas med som en egen grupp om du vill.'
          ]
        },
        {
          id: 'pivot', t: 'Pivot', img: 'pivot.png',
          cap: 'Pivotvyn som korstabell: antal ordrar per Ort och Status.',
          lead: '*Antal ordrar per Ort och Status* i en korstabell. En **egen vy** som aldrig rör datat.',
          steps: [
            '**Pivot** i redigeringsfältet. Vyn öppnas med en tabell som redan säger något.',
            'Välj dimension för **rader** och för **kolumner**. **⇄** byter håll.',
            'Välj **mätvärden** — antal, summa, snitt, minsta, största, ifyllda, unika. Flera går att ha sida vid sida.',
            '**Gör till ny flik** om du vill sortera, filtrera eller exportera svaret.'
          ],
          notes: [
            '**Nivålista** är samma beräkning ordnad åt ett håll i stället, med delsummor på varje nivå som går att fälla ihop.',
            '**Visa** växlar mellan tal, *% av rad* och *% av kolumn*. Andelen erbjuds bara för mätvärden som går att lägga ihop — ett snitt är ingen del av ett annat snitt.',
            'Klick på en kolumnrubrik sorterar raderna efter just den kolumnen.',
            'Pivoten räknar på **hela filen** som förval; kryssa i **bara de som visas nu** för att följa filtret.'
          ]
        },
        {
          id: 'kolumnoversikt', t: 'Kolumnöversikt', img: 'kolumnoversikt.png',
          cap: 'En rad per kolumn med typ, ifyllnad, unika värden och problem.',
          lead: 'Svarar på frågan man ställer innan man börjar: *vad är det här för fil?*',
          steps: [
            '**Översikt** ovanför kolumnlistan.',
            'En rad per kolumn med typ, ifyllnad, unika värden och problem.',
            'Klicka ett förslag i högerkanten — då öppnas rätt verktyg på rätt kolumn.'
          ]
        },
        {
          id: 'inspektor', t: 'Kolumninspektören', img: 'inspektor.png', imgWidth: 520,
          cap: 'Inspektören visar den kolumn markören står i.',
          lead: 'Panelen till höger när inget verktyg är öppet. Visar antal ifyllda, tomma, unika och otolkbara värden, plus de vanligaste värdena.',
          notes: [
            '**Visa de N raderna** filtrerar fram just de problematiska raderna.',
            'Härifrån går det också att byta typ, byta namn, duplicera och ta bort kolumnen.'
          ]
        }
      ]
    },
    {
      id: 'flera-filer', t: 'Flera filer', sub: 'Sätt ihop data ur flera källor',
      intro: 'De tre sätten att sätta ihop data ur flera filer ligger under **Flera filer ▾** i redigeringsfältet. Öppna filerna som var sin flik först.',
      sections: [
        {
          id: 'slaihop', t: 'Slå ihop två filer', img: 'slaihop.png',
          cap: 'Sammanslagningsvyn visar fyra saker samtidigt: de två källfilerna med normaliserad nyckel, hur raderna paras ihop, och hur resultatet blir.',
          lead: 'Lägger rader som hör ihop sida vid sida, matchat på en nyckel — som `LETARAD`, fast med facit synligt.',
          steps: [
            '**Flera filer ▾ → Slå ihop…**',
            'Verktyget har redan provat alla kolumnpar mot varandra och föreslagit det som ger flest träffar. Ändra fritt, eller **＋ Lägg till kolumnpar**.',
            'Läs siffrorna överst: hur många rader som hittar en träff, hur många som blir över, hur många som matchar flera.',
            'Kryssa i **kolumner att hämta**, och klicka **Slå ihop**.'
          ],
          notes: [
            'Vyn visar fyra saker samtidigt medan du ställer in: de två källfilerna med den normaliserade nyckeln under varje värde, hur raderna paras ihop, och hur resultatet blir. Förhandsvisningens rader blandar träffar och missar i den proportion de faktiskt har.',
            'Resultatet blir en **ny flik** med en **Träff**-kolumn: `träff`, `ingen träff` eller `flera träffar`. Den gör de omatchade raderna filtrerbara efteråt.',
            '**Vilka rader som kommer med** avgör om bara stommens rader följer med eller alla rader ur båda filerna.',
            'Jämförelsen kan vara vanlig, teckenexakt, utan å ä ö, bara siffror, e-post mot namn, eller namn mot förnamn + efternamn. **Tomma nycklar matchar aldrig.**',
            '`⇄ Byt håll` byter vilken fil som är stomme.'
          ]
        },
        {
          id: 'verkstad', t: 'Matchningsverkstaden', img: 'verkstad.png',
          cap: 'Verkstaden: två restlistor och en arbetsbänk som jämför raderna fält för fält.',
          lead: 'För raderna som blev över. En sammanslagning slutar aldrig på hundra procent.',
          steps: [
            '**Beta av resten…** i sammanslagningsvyn — eller **Fortsätt** på chipet i statusraden när du kommer tillbaka senare.',
            'De omatchade raderna ligger som två listor. Klicka en rad i varje och jämför dem fält för fält på arbetsbänken.',
            'Fyra vägar ut: **Para ihop** för hand, rätta ett värde på plats så att raden hittar sin partner själv, **nytt försök på en annan kolumn**, eller **skriv av** raden.',
            'Klicka **Slå ihop** när du är nöjd. Varje omgång lägger sitt resultat i en **egen** flik.'
          ],
          notes: [
            '**Luddig likhet** finns bara här, aldrig över hela filen. Poängen visas som två tal — stavning och ordning — så att den säger *varför*.',
            'Restlistan skiljer på en rad utan partner, en rad vars nyckel är tom, och en rad som matchar flera och behöver ett val.',
            'Arbetet överlever att du stänger vyn och att du laddar om sidan. **Exportera restlistorna** ger en CSV per fil att skicka vidare.'
          ]
        },
        {
          id: 'kombinera', t: 'Kombinera filer', img: 'kombinera.png',
          cap: 'Aliaskartan: en rad per målkolumn, en spalt per fil, med ett exempelvärde under varje väljare.',
          lead: 'Lägger filer **på varandra**. Tolv månadsfiler, tre säljares kundlistor — samma sorts data, men rubrikerna heter olika.',
          steps: [
            '**Flera filer ▾ → Kombinera…**',
            'Aliaskartan visar en rad per målkolumn och en spalt per fil, och har redan gissat ihop `Namn`, `Name` och `kundnamn`.',
            'Kolumner som bara finns i vissa filer måste **beslutas** — **Ta med** eller **Hoppa över**, en och en eller allihop på en gång.',
            'Klicka **Kombinera**.'
          ],
          notes: [
            'Under varje källväljare står ett av kolumnens värden, eftersom rubriker ljuger: `Kontakt` kan vara ett namn i den ena filen och en adress i den andra.',
            'Gissar verktyget fel finns **Samma spalt som…** på raden.',
            'Ett **standardvärde** fyller de filer som inte ger något — `Okänd` där kolumnen saknas. Bara där: en cell som finns men är tom rörs aldrig.',
            'En kolumn med källfilens namn följer med som förval, eftersom radnumret börjar om för varje fil.'
          ]
        },
        {
          id: 'mall', t: 'Fyll en mall med data',
          lead: 'Samma vy som **Kombinera**, men formen kommer ur en **mallfil**: ett dokument med bara rubriker.',
          steps: [
            '**Flera filer ▾ → Fyll en mall med data…**',
            'Öppna mallfilen, eller använd **Exempelmall**.',
            'Peka ut var varje målkolumn ska hämta sitt värde, och kör.'
          ],
          notes: [
            'Mallen bestämmer vilka kolumner resultatet har, vad de heter och i vilken ordning de kommer.',
            'Exempelrader i mallen följer aldrig med, men visas som ledtråd i kartan.',
            'Kolumner som finns i filerna men inte i mallen kastas inte i tysthet — de frågas om.'
          ]
        }
      ]
    },
    {
      id: 'spara', t: 'Spara arbetet', sub: 'Profiler, flikar och att börja om',
      sections: [
        {
          id: 'profiler', t: 'Profiler', img: 'profiler.png',
          cap: 'Profildialogen visar stegen du gjort i den här filen.',
          lead: 'Samma exportfil kommer varje månad, och samma tio handgrepp behöver göras om. En profil är listan över de handgreppen.',
          steps: [
            '**Profiler…** i app-raden.',
            'Dialogen visar vad du gjort i den här filen. **Spara som profil** med ett namn.',
            'Öppna nästa månads fil och tryck **Kör** på profilen.'
          ],
          notes: [
            'Kolumner matchas på **namn**, eftersom ett kolumn-id inte betyder något i en annan fil. Hittar ett steg inte sin kolumn säger det ifrån.',
            'Bara det som går att upprepa kommer med. En handredigerad cell eller en borttagen rad pekar på just den filens rader och står gråmarkerad med sitt skäl.',
            'Efter körningen står det steg för steg vad som hände. `Ctrl+Z` backar ett steg i taget.',
            '**Spara till fil** om profilen ska följa med någon annanstans.'
          ]
        },
        {
          id: 'flikarna', t: 'Flikarna finns kvar',
          lead: 'Filerna du har öppna sparas i din egen webbläsare — med sortering, filter, dubblettvy och markering — och kommer tillbaka nästa gång du öppnar sidan. En stängd flik glöms direkt.',
          notes: [
            '**Ångra-historiken följer inte med.** Verktyget säger till om det när flikarna kommer tillbaka.',
            '**Glöm sparade filer** i kommandopaletten tömmer det sparade men låter flikarna stå kvar.'
          ]
        },
        {
          id: 'borja-om', t: 'Börja om', img: 'borja-om.png', imgWidth: 520,
          cap: 'Dialogen räknar upp vad som finns sparat innan något rensas.',
          lead: 'När du är klar: klicka **● Allt lokalt** i statusraden.',
          steps: [
            'Dialogen räknar upp vad som finns — öppna filer med radantal, en påbörjad sammanslagning, och hur många byte webbläsaren sparat.',
            'Filer med ändringar som inte exporterats listas särskilt.',
            'Klicka **Rensa allt.** Sidan laddas om.'
          ],
          warn: 'Det här är en av få åtgärder som **inte** går att ångra.'
        }
      ]
    },
    {
      id: 'genvagar', t: 'Genvägar och inställningar', sub: 'Paletten, tangentbordet och utseendet',
      sections: [
        {
          id: 'palett', t: 'Kommandopaletten', img: 'palett.png', imgWidth: 520,
          cap: 'Ctrl+K öppnar paletten.',
          lead: '`Ctrl+K` öppnar paletten. Den är vägen för den som vet *vad* hen vill göra men inte var knappen sitter.',
          notes: [
            'Sökningen är bokstavlig och accentokänslig, och hittar även på engelska: `undo`, `join`, `makro`.',
            'Kolumnkommandona gäller den kolumn markören står i och står med kolumnens namn utskrivet.'
          ]
        },
        {
          id: 'tangentbord', t: 'Tangentbord',
          kbd: [
            ['Ctrl+K', 'Kommandopaletten'],
            ['Ctrl+F', 'Sök'],
            ['Ctrl+S', 'Exportera'],
            ['Ctrl+Z · Ctrl+Y', 'Ångra · Gör om'],
            ['Enter · F2 · dubbelklick', 'Redigera cellen'],
            ['Skift + piltangenter', 'Utöka markeringen'],
            ['Ctrl+D', 'Fyll nedåt'],
            ['Delete', 'Töm markeringen'],
            ['Ctrl+C · Ctrl+V', 'Kopiera · Klistra in (TSV, som Excel)'],
            ['Ctrl+Skift+V', 'Klistra in som en ny fil'],
            ['F2 i rubriken', 'Byt namn på kolumnen'],
            ['Menytangenten', 'Öppnar menyn vid markeringen']
          ]
        },
        {
          id: 'installningar', t: 'Språk, tema och verktygsfält', img: 'installningar.png', imgWidth: 360,
          cap: 'Inställningsmenyn längst till höger i app-raden.',
          lead: 'Längst till höger i app-raden: språkvalet `SV | EN`, ljust/mörkt läge och kugghjulet.',
          notes: [
            '**Språk** byter bara etiketterna. Sorteringen är fortfarande svensk, tal skrivs fortfarande `1 240,50` och datumverktyget läser fortfarande `augusti` — annars hade samma fil sorterad på två språk gett två ordningar.',
            '**Tema** kan följa systemet, eller låsas till ljust eller mörkt.',
            '**Verktygsfältet** kan ligga som en rad under flikarna eller lodrätt till vänster om kolumnerna. Valet sparas.'
          ]
        }
      ]
    }
  ]
};
