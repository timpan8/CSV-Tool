/**
 * Städverktygen: datum, tal, telefon, e-post, dela, slå ihop kolumner, räkna, sök och ersätt — och panelramen de delar.
 *
 * Nyckeln är den svenska texten — se `sprak.ts`. En mening som saknas här
 * står kvar på svenska i gränssnittet.
 */
export const VERKTYG: Record<string, string> = {
  /* ---------- Panelramen, delad av alla verktyg ---------- */
  /* `Stäng` och `Avbryt` står i skalets modul — de är samma knapp överallt. */
  Tillämpa: 'Apply',
  'Tillämpa på {0} kolumner': 'Apply to {0} columns',
  '{0} kolumner: {1}': '{0} columns: {1}',
  'Vad som händer': 'What happens',
  'Alla rader': 'All rows',
  'Bara ändrade': 'Only changed',
  'Bara ifyllda': 'Only filled in',
  'Bara problem': 'Only problems',
  'Ingenting skulle ändras.': 'Nothing would change.',
  'Kolumnen skulle bli tom.': 'The column would come out empty.',
  'Skapa kolumnen': 'Create the column',
  'Lägg resultatet i en ny kolumn och låt originalet stå kvar':
    'Put the result in a new column and leave the original alone',
  'Namn på den nya kolumnen': 'Name of the new column',
  'En ny kolumn skapas åt gången, så det här gäller {0}. De andra {1} markerade kolumnerna lämnas orörda — stäng av valet för att skriva om allihop på plats i stället.':
    'One new column is created at a time, so this applies to {0}. The other {1} selected columns are left alone — turn the option off to rewrite them all in place instead.',
  'Tabellen visar {0} {1} {2} i kolumnen. Ingenting är ändrat förrän du klickar Tillämpa, och Ctrl+Z tar tillbaka det efteråt.':
    'The table shows {0} {1} {2} in the column. Nothing is changed until you click Apply, and Ctrl+Z brings it back afterwards.',
  före: 'before',
  efter: 'after',
  'Kolumnen är tom.': 'The column is empty.',

  /* ---------- Datum ---------- */
  Datum: 'Date',
  'Det här finns i kolumnen': 'What the column contains',
  'Skriv om till': 'Rewrite as',
  'Värden som inte går att tolka': 'Values that cannot be read',
  'Låt stå': 'Leave as is',
  'Värdet lämnas precis som det är. Du ser själv vilka rader som behöver ses över.':
    'The value is left exactly as it is. You can see for yourself which rows need a look.',
  'Skriv OGILTIGT': 'Write INVALID',
  'Gör raderna lätta att filtrera fram efteråt.': 'Makes the rows easy to filter out afterwards.',
  'Töm cellen': 'Empty the cell',
  'Tar bort värdet helt.': 'Removes the value entirely.',
  'Dagen först': 'Day first',
  'Svensk och europeisk ordning.': 'Swedish and European order.',
  'Månaden först': 'Month first',
  'Amerikansk ordning.': 'American order.',
  'med dagen först': 'with the day first',
  'med månaden först': 'with the month first',
  'Kolumnen svarar själv: {0} kan bara läsas {1}, eftersom det ena talet är större än 12. Samma ordning används för hela kolumnen.':
    'The column answers for itself: {0} can only be read {1}, since one of the numbers is greater than 12. The same order is used for the whole column.',
  'Står dagen eller månaden först i {0}?': 'Does the day or the month come first in {0}?',
  'Inget värde i kolumnen avgör saken — alla dag- och månadstal är 12 eller lägre. Att gissa här skulle flytta datum flera månader utan att det syns, så frågan måste besvaras.':
    'No value in the column settles it — every day and month number is 12 or lower. Guessing here would move dates by whole months without it showing, so the question has to be answered.',
  'Svara först på om dagen eller månaden står först.':
    'First answer whether the day or the month comes first.',
  'Tolka de {0} rena talen som Exceldatum': 'Read the {0} plain numbers as Excel dates',
  '{0} av {1} får ett värde i {2}': '{0} of {1} get a value in {2}',
  '{0} av {1} skrivs om': '{0} of {1} are rewritten',
  ' · {0} går inte att tolka': ' · {0} cannot be read',
  'De {0} raderna får {1} i {2}.': 'Those {0} rows get {1} in {2}.',
  'originalvärdet oförändrat': 'the original value unchanged',
  OGILTIGT: 'INVALID',
  'ingenting alls': 'nothing at all',
  'Kolumnen med streckad ram visar vad {0} kommer att innehålla. Ingenting är skapat förrän du klickar Skapa kolumnen, och Ctrl+Z tar bort den efteråt.':
    'The column with the dashed border shows what {0} will contain. Nothing is created until you click Create the column, and Ctrl+Z removes it afterwards.',
  'Datum ur ”{0}” → {1}': 'Dates from “{0}” → {1}',
  'Datum i ”{0}” → {1}': 'Dates in “{0}” → {1}',
  /* Formatnamnen ur `core/ops/dates.ts`. Å:et blir Y, men exemplet med
     månadsnamn står kvar på svenska: det är den svenska månadsstavningen
     tolken läser, och en översatt exempeltext hade beskrivit fel sak. */
  'ÅÅÅÅ-MM-DD': 'YYYY-MM-DD',
  'ÅÅÅÅ-MM-DD med klockslag': 'YYYY-MM-DD with a time',
  'ÅÅÅÅ-MM-DD TT:MM': 'YYYY-MM-DD HH:MM',
  'ÅÅÅÅ-MM': 'YYYY-MM',
  ÅÅÅÅ: 'YYYY',
  'ÅÅÅÅMMDD': 'YYYYMMDD',
  'DD/MM/ÅÅÅÅ eller MM/DD/ÅÅÅÅ': 'DD/MM/YYYY or MM/DD/YYYY',
  '27 augusti 2026': 'Written month name (27 augusti 2026)',
  'augusti 27, 2026': 'Written month name first (augusti 27, 2026)',
  'Exceldatum (serienummer)': 'Excel date (serial number)',
  'Går inte att tolka': 'Cannot be read',

  /* ---------- Tal ---------- */
  Tal: 'Number',
  'går att läsa som tal': 'can be read as numbers',
  'gör det inte': 'cannot',
  'skalas av': 'have a unit stripped',
  'negativa som (1 240) eller 1240–': 'negatives written as (1 240) or 1240–',
  'Kolumnen svarar själv: {0} visar att punkten är {1}.':
    'The column answers for itself: {0} shows that the dot is {1}.',
  tusentalsavgränsare: 'a thousands separator',
  decimaltecken: 'a decimal mark',
  'Vad betyder punkten i {0}?': 'What does the dot mean in {0}?',
  Decimaltecken: 'Decimal mark',
  Decimalkomma: 'Decimal comma',
  Decimalpunkt: 'Decimal point',
  'Talet 1,234.': 'The number 1.234.',
  Tusental: 'Thousands',
  'Talet 1234.': 'The number 1234.',
  'Inget värde i kolumnen avgör saken. Skillnaden är tusen gånger, så frågan måste besvaras.':
    'No value in the column settles it. The difference is a factor of a thousand, so the question has to be answered.',
  'Svara först på vad punkten betyder.': 'First answer what the dot means.',
  'Antal decimaler': 'Number of decimals',
  'Som i filen ({0})': 'As in the file ({0})',
  'Så många decimaler som kolumnen mest innehåller.':
    'As many decimals as the column mostly contains.',
  Oförändrat: 'Unchanged',
  'Så många decimaler talet behöver. 980,00 blir 980.':
    'As many decimals as the number needs. 980,00 becomes 980.',
  'Värden som inte går att läsa som tal': 'Values that cannot be read as numbers',
  'Värdet lämnas som det är.': 'The value is left as it is.',
  'Gör raderna lätta att filtrera fram.': 'Makes the rows easy to filter out.',
  ' · {0} är inte tal': ' · {0} are not numbers',
  SUMMA: 'SUM',
  'Tusentalsavgränsare skrivs aldrig ut. De är till för att läsas av människor; ett tal i en fil ska kunna läsas av nästa program. Kolumnen typas som tal, vilket gör att {0} fungerar direkt i en Excel-export.':
    'Thousands separators are never written out. They are there to be read by people; a number in a file has to be readable by the next program. The column is typed as a number, which makes {0} work straight away in an Excel export.',
  'Städade tal i ”{0}”': 'Cleaned up numbers in “{0}”',


  /* ---------- Telefon ---------- */
  Telefon: 'Phone',
  telefonnummer: 'phone numbers',
  'går inte att tolka': 'cannot be read',
  'har redan landskod': 'already have a country code',
  'är utländska': 'are foreign',
  'Nummer utan landskod tillhör': 'Numbers without a country code belong to',
  'Sverige +46': 'Sweden +46',
  'Norge +47': 'Norway +47',
  'Danmark +45': 'Denmark +45',
  'Värden som inte är telefonnummer': 'Values that are not phone numbers',
  'Numret skrivs utan mellanrum. Att gruppera {0} kräver att man vet hur långt riktnumret är, och det är två till fyra siffror beroende på ort — en gissning som blir fel ser fortfarande rimlig ut.':
    'The number is written without spaces. Grouping {0} requires knowing how long the area code is, and that is two to four digits depending on the place — a guess that comes out wrong still looks reasonable.',
  'Normaliserade telefonnummer i ”{0}”': 'Normalised phone numbers in “{0}”',


  /* ---------- E-post ---------- */
  'E-post': 'Email',
  'e-postadresser': 'email addresses',
  'är inte adresser': 'are not addresses',
  funktionsadresser: 'role accounts',
  privatadresser: 'personal addresses',
  domäner: 'domains',
  Hämta: 'Take out',
  Förnamn: 'First name',
  Efternamn: 'Last name',
  'Förnamn och Efternamn, var sin kolumn': 'First name and Last name, a column each',
  'Förnamn Efternamn': 'First name Last name',
  'Allt före @': 'Everything before the @',
  Domän: 'Domain',
  'Ny kolumn': 'New column',
  '{0} ur ”{1}”': '{0} from “{1}”',
  'Vilken del står först i adressen?': 'Which part comes first in the address?',
  Förnamnet: 'The first name',
  Efternamnet: 'The last name',
  '{0} läses som {1}.': '{0} is read as {1}.',
  'Namn på de nya kolumnerna': 'Names of the new columns',
  'Namn på förnamnskolumnen': 'Name of the first-name column',
  'Namn på efternamnskolumnen': 'Name of the last-name column',
  'Skapa kolumnerna': 'Create the columns',
  '{0} av {1} ger ett värde': '{0} of {1} give a value',
  ' · {0} blir tomma': ' · {0} come out empty',
  'Bara tomma': 'Only empty',
  'Å, ä och ö finns inte i adresser.': 'Å, ä and ö do not exist in addresses.',
  '{0} {1} ger {2}, aldrig {3} — informationen finns inte i adressen, och verktyget kan inte se vilka av namnen det gäller. Har du en namnkolumn i filen är den mer tillförlitlig än den här.':
    '{0} {1} gives {2}, never {3} — the information is not in the address, and the tool cannot tell which of the names it applies to. If the file has a name column, that one is more reliable than this.',


  /* ---------- Dela kolumn ---------- */
  'Dela kolumn': 'Split column',
  Dela: 'Split',
  'Vid varje': 'At every',
  'Delar vid varje förekomst av tecknet. Anna;Karlsson;Lund blir tre kolumner.':
    'Splits at every occurrence of the character. Anna;Karlsson;Lund becomes three columns.',
  'Vid första': 'At the first',
  'Delar bara vid den första förekomsten. Anna Maria Karlsson blir Anna + Maria Karlsson.':
    'Splits only at the first occurrence. Anna Maria Karlsson becomes Anna + Maria Karlsson.',
  'Vid sista': 'At the last',
  'Delar bara vid den sista förekomsten. Anna Maria Karlsson blir Anna Maria + Karlsson.':
    'Splits only at the last occurrence. Anna Maria Karlsson becomes Anna Maria + Karlsson.',
  'Efter antal tecken': 'After a number of characters',
  'Delar på en fast position. Användbart för koder med fast längd.':
    'Splits at a fixed position. Useful for codes of a fixed length.',
  'Efter hur många tecken': 'After how many characters',
  'Vid vilket tecken': 'At which character',
  Mellanslag: 'Space',
  Komma: 'Comma',
  Semikolon: 'Semicolon',
  Bindestreck: 'Hyphen',
  'Eget…': 'Custom…',
  'Antal nya kolumner': 'Number of new columns',
  'Något värde delas i {0} delar. Överskottet hamnar i den sista kolumnen i stället för att försvinna — höj antalet om du vill ha det för sig.':
    'Some value splits into {0} parts. The surplus ends up in the last column instead of disappearing — raise the number if you want it on its own.',
  'Skapa {0} kolumner': 'Create {0} columns',
  'Delningen ger inga värden.': 'The split produces no values.',
  '{0} blir {1}': '{0} becomes {1}',
  '(tomt)': '(empty)',
  '{0} av {1} ger värden': '{0} of {1} give values',
  ' · {0} saknar avgränsare': ' · {0} have no separator',
  'Bara odelade': 'Only unsplit',
  'Delade ”{0}” i {1} kolumner': 'Split “{0}” into {1} columns',


  /* ---------- Bygg kolumn ur mall ---------- */
  'Bygg kolumn ur mall': 'Build column from template',
  Undantag: 'Exceptions',
  'Första raden ska se annorlunda ut': 'The first row should look different',
  'Sista raden ska se annorlunda ut': 'The last row should look different',
  'Mall för första raden': 'Template for the first row',
  'Mall för sista raden': 'Template for the last row',
  'Första raden': 'First row',
  'Sista raden': 'Last row',
  'Så blir det': 'How it comes out',
  'Första och sista raden är de du ser nu. Sorterar eller filtrerar du om behöver kolumnen byggas om.':
    'The first and last rows are the ones you see now. Sort or filter differently and the column needs rebuilding.',
  Sammanslagen: 'Merged',
  Mall: 'Template',
  'Skriv {0} där ett värde ska in. Allt annat kommer med som det står.':
    'Write {0} where a value should go. Everything else comes along as written.',
  'Lägg till kolumn': 'Add column',
  'Mallen pekar på kolumner som inte finns.': 'The template points at columns that do not exist.',
  'en kolumn': 'a column',
  kolumner: 'columns',
  'Mallen pekar på {0} som inte finns: {1}. Ett stavfel ger annars en kolumn full av halva värden.':
    'The template points at {0} that does not exist: {1}. A typo otherwise gives you a column full of half values.',
  'Städa bort luckor efter tomma värden': 'Clear out the gaps left by empty values',
  '{0} av {1} ger ett värde.': '{0} of {1} give a value.',
  'Värdet räknas ut rad för rad, eftersom det beror på flera kolumner. På riktigt stora filer märks det som en kort fördröjning när du skriver i mallen.':
    'The value is worked out row by row, since it depends on several columns. On really large files that shows up as a short delay while you type in the template.',


  /* ---------- Räkna ---------- */
  Räkna: 'Calculate',
  Beräknad: 'Calculated',
  Formel: 'Formula',
  'Skriv en formel som går att räkna.': 'Write a formula that can be worked out.',
  'Ingen rad gav ett värde.': 'No row produced a value.',
  'Fyra räknesätt och parenteser. Skriv {0} för ett värde ur raden. Tal skrivs som i filen: {1} eller {2}.':
    'The four operations and parentheses. Write {0} for a value from the row. Numbers are written as in the file: {1} or {2}.',
  'Datum räknas som antal dagar.': 'Dates count as a number of days.',
  Funktioner: 'Functions',
  'Avrundar. RUNDA({Belopp} * 1,25; 2)': 'Rounds. RUNDA({Belopp} * 1,25; 2)',
  'Tar bort minustecknet.': 'Removes the minus sign.',
  'Det minsta av två värden.': 'The smaller of two values.',
  'Det största av två värden.': 'The larger of two values.',
  'En datumkolumn räknas som antal dagar, så {0} ger skillnaden i dagar. Resultatet är alltid ett tal — verktyget gissar aldrig att du ville ha ett datum tillbaka.':
    'A date column counts as a number of days, so {0} gives the difference in days. The result is always a number — the tool never guesses that you wanted a date back.',
  Decimaler: 'Decimals',
  'Så många som behövs': 'As many as needed',
  '{0} av {1} får ett värde': '{0} of {1} get a value',
  ' · {0} blir tomma, eftersom något värde saknas eller inte är ett tal':
    ' · {0} come out empty, because some value is missing or is not a number',


  /* ---------- Sök och ersätt ---------- */
  'Sök och ersätt': 'Find and replace',
  'Sök efter': 'Find',
  'text att hitta': 'text to find',
  'Ersätt med': 'Replace with',
  'lämna tomt för att radera träffen': 'leave empty to delete the match',
  'Hela cellen': 'The whole cell',
  'Skilj på VERSALER och gemener': 'Tell UPPERCASE and lowercase apart',
  'Reguljärt uttryck': 'Regular expression',
  'Strunta i å ä ö ({0} hittar {1})': 'Ignore å ä ö ({0} finds {1})',
  '{0} siffra · {1} blanksteg · {2} början · {3} slut · {4} grupp som {5} i ersättningen.':
    '{0} digit · {1} whitespace · {2} start · {3} end · {4} group, used as {5} in the replacement.',
  'Skriv något att söka efter.': 'Write something to search for.',
  '{0} av {1} ändras.': '{0} of {1} change.',
  'Bara träffar': 'Only matches',
  Ersätt: 'Replace',
  'Ersätt i {0} kolumner': 'Replace in {0} columns',
  'Ingenting träffas.': 'Nothing matches.',
  'Ersatte ”{0}” med ”{1}” i ”{2}”': 'Replaced “{0}” with “{1}” in “{2}”',


  /* Felmeddelanden som är hela meningar. De interpolerade står kvar på svenska. */
  'Accentokänslig sökning fungerar bara tillsammans med ”hela cellen”.':
    'Accent-insensitive search only works together with “the whole cell”.',
  'En kolumnhänvisning saknar sitt avslutande }.': 'A column reference is missing its closing }.',


  /* ---------- Sortera ---------- */
  /* `Sortera` och `Ta bort sorteringen` står i skalets modul — kommandot,
     kolumnmenyn och panelen delar samma ord. */
  'Ingen sortering': 'No sorting',
  nivå: 'level',
  nivåer: 'levels',
  Klar: 'Done',
  'Ordningen räknades innan de senaste ändringarna, så raderna ligger kvar där de var.':
    'The order was worked out before the latest changes, so the rows are still where they were.',
  'Nivåer, viktigast först': 'Levels, most important first',
  ' (dold)': ' (hidden)',
  'Ta bort nivån {0}': 'Remove the level {0}',
  'Ta bort nivån': 'Remove the level',
  'Raderna ligger i filens ordning. Lägg till en nivå, eller klicka på pilen i en kolumnrubrik.':
    'The rows are in the order of the file. Add a level, or click the arrow in a column heading.',
  '＋ Lägg till nivå': '＋ Add level',
  'Sorteringen ändrar bara i vilken ordning raderna visas — inga värden flyttas i filen, och radnumret till vänster fortsätter visa var raden stod. Tomma celler hamnar alltid sist, oavsett riktning: en tom cell är inte det minsta värdet, den saknas.':
    'Sorting only changes the order the rows are shown in — no values move in the file, and the row number on the left keeps showing where the row stood. Empty cells always end up last, whichever direction: an empty cell is not the smallest value, it is missing.',
  'Minst först': 'Smallest first',
  'Äldst först': 'Oldest first',
  'Störst först': 'Largest first',
  'Nyast först': 'Newest first',
  /* `A→Ö` och `Ö→A` står kvar: sorteringen är svensk oavsett språk, och
     `A→Z` hade lovat en ordning där z ligger sist. Det gör den inte. */

  /* ---------- Kolumntyperna ---------- */
  'Ja/Nej': 'Yes/No',
  Tom: 'Empty',
  'Kunde inte tolkas som {0}. Värdet står kvar som det är.':
    'Could not be read as {0}. The value is left as it is.',
  'Typ: {0}. Klicka för att byta. Värden skrivs aldrig om.':
    'Type: {0}. Click to change. Values are never rewritten.',


  /* ---------- Innehållets skäl (mallarna ur `core/frame/innehall.ts`) ---------- */
  '{0} ser ut som adresser': '{0} look like addresses',
  '{0} ser ut som telefonnummer': '{0} look like phone numbers',
  '{0} går att läsa som datum': '{0} can be read as dates',
  '{0} går att läsa som datum, i {1} format': '{0} can be read as dates, in {1} formats',
  '{0} går att läsa som tal': '{0} can be read as numbers',
  '{0} går att läsa som tal, med {1}': '{0} can be read as numbers, with {1}',
  '{0} går att dela i två ord': '{0} can be split into two words',


  /* ---------- Filter ---------- */
  'Inga aktiva regler': 'No active rules',
  /* `{0} av {1} rader` står i skalets modul — statusraden säger samma sak. */
  'Ta bort alla regler': 'Remove all rules',
  'En rad visas när': 'A row is shown when',
  'Alla regler stämmer': 'All rules match',
  'Någon regel stämmer': 'Some rule matches',
  Regler: 'Rules',
  'Regeln är på': 'The rule is on',
  'Borttagen kolumn': 'Deleted column',
  /* Operatorerna ur `core/ops/filter.ts`. */
  är: 'is',
  'är inte': 'is not',
  'är något av': 'is one of',
  innehåller: 'contains',
  'innehåller inte': 'does not contain',
  'börjar med': 'starts with',
  'slutar med': 'ends with',
  'större än': 'greater than',
  minst: 'at least',
  'mindre än': 'less than',
  högst: 'at most',
  mellan: 'between',
  'är längre än': 'is longer than',
  'är kortare än': 'is shorter than',
  'är tom': 'is empty',
  'är ifylld': 'is filled in',
  'matchar uttrycket': 'matches the expression',
  'Välj värden…': 'Choose values…',
  '{0} valda': '{0} chosen',
  'antal tecken': 'number of characters',
  värde: 'value',
  till: 'to',
  'Ta bort regeln': 'Remove the rule',
  'Skriv ett antal tecken.': 'Write a number of characters.',
  'Kolumnen finns inte längre. Regeln ligger kvar och börjar gälla igen om du ångrar borttagningen.':
    'The column no longer exists. The rule stays and takes effect again if you undo the deletion.',
  'Inga regler än. Alla rader visas.': 'No rules yet. All rows are shown.',
  '＋ Lägg till regel': '＋ Add rule',
  'Visa i stället de rader filtret döljer': 'Show the rows the filter hides instead',
  'Vändningen gäller filtret som helhet. Att se vad man sorterat bort är det enda sättet att märka att man sorterat bort fel saker.':
    'The inversion applies to the filter as a whole. Seeing what you filtered away is the only way to notice that you filtered away the wrong things.',
  'Gör urvalet permanent': 'Make the selection permanent',
  'Behåll bara de {0} som visas': 'Keep only the {0} being shown',
  'Ta bort de {0} som visas': 'Remove the {0} being shown',
  'Båda ändrar filen och går att ångra. Filtret rensas efteråt, eftersom det inte längre har något att dölja.':
    'Both change the file and can be undone. The filter is cleared afterwards, since it no longer has anything to hide.',
  '{0} av reglerna räknas inte just nu — de är avslagna, ofärdiga eller pekar på en kolumn som tagits bort. De ligger kvar.':
    '{0} of the rules do not count right now — they are switched off, unfinished, or point at a column that has been deleted. They stay.',
  'Sök bland {0} värden…': 'Search among {0} values…',
  'Visar de 200 vanligaste av {0}. Sök för att hitta fler.':
    'Showing the 200 most common of {0}. Search to find more.',
  'Inga värden matchar.': 'No values match.',


  /* ---------- Dubbletter ---------- */
  'Inga dubbletter med den här nyckeln': 'No duplicates with this key',
  'Rader räknas som lika när de stämmer i': 'Rows count as the same when they match in',
  'Alla kolumner. En hel rad måste vara identisk — kryssa ur det som skiljer sig, som ett löpnummer.':
    'All columns. A whole row has to be identical — untick what differs, such as a sequence number.',
  'Strunta i': 'Ignore',
  VERSALER: 'UPPERCASE',
  'Extra blanksteg': 'Extra whitespace',
  'Med å ä ö bortstruket räknas {0} och {1} som samma ord. Det är ofta rätt för namn ur olika system, men det kan också slå ihop två personer som faktiskt heter olika.':
    'With å ä ö stripped, {0} and {1} count as the same word. That is often right for names from different systems, but it can also merge two people whose names really do differ.',
  'Vad som hittades': 'What was found',
  'grupp med lika rader': 'group of matching rows',
  'grupper med lika rader': 'groups of matching rows',
  'rader ingår': 'rows are involved',
  varje: 'every',
  'av grupperna är identiska i {0} kolumn — de kan tas bort utan att du tittar':
    'of the groups are identical in {0} column — they can be removed without you looking',
  'skiljer sig utanför nyckeln — den ena raden kan bära uppgifter den andra saknar':
    'differ outside the key — one row may carry details the other is missing',
  'skulle tas bort': 'would be removed',
  'rader i den största gruppen': 'rows in the largest group',
  'Räkna rader som är tomma i hela nyckeln som lika':
    'Count rows that are empty across the whole key as the same',
  'Bara dubbletterna': 'Only the duplicates',
  'Grupperna ligger intill varandra, med en linje mellan dem.':
    'The groups sit next to each other, with a line between them.',
  'Vid borttagning, behåll': 'When removing, keep',
  'Den första i filen': 'The first one in the file',
  'Den sista i filen': 'The last one in the file',
  'Den jag väljer': 'The one I pick',
  'Peka ut raden som ska stanna med ringen vid radnumret.':
    'Point out the row that should stay using the ring by the row number.',
  'Klicka på ringen vid radnumret för den rad som ska stanna i varje grupp.':
    'Click the ring by the row number for the row that should stay in each group.',
  '{0} av {1} grupper har ett eget val; resten behåller den första.':
    '{0} of {1} groups have a choice of their own; the rest keep the first one.',
  'Utan eget val stannar den första i filen.':
    'Without a choice of your own, the first one in the file stays.',
  'Första och sista räknas i filens ordning, inte i den du tittar på nu — annars skulle valet betyda olika saker beroende på hur du sorterat. Borttagningen går att ångra.':
    'First and last count in the order of the file, not the one you are looking at now — otherwise the choice would mean different things depending on how you sorted. The removal can be undone.',


  /* ---------- Verktygens och städningarnas namn (kärnans tabeller) ---------- */
  /*
   * De här slås upp dynamiskt — `t(v.etikett)` i `kommandon.ts` och
   * `Inspector.tsx` — så inget test kan se att de saknas. De stod kvar på
   * svenska efter etapp 23 av precis det skälet.
   */
  'Datum…': 'Dates…',
  'Tal…': 'Numbers…',
  'Telefon…': 'Phone numbers…',
  'E-post → namn…': 'Email → name…',
  'Dela kolumnen…': 'Split the column…',
  'Bygg kolumn ur mall…': 'Build column from template…',
  'Räkna…': 'Calculate…',
  'Sök och ersätt…': 'Find and replace…',
  'Trimma blanksteg': 'Trim whitespace',
  'Tar bort mellanslag i början och slutet av varje värde.':
    'Removes spaces at the start and end of every value.',
  'Slå ihop dubbla mellanslag': 'Collapse double spaces',
  'Gör flera mellanslag i rad till ett enda.': 'Turns several spaces in a row into one.',
  'Ta bort osynliga tecken': 'Remove invisible characters',
  'Nollbreddstecken, hårt mellanslag och dekomponerade bokstäver. Det är den vanligaste orsaken till att två värden ser lika ut men inte matchar.':
    'Zero-width characters, non-breaking spaces and decomposed letters. It is the most common reason two values look alike but do not match.',
  'Gör alla bokstäver stora.': 'Makes every letter uppercase.',
  gemener: 'lowercase',
  'Gör alla bokstäver små.': 'Makes every letter lowercase.',
  'Stor Första Bokstav': 'Capital First Letter',
  'Stor bokstav först i varje ord. Klarar Anna-Lena och O’Brien.':
    'A capital letter at the start of each word. Handles Anna-Lena and O’Brien.',

}
