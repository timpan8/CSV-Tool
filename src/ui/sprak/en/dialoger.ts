/**
 * Dialogerna, pivoten och sidopanelerna: import, export, gruppera, pivoten,
 * profiler, kolumnöversikten, inspektören och kolumnpanelen.
 *
 * Nyckeln är den svenska texten — se `sprak.ts`. En mening som saknas här
 * står kvar på svenska i gränssnittet.
 */
export const DIALOGER: Record<string, string> = {

  /* ---------- Kolumnpanelen till höger ---------- */
  /* `Kolumn`, `Rader`, `Byt namn…`, `Duplicera kolumnen` och `Ta bort kolumnen`
     står i skalets modul — menyn och panelen delar samma ord. */
  'Klicka på en kolumnrubrik för att se antal, tomma värden och de vanligaste värdena.':
    'Click a column heading to see counts, empty values and the most common values.',
  Typ: 'Type',
  'Typen styr sortering, filter och vilka verktyg som erbjuds. Den skriver aldrig om ett värde.':
    'The type decides sorting, filtering and which tools are offered. It never rewrites a value.',
  Ifyllda: 'Filled in',
  Tomma: 'Empty',
  Unika: 'Unique',
  'Visa de {0} raderna': 'Show those {0} rows',
  'Vanligaste värden': 'Most common values',
  'Filtrera fram {0}': 'Filter down to {0}',
  'Städa kolumnen': 'Clean up the column',
  Åtgärder: 'Actions',


  /* ---------- Sökraden, paletten och filterbanderollen ---------- */
  'Sök i tabellen…': 'Search the table…',
  'Sök i tabellen': 'Search the table',
  'Inga träffar': 'No matches',
  kolumn: 'column',
  Kommandon: 'Commands',
  'Vad vill du göra?': 'What do you want to do?',
  'Inget kommando matchar ”{0}”.': 'No command matches “{0}”.',
  'Dolda:': 'Hidden:',
  'Alla:': 'All:',
  'Någon:': 'Any:',
  'Filtret är vänt: du ser raderna det annars döljer.':
    'The filter is inverted: you are seeing the rows it otherwise hides.',
  vänt: 'inverted',
  'Avslagen. Klicka för att slå på.': 'Switched off. Click to switch on.',
  'Klicka för att slå av regeln.': 'Click to switch the rule off.',
  'Kolumnen finns inte längre.': 'The column no longer exists.',
  'Ta bort regeln {0}': 'Remove the rule {0}',
  'Ändra…': 'Change…',
  'Rensa filtret': 'Clear the filter',
  /* Mallarna ur `beskrivRegelDelar`. Operatorernas ord står i verktygsmodulen.
     De mallar som bara är platshållare i rad — `{0} {1} {2}` — står inte här:
     de ser likadana ut på båda språken och faller tillbaka på sig själva. */
  '{0} är {1}': '{0} is {1}',
  '{0} är något av {1}': '{0} is one of {1}',
  '{0} {1} {2} tecken': '{0} {1} {2} characters',


  /* ---------- Kolumnpanelen, Klistra in och Börja om ---------- */
  Kolumner: 'Columns',
  '{0} dolda': '{0} hidden',
  'Kolumnöversikt: ifyllnad, unika värden, problem och förslag för alla kolumner':
    'Column overview: fill rate, unique values, problems and suggestions for every column',
  Översikt: 'Overview',
  'Sök kolumn…': 'Find column…',
  Steg: 'Steps',
  'Ångra till och med det här steget': 'Undo up to and including this step',
  'Ångrat — gör om med Ctrl+Y': 'Undone — redo with Ctrl+Y',
  'Öppna som ny fil': 'Open as a new file',
  'Klipp av': 'Cut off',
  'Lägg till plats': 'Make room',
  'kolumnnamn på första raden': 'column names on the first row',
  'Det du klistrar in har {0} och ser därför ut som ett eget dokument — {1} och {2}, mot en markering på {3} × {4}.':
    'What you are pasting has {0} and therefore looks like a document of its own — {1} and {2}, against a selection of {3} × {4}.',
  '{0} och {1}': '{0} and {1}',
  'Det du klistrar in är {0}, men markeringen är {1} × {2}.':
    'What you are pasting is {0}, but the selection is {1} × {2}.',
  '{0} lämnar den här tabellen orörd och lägger det inklistrade i en egen flik. {1} utökar tabellen med {2} så att allt får plats. {3} skriver bara in det som ryms i tabellen som den ser ut nu — resten kastas.':
    '{0} leaves this table untouched and puts what you pasted in a tab of its own. {1} grows the table by {2} so that everything fits. {3} writes in only what fits the table as it looks now — the rest is thrown away.',
  'Första raderna av det du klistrar in': 'The first rows of what you are pasting',


  /* ---------- Gruppera och summera ---------- */
  'Gruppera och summera': 'Group and summarise',
  'Välj minst en sak att räkna ut.': 'Choose at least one thing to work out.',
  'Det finns inga grupper att sammanfatta.': 'There are no groups to summarise.',
  '{0} grupper ur {1}': '{0} groups out of {1}',
  'Skapa fliken': 'Create the tab',
  'Gruppera på': 'Group by',
  'Ingen kolumn vald — hela filen blir en enda sammanfattningsrad.':
    'No column chosen — the whole file becomes a single summary row.',
  'En rad per {0}. Klicka igen för att välja bort.':
    'One row per {0}. Click again to deselect.',
  'Räkna ut': 'Work out',
  Beräkning: 'Calculation',
  'Antal rader': 'Number of rows',
  'Hur många rader gruppen har. Räknar även tomma.':
    'How many rows the group has. Empty ones count too.',
  Summa: 'Total',
  'Lägger ihop värdena. Det som inte går att läsa som tal räknas inte med.':
    'Adds the values up. Anything that cannot be read as a number is left out.',
  Snitt: 'Average',
  'Summan delad med antalet värden som gick att läsa som tal.':
    'The total divided by the number of values that could be read as numbers.',
  Minsta: 'Smallest',
  'Det första värdet i kolumnens egen ordning — minsta talet, tidigaste datumet, första ordet.':
    'The first value in the column’s own order — the smallest number, the earliest date, the first word.',
  Största: 'Largest',
  'Det sista värdet i kolumnens egen ordning — största talet, senaste datumet, sista ordet.':
    'The last value in the column’s own order — the largest number, the latest date, the last word.',
  'Antal ifyllda': 'Number filled in',
  'Hur många av gruppens rader som har ett värde i kolumnen.':
    'How many of the group’s rows have a value in the column.',
  'Antal unika': 'Number unique',
  'Hur många olika värden gruppen har i kolumnen.':
    'How many different values the group has in the column.',
  'Första värdet': 'First value',
  'Det första ifyllda värdet, i den ordning raderna visas.':
    'The first filled-in value, in the order the rows are shown.',
  'Sista värdet': 'Last value',
  'Det sista ifyllda värdet, i den ordning raderna visas.':
    'The last filled-in value, in the order the rows are shown.',
  'Lista värdena': 'List the values',
  'Gruppens olika värden på en rad, åtskilda med komma.':
    'The group’s different values on one line, separated by commas.',
  'Kolumn att räkna på': 'Column to work on',
  'alla rader': 'all rows',
  'Rubrik i resultatet': 'Heading in the result',
  'Ta bort beräkningen': 'Remove the calculation',
  '{0} av {1} går att läsa som tal': '{0} of {1} can be read as numbers',
  '+ Lägg till beräkning': '+ Add calculation',
  'Utan någon beräkning blir resultatet bara en lista över de olika värdena. Lägg till minst en sak att räkna ut.':
    'Without a calculation the result is just a list of the different values. Add at least one thing to work out.',
  'En av summorna hittar inga tal alls i sin kolumn. Kör {0} på den först, eller välj en annan kolumn — en summa av ingenting är tom, inte noll.':
    'One of the totals finds no numbers at all in its column. Run {0} on it first, or choose another column — a total of nothing is empty, not zero.',
  'Samma jämförelse som dubblettvyn gör, så {0} och {1} är eniga om vad som är samma värde.':
    'The same comparison the duplicates view makes, so {0} and {1} agree on what counts as the same value.',
  'hitta dubbletter i {0}': 'find duplicates in {0}',
  'summera per {0}': 'total per {0}',
  'Ta med raderna som saknar värde i grupperingskolumnerna':
    'Include the rows with no value in the grouping columns',
  'Tal skrivs som': 'Numbers are written as',
  'Som det blir': 'As it comes out',
  'Namn på den nya fliken': 'Name of the new tab',
  grupperingskolumnerna: 'the grouping columns',
  '{0} saknar värde i {1} och är inte med i något av talen. Kryssa i rutan ovan för att ta med dem som en egen grupp.':
    '{0} have no value in {1} and are not part of any of the figures. Tick the box above to include them as a group of their own.',
  'Så här blir det': 'How it turns out',
  '({0} av {1} rader)': '({0} of {1} rows)',
  grupp: 'group',
  grupper: 'groups',
  '{0} {1} ur {2}. Största gruppen har {3}.':
    '{0} {1} out of {2}. The largest group has {3}.',
  'Resultatet blir en ny flik. Originalet rörs inte, och den nya fliken går att sortera, filtrera och exportera som vilken fil som helst. Steget kommer inte med i en profil — en profil kör om steg på samma fil, och det här skapar en annan.':
    'The result becomes a new tab. The original is untouched, and the new tab can be sorted, filtered and exported like any other file. The step is not carried into a profile — a profile re-runs steps on the same file, and this one creates a different one.',


  /* ---------- Exportera ---------- */
  /* `Format` stavas likadant på båda språken. Posten står kvar ändå, eftersom
     `t('Format')` finns i koden och vakten kräver en motsvarighet till varje
     mening som skickas genom den. Undantaget står uppräknat i testet. */
  Format: 'Format',
  'Ladda ner': 'Download',
  'Excel-fil (.xlsx)': 'Excel file (.xlsx)',
  'Det enda formatet som både bevarar ledande nollor och låter SUMMA fungera på talkolumner.':
    'The only format that both keeps leading zeros and lets SUM work on number columns.',
  'CSV, Excel-vänlig': 'CSV, Excel-friendly',
  'Semikolon, CRLF och UTF-8 med BOM. Öppnas rätt med dubbelklick i svenskt Excel.':
    'Semicolon, CRLF and UTF-8 with a BOM. Opens correctly on a double-click in Swedish Excel.',
  'CSV, komma + UTF-8': 'CSV, comma + UTF-8',
  'Internationell standard. Det de flesta system förväntar sig vid import.':
    'The international standard. What most systems expect on import.',
  'CSV, eget': 'CSV, custom',
  'Ställ in varje val själv.': 'Set every option yourself.',
  Avgränsare: 'Separator',
  Tabb: 'Tab',
  Teckenkodning: 'Character encoding',
  Radslut: 'Line ending',
  'Skriv BOM (behövs för att Excel ska visa å ä ö rätt)':
    'Write a BOM (needed for Excel to show å ä ö correctly)',
  'Ta med rubrikrad': 'Include the heading row',
  'Skydda mot formler i Excel': 'Protect against formulas in Excel',
  'Vilka rader': 'Which rows',
  'Som visas nu ({0})': 'As shown now ({0})',
  'Alla ({0})': 'All ({0})',
  'Vilka kolumner': 'Which columns',
  'Bara synliga': 'Visible only',
  'Alla, även dolda': 'All, hidden ones too',
  Filnamn: 'File name',
  'Du har ett aktivt filter men exporterar alla {0} rader. Är det avsiktligt?':
    'You have an active filter but are exporting all {0} rows. Is that deliberate?',
  'Talkolumner skrivs som riktiga tal, så {0} fungerar direkt i Excel. Allt annat skrivs som text, vilket är det enda sättet att få {1} att förbli {2} — en CSV kan Excel alltid tolka om på egen hand.':
    'Number columns are written as real numbers, so {0} works straight away in Excel. Everything else is written as text, which is the only way to make {1} stay {2} — a CSV is always something Excel can reinterpret on its own.',
  'Windows-1252 kan inte lagra {0} — de ersätts med frågetecken. Välj UTF-8 om tecknen ska bevaras.':
    'Windows-1252 cannot store {0} — they are replaced with question marks. Choose UTF-8 to keep the characters.',
  'Så här kommer första raden se ut': 'How the first row will look',
  '(inga rader att exportera)': '(no rows to export)',


  /* ---------- Öppna fil ---------- */
  'Öppna {0}': 'Open {0}',
  'Öppna filen': 'Open the file',
  Blad: 'Sheet',
  'Decimaltecken för tal': 'Decimal mark for numbers',
  'Semikolon  ;': 'Semicolon  ;',
  'Komma  ,': 'Comma  ,',
  'Lodstreck  |': 'Pipe  |',
  'Modern standard. Det de flesta system exporterar idag.':
    'The modern standard. What most systems export today.',
  'Det svenskt Excel skriver om man inte väljer något annat. Kallas även ISO-8859-1.':
    'What Swedish Excel writes unless you choose otherwise. Also known as ISO-8859-1.',
  'Excels "Spara som Unicode-text".': 'Excel’s “Save as Unicode Text”.',
  'Komma  1240,5': 'Comma  1240,5',
  'Det svenskt Excel förväntar sig när filen läses tillbaka.':
    'What Swedish Excel expects when the file is read back.',
  'Punkt  1240.5': 'Dot  1240.5',
  'Internationell form.': 'The international form.',
  'Första raden är rubriker': 'The first row is headings',
  'Trimma blanksteg runt värden': 'Trim whitespace around values',
  'Hoppa över helt tomma rader': 'Skip completely empty rows',
  'Filen kunde inte läsas: {0}': 'The file could not be read: {0}',
  'Förhandsvisning — {0} första raderna': 'Preview — the first {0} rows',
  'Visa tolkat': 'Show interpreted',
  'Visa rådata': 'Show raw data',
  'En Excel-fil innehåller typade värden, inte text. Datum skrivs om till {0} och tal med det decimaltecken du valt, utan tusentalsavgränsare. Ledande nollor i textceller bevaras.':
    'An Excel file holds typed values, not text. Dates are rewritten as {0} and numbers with the decimal mark you chose, without thousands separators. Leading zeros in text cells are kept.',
  'Ser rätt ut: {0} kolumner, och svenska tecken visas korrekt (inga tecken som Ã¥ Ã¤ Ã¶).':
    'Looks right: {0} columns, and Swedish characters show correctly (no characters like Ã¥ Ã¤ Ã¶).',
  'Excels sep=-rad hittades och användes.': 'Excel’s sep= line was found and used.',
  'Filen innehåller bara ASCII-tecken i den del vi läst, så det går inte att avgöra om teckenkodningen är rätt vald. Har filen svenska tecken längre ned kan de behöva en annan kodning.':
    'The part of the file we read holds only ASCII characters, so there is no telling whether the encoding is the right one. If the file has Swedish characters further down, they may need a different encoding.',
  'Teckenkodningen ser trasig ut. Exempel ur filen: {0}. Prova en annan teckenkodning ovan.':
    'The character encoding looks broken. Examples from the file: {0}. Try a different encoding above.',


  /* ---------- Profiler ---------- */
  Profiler: 'Profiles',
  'Spara till fil': 'Save to file',
  'Öppna profilfil…': 'Open profile file…',
  'Det du gjort i den här filen': 'What you have done in this file',
  'Inga steg än. Städa, skriv om eller döp om något först — det som går att upprepa hamnar här.':
    'No steps yet. Clean up, rewrite or rename something first — whatever can be repeated ends up here.',
  'hör till den här filen': 'belongs to this file',
  'Handredigerade celler, inklistringar och borttagna rader pekar på rader i just den här filen och betyder ingenting i nästa. De kan därför inte sparas.':
    'Hand-edited cells, pastes and deleted rows point at rows in this particular file and mean nothing in the next. They therefore cannot be saved.',
  'Spara som profil': 'Save as a profile',
  't.ex. Månadsfilen från Fortnox': 'e.g. The monthly file from Fortnox',
  'Namn på profilen': 'Name of the profile',
  'Spara {0} steg': 'Save {0} steps',
  'Sparade profiler': 'Saved profiles',
  'Inga sparade profiler. De ligger i den här webbläsaren och lämnar aldrig datorn — spara dem till fil om de ska följa med någon annanstans.':
    'No saved profiles. They live in this browser and never leave the computer — save them to a file if they should travel somewhere else.',
  '{0} steg': '{0} steps',
  Kör: 'Run',
  'Ta bort profilen {0}': 'Remove the profile {0}',
  '{0} saknas i den här filen: {1}. De stegen hoppas över.':
    '{0} are missing from this file: {1}. Those steps are skipped.',
  'Så gick ”{0}”': 'How “{0}” went',
  '— hittade ingen kolumn som heter {0}': '— found no column called {0}',
  '— inget att ändra': '— nothing to change',
  '{0} av {1} steg kördes.': '{0} of {1} steps ran.',
  'Ett steg': 'One step',
  '{0} hittade inte sin kolumn — döp om kolumnen i filen, eller rätta profilen, och kör igen.':
    '{0} did not find its column — rename the column in the file, or fix the profile, and run again.',
  'Alla {0} steg kördes. Ctrl+Z backar ett steg i taget.':
    'All {0} steps ran. Ctrl+Z backs out one step at a time.',
  /* Mallarna ur `beskrivStegDelar`. */
  'Läs {0} som {1} i {2}': 'Read {0} as {1} into {2}',
  'Skriv om {0} till {1}': 'Rewrite {0} as {1}',
  'Städa tal i {0}': 'Clean up numbers in {0}',
  'Normalisera telefonnummer i {0}': 'Normalise phone numbers in {0}',
  'Läs {0} ur {1} till ”{2}”': 'Read {0} from {1} into “{2}”',
  'Ersätt ”{0}” i {1}': 'Replace “{0}” in {1}',
  'Dela {0} i {1}': 'Split {0} into {1}',
  'Slå ihop kolumner till ”{0}”': 'Merge columns into “{0}”',
  'Räkna ut ”{0}” som {1}': 'Calculate “{0}” as {1}',
  'Döp om {0} till {1}': 'Rename {0} to {1}',
  'Ta bort kolumnen {0}': 'Delete the column {0}',
  '{0} kolumnen {1}': '{0} the column {1}',
  Dölj: 'Hide',
  'Sätt typen på {0} till {1}': 'Set the type of {0} to {1}',
  'Lägg till {0} med löpnummer': 'Add {0} with sequence numbers',

  /* ---------- Kolumnöversikten ---------- */
  Kolumnöversikt: 'Column overview',
  'talen gäller den vy du har framme, inte alla {0} rader':
    'the figures apply to the view you have open, not all {0} rows',
  'kolumner har värden som inte går att tolka som sin typ':
    'columns hold values that cannot be read as their type',
  'är helt tomma': 'are completely empty',
  Ifyllt: 'Filled',
  Problem: 'Problems',
  Föreslås: 'Suggested',
  '{0} är dold': '{0} is hidden',
  'Gå till {0}': 'Go to {0}',
  'Typ för {0}': 'Type for {0}',
  '{0} ifyllda': '{0} filled in',
  'Visa de {0} rader som inte går att tolka som {1}':
    'Show the {0} rows that cannot be read as {1}',
  'inget som sticker ut': 'nothing stands out',
  'Förslagen kommer ur vad kolumnerna innehåller, inte ur deras typ. Ett klick öppnar verktyget på rätt kolumn.':
    'The suggestions come from what the columns contain, not from their type. One click opens the tool on the right column.',
  'Stäng översikten': 'Close the overview',


  /* ---------- Pivotvyn ---------- */
  Korstabell: 'Cross table',
  'Två håll samtidigt: en dimension som rader, en som kolumner.':
    'Two directions at once: one dimension as rows, one as columns.',
  Nivålista: 'Level list',
  'Ett håll i flera nivåer, med delsummor som går att fälla ihop.':
    'One direction in several levels, with subtotals you can collapse.',
  'Pivot…': 'Pivot table…',
  'Gruppera åt två håll i en egen vy. Datat rörs inte.':
    'Group in two directions in a view of its own. The data is left alone.',
  'Korstabell eller nivålista i en egen vy: gruppera åt två håll och se summorna direkt. Datat rörs inte.':
    'A cross table or a level list in a view of its own: group in two directions and see the totals at once. The data is left alone.',
  Nivåer: 'Levels',
  Mätvärden: 'Measures',
  '＋ Lägg till mätvärde': '＋ Add measure',
  'Ta bort mätvärdet': 'Remove the measure',
  ingen: 'none',
  'Byt plats på rader och kolumner': 'Swap rows and columns',
  '% av rad': '% of row',
  'Cellens del av radens Totalt.': "The cell's share of the row's Total.",
  '% av kolumn': '% of column',
  'Cellens del av kolumnens Totalt.': "The cell's share of the column's Total.",
  'Ta med rader utan värde': 'Include rows with no value',
  'Bara de {0} som visas nu': 'Only the {0} shown right now',
  Totalt: 'Total',
  Övriga: 'Other',
  '{0} värden': '{0} values',
  'Sortera raderna efter {0}': 'Sort the rows by {0}',
  'Visa eller dölj raderna under {0}': 'Show or hide the rows under {0}',
  'Välj en kolumn att dela upp på, så räknar pivoten resten.':
    'Pick a column to break the data down by, and the pivot works out the rest.',
  '{0} utan värde står utanför': '{0} with no value are left out',
  'Andel går bara att räkna på mätvärden som kan läggas ihop. Ett snitt är ingen del av ett annat snitt, och unika värden i en cell är inga delar av de unika i raden.':
    'A share can only be worked out for measures that add up. One average is no part of another, and the distinct values in a cell are no part of the distinct values in the row.',
  'Kolumnen har fler värden än som får plats. De {0} vanligaste har egna spalter, resten ligger i Övriga — summorna stämmer fortfarande.':
    'The column has more values than fit. The {0} most common get columns of their own, the rest sit in Other — the totals still add up.',
  '{0} radvärden fick inte plats och ligger i Övriga.':
    '{0} row values did not fit and sit in Other.',
  'Tabellen visar de första {0} raderna. Gör en flik för att få med allihop.':
    'The table shows the first {0} rows. Make a tab to get all of them.',
  '{0} av {1} värden gick att läsa som tal. Resten räknas inte med.':
    '{0} of {1} values could be read as numbers. The rest are left out.',
  Spalter: 'Columns shown',
  'Gör till ny flik': 'Make a new tab',
  'Stäng pivoten': 'Close the pivot',

  /* ---------- Diagrammet ---------- */
  Diagram: 'Chart',
  'Talen, rad för rad.': 'The numbers, row by row.',
  'Samma tal som form. Tabellen är alltid ett klick bort.':
    'The same numbers as shapes. The table is always one click away.',
  Form: 'Shape',
  Staplar: 'Bars',
  'En stapel per rad, stående.': 'One upright bar per row.',
  Liggande: 'Sideways',
  'Staplar på sidan — plats för långa namn bredvid stapeln i stället för under.':
    'Bars on their side — room for long names beside the bar instead of under it.',
  Linje: 'Line',
  'En linje per serie. Rätt när raddimensionen har en naturlig ordning, som ett datum.':
    'One line per series. Right when the row dimension has an order of its own, like a date.',
  Cirkel: 'Pie',
  'Delar av en helhet, en serie i taget.': 'Parts of a whole, one series at a time.',
  Staplarna: 'The bars',
  'Bredvid varandra': 'Side by side',
  'På varandra': 'Stacked',
  Rita: 'Plot',
  '{0} per {1}': '{0} by {1}',
  'och {0} till som inte fick plats': 'and {0} more that did not fit',
  'Det finns inget att rita med de här valen.': 'There is nothing to plot with these choices.',
  'Diagrammet visar de {0} första raderna. Tabellen har allihop.':
    'The chart shows the first {0} rows. The table has all of them.',
  'En linje antyder att det finns värden mellan punkterna, och mellan två orter finns inga. Staplar säger samma sak utan att lova det.':
    'A line suggests there are values between the points, and between two towns there are none. Bars say the same thing without promising that.',
  'Cirkel visar delar av en helhet, och det här mätvärdet går inte att lägga ihop.':
    'A pie shows parts of a whole, and this measure cannot be added up.',
  'Cirkel visar en serie i taget. Ta bort kolumndimensionen, eller välj staplar.':
    'A pie shows one series at a time. Drop the column dimension, or pick bars.',
  'Fler än sex tårtbitar går inte att skilja åt. Staplar klarar fler.':
    'More than six slices cannot be told apart. Bars handle more.',
  'En enda del är ingen helhet att dela upp.': 'A single part is no whole to divide.',
}
