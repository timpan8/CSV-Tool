/**
 * Engelska motsvarigheter till gränssnittets svenska text.
 *
 * Nyckeln *är* den svenska texten. Se `sprak.ts` för varför: koden ska gå att
 * läsa utan att slå upp något, och en text som saknas här faller tillbaka på
 * svenskan i stället för att visa en nyckel.
 *
 * **Ordboken är avsiktligt bara etiketter.** Sorteringen är fortfarande
 * svensk, tal skrivs fortfarande `1 240,50` och datumverktyget läser
 * fortfarande `augusti`. Texterna nedan säger det där det spelar roll, i
 * stället för att låta någon upptäcka det när en lista sorteras "fel".
 *
 * Ordningen följer gränssnittet, inte alfabetet: att leta efter en mening går
 * snabbare när den står bredvid sina grannar på skärmen.
 *
 * Den här modulen är **skalet** — ytan man möter oavsett vad man gör: tomma
 * läget, verktygsraden, statusraden, flikraden, rutnätet, paletten, menyerna
 * och notiserna.
 */
export const SKAL: Record<string, string> = {
  /* ---------- Tomma läget ---------- */
  'Släpp dina filer här': 'Drop your files here',
  'CSV, TXT, tabbseparerad text eller Excel (.xlsx)':
    'CSV, TXT, tab-separated text or Excel (.xlsx)',
  'Välj fil…': 'Choose file…',
  '…eller klistra in data direkt med Ctrl+V': '…or paste data straight in with Ctrl+V',
  'Inget laddas upp.': 'Nothing is uploaded.',
  'Filen öppnas i din webbläsare och lämnar aldrig datorn. Verktyget kan inte skicka data någonstans — det är låst i sidans säkerhetspolicy och går att kontrollera i utvecklarverktygen.':
    'The file opens in your browser and never leaves this computer. The tool cannot send data anywhere — that is locked down in the page’s security policy, and you can verify it in the developer tools.',
  'Prova utan egen fil': 'Try it without a file of your own',
  'Öppna exempelfil': 'Open example file',
  'Öppna två filer att slå ihop': 'Open two files to merge',
  'Det här kan du göra': 'Here is what you can do',
  'Öppna och städa CSV · sortera och filtrera · hitta dubbletter · slå ihop två filer · exportera Excel-vänligt':
    'Open and clean CSV · sort and filter · find duplicates · merge two files · export Excel-friendly',

  /* ---------- Verktygsraden ---------- */
  Öppna: 'Open',
  Sortera: 'Sort',
  Filter: 'Filter',
  Dubbletter: 'Duplicates',
  Städa: 'Clean',
  'Flera filer': 'Multiple files',
  'Sammanfatta…': 'Summarise…',
  'Profiler…': 'Profiles…',
  Exportera: 'Export',
  Ångra: 'Undo',
  'Gör om': 'Redo',
  'Flernivåsortering med svensk bokstavsordning. Ändrar bara ordningen, aldrig värdena.':
    'Multi-level sorting in Swedish alphabetical order. Changes the order only, never the values.',
  'Visa bara de rader som stämmer med dina regler. Raderna finns kvar.':
    'Show only the rows matching your rules. The rows are still there.',
  'Hitta rader som är lika i de kolumner du väljer, och visa dem grupperade.':
    'Find rows that are alike in the columns you choose, and show them grouped.',

  /* ---------- Statusraden ---------- */
  'Ingen fil öppen': 'No file open',
  'Rader ▾': 'Rows ▾',
  '● Allt lokalt': '● All local',
  'Visa alla rader': 'Show all rows',
  'Sortera om': 'Sort again',
  'Ta bort sorteringen': 'Remove the sorting',
  'Snabbsumma för markeringen': 'Quick sum for the selection',
  'Så här är raderna sorterade.': 'This is how the rows are sorted.',
  'Ordningen räknades innan de senaste ändringarna. Raderna ligger kvar där de var.':
    'The order was computed before the latest changes. The rows are still where they were.',
  Fortsätt: 'Continue',
  'Verktyget kan inte skicka data någonstans. Filerna sparas i din egen webbläsare så att de finns kvar nästa gång. Klicka för att se vad som ligger där och rensa alltihop.':
    'The tool cannot send data anywhere. Files are saved in your own browser so they are still here next time. Click to see what is stored and clear all of it.',
  'Sorterat: {0}': 'Sorted: {0}',
  '{0} markerade': '{0} selected',
  '{0} unika': '{0} unique',
  '{0} av {1} rader': '{0} of {1} rows',
  '{0} rader': '{0} rows',
  '{0} kolumner': '{0} columns',
  '{0} kvar att beta av': '{0} left to work through',
  '{0} kom inte med': '{0} did not come along',
  'Sammanslagningen {0} är påbörjad och har rader kvar att beta av.':
    'The merge {0} is under way and still has rows to work through.',

  /* ---------- Flikraden ---------- */
  Namnlös: 'Untitled',
  'Stäng {0}': 'Close {0}',
  'Påbörjad sammanslagning med rader kvar att beta av':
    'Merge under way, with rows left to work through',

  /* ---------- Rutnätet ---------- */
  'Inga rader att visa.': 'No rows to show.',
  'Klicka för att sortera. Skift-klick lägger till en nivå.':
    'Click to sort. Shift-click adds another level.',
  'Sorterat på {0}, {1}. Klicka för att vända.': 'Sorted by {0}, {1}. Click to reverse.',
  stigande: 'ascending',
  fallande: 'descending',
  'Meny för kolumnen {0}': 'Menu for the column {0}',
  'Dra för att ändra bredd. Dubbelklicka för att anpassa efter innehållet.':
    'Drag to change the width. Double-click to fit the contents.',
  'Radens nummer i källfilen. Ändras inte av sortering eller filtrering.':
    'The row’s number in the source file. Sorting and filtering do not change it.',
  'Raden är identisk med de andra i sin grupp i varje kolumn.':
    'The row is identical to the others in its group in every column.',
  'Tillagd rad — fanns inte i filen': 'Added row — was not in the file',
  'Rad {0} i filen': 'Row {0} in the file',
  '. Identisk med de andra i sin dubblettgrupp.': '. Identical to the others in its duplicate group.',
  '. Klicka för att markera raden.': '. Click to select the row.',
  'ny kolumn': 'new column',

  /* ---------- Menyer och kolumnåtgärder ---------- */
  'Byt namn…': 'Rename…',
  'Duplicera kolumnen': 'Duplicate the column',
  'Visa kolumnen': 'Show the column',
  'Dölj kolumnen': 'Hide the column',
  'Infoga tom kolumn till vänster': 'Insert an empty column to the left',
  'Infoga tom kolumn till höger': 'Insert an empty column to the right',
  'Lägg till kolumn med löpnummer': 'Add a column of row numbers',
  '1, 2, 3 … först i filen, i radernas nuvarande ordning':
    '1, 2, 3 … first in the file, in the rows’ current order',
  'Flytta först': 'Move first',
  'Flytta sist': 'Move last',
  'Anpassa bredden efter innehållet': 'Fit the width to the contents',
  'Sortera A→Ö': 'Sort A→Z',
  'Sortera Ö→A': 'Sort Z→A',
  'Lägg till som sorteringsnivå': 'Add as a sorting level',
  'Filtrera på kolumnen…': 'Filter on the column…',
  'en rad per värde, med summa och antal för resten av kolumnerna':
    'one row per value, with sum and count for the remaining columns',
  'Visa rader som inte går att tolka': 'Show rows that cannot be read',
  'Fler verktyg': 'More tools',
  'Ta bort kolumnen': 'Delete the column',
  'Infoga rad ovanför': 'Insert a row above',
  'Infoga rad nedanför': 'Insert a row below',
  'Dubblera markerade rader': 'Duplicate the selected rows',
  'Ta bort markerade rader': 'Delete the selected rows',
  'Klipp ut': 'Cut',
  Kopiera: 'Copy',
  'Klistra in': 'Paste',
  'Klistra in som ny fil': 'Paste as a new file',
  'lämnar den här tabellen orörd': 'leaves this table untouched',
  'Fyll markeringen med ett värde…': 'Fill the selection with a value…',
  'Skriv ett värde…': 'Type a value…',
  'Fyll nedåt': 'Fill down',
  'Ta bort helt tomma rader': 'Delete completely empty rows',
  'Ta bort helt tomma kolumner': 'Delete completely empty columns',
  Stäng: 'Close',
  'Stäng vyn': 'Close the view',
  'Något gick fel i vyn: {0}': 'Something went wrong in the view: {0}',

  /* ---------- Paletten ---------- */
  'Sök bland kommandon': 'Search commands',
  'Inget kommando matchar': 'No command matches',
  Fil: 'File',
  Tabell: 'Table',
  Kolumn: 'Column',
  Rader: 'Rows',
  Verktyg: 'Tools',
  Visa: 'View',
  'Öppna fil…': 'Open file…',
  'Exportera…': 'Export…',
  'Sök…': 'Search…',
  'Sortera…': 'Sort…',
  'Filter…': 'Filter…',
  'Dubbletter…': 'Duplicates…',
  'Slå ihop med en annan fil…': 'Merge with another file…',
  'Rader som hör ihop läggs sida vid sida, matchat på en nyckel.':
    'Rows that belong together are placed side by side, matched on a key.',
  'Fortsätt beta av resten…': 'Carry on with the rest…',
  'Tar upp den påbörjade sammanslagningen {0} igen.': 'Picks up the merge {0} where you left it.',
  'Gruppera och summera…': 'Group and summarise…',
  'En rad per grupp: summa Belopp per Ort, antal ordrar per kund.':
    'One row per group: sum of Amount by City, number of orders per customer.',
  'Kolumnöversikt…': 'Column overview…',
  'Alla kolumner med ifyllnad, unika värden, problem och förslag.':
    'Every column with fill rate, unique values, problems and suggestions.',
  'Kombinera filer…': 'Combine files…',
  'Filerna läggs på varandra, kolumner som betyder samma sak i samma spalt.':
    'The files are stacked, with columns that mean the same thing in the same place.',
  'Fyll en mall med data…': 'Fill a template with data…',
  'En fil med bara rubriker bestämmer formen, data hämtas ur de filer du väljer.':
    'A file with headers only sets the shape; the data is taken from the files you choose.',
  'Spara den här filens arbetsgång och kör om den på nästa fil.':
    'Save this file’s steps and run them again on the next file.',
  'Glöm sparade filer': 'Forget saved files',
  'Tömmer det verktyget sparat i webbläsaren. Flikarna du har öppna står kvar.':
    'Clears what the tool has saved in the browser. The tabs you have open stay put.',
  'Börja om…': 'Start over…',
  'Stänger alla filer, kastar en påbörjad sammanslagning och tömmer webbläsarens lagring. Sidan laddas om.':
    'Closes every file, discards a merge in progress and clears the browser’s storage. The page reloads.',
  'Öppnar det du kopierat som en egen flik i stället för att skriva in det i tabellen du står i.':
    'Opens what you copied as its own tab instead of writing it into the table you are in.',
  'En ny kolumn först i filen med 1, 2, 3 … i radernas nuvarande ordning. Numret följer med vid export, så det går att sortera tillbaka.':
    'A new column first in the file with 1, 2, 3 … in the rows’ current order. The number is exported too, so you can sort your way back.',
  'Infoga en ny kolumn': 'Insert a new column',
  'Byt namn på {0}…': 'Rename {0}…',
  'Duplicera {0}': 'Duplicate {0}',
  'Dölj {0}': 'Hide {0}',
  'Visa {0}': 'Show {0}',
  'Ta bort {0}': 'Delete {0}',
  'Filtrera på {0}…': 'Filter on {0}…',
  'Visa ogiltiga värden i {0}': 'Show invalid values in {0}',
  'Byt ljust eller mörkt läge': 'Switch light or dark mode',
  'Byt språk till engelska': 'Switch language to Swedish',
  'Gränssnittets text byter språk. Sortering, tal och datum följer alltid svenska regler.':
    'The interface text changes language. Sorting, numbers and dates always follow Swedish rules.',

  /* ---------- Notiser ---------- */
  'Klistrade in {0}.': 'Pasted {0}.',
  'Klippte ut {0}.': 'Cut {0}.',
  'Öppna som ny fil i stället': 'Open as a new file instead',
  'Tömde {0}.': 'Emptied {0}.',
  'Fyllde {0}.': 'Filled {0}.',
  'Fyllde nedåt i {0}.': 'Filled down into {0}.',
  'Cellerna hade redan det värdet.': 'The cells already had that value.',
  'Ångrade: {0}': 'Undone: {0}',
  'Gjorde om: {0}': 'Redone: {0}',
  'Tog bort {0} som var helt tomma': 'Deleted {0} that were completely empty.',
  'Lade till {0} med löpnummer 1–{1}.': 'Added {0} with row numbers 1–{1}.',
  'Urklippet är tomt.': 'The clipboard is empty.',
  'Webbläsaren tillät inte att urklippet lästes. Tryck Ctrl+V i stället.':
    'The browser did not allow reading the clipboard. Press Ctrl+V instead.',
  'Webbläsaren tillät inte att urklippet lästes. Tryck Ctrl+Skift+V i stället.':
    'The browser did not allow reading the clipboard. Press Ctrl+Shift+V instead.',
  'Det sparade är borta. Flikarna du har öppna står kvar, och det du gör härnäst sparas som vanligt.':
    'The saved data is gone. The tabs you have open stay put, and what you do next is saved as usual.',

  /* ---------- Börja om ---------- */
  'Börja om': 'Start over',
  'Stänger allt och tömmer webbläsarens lagring':
    'Closes everything and clears the browser’s storage',
  'Rensa allt': 'Clear everything',
  Avbryt: 'Cancel',
  'Det här försvinner': 'This is what goes',
  'Räknar…': 'Counting…',
  'öppna filer': 'open files',
  ', tillsammans {0}': ', {0} altogether',
  'påbörjad sammanslagning — {0}': 'merge under way — {0}',
  ' med {0} beslut': ' with {0} decisions',
  'sparat i webbläsaren': 'saved in the browser',
  'webbläsaren säger inte hur mycket den sparat':
    'the browser does not say how much it has saved',
  'Det finns ingenting att rensa. Du kan börja om ändå — sidan laddas då bara om.':
    'There is nothing to clear. You can start over anyway — the page will simply reload.',
  'Sidan laddas om till sist. Det är det som gör att webbläsaren faktiskt lämnar tillbaka minnet; att bara stänga flikarna räcker inte, eftersom den själv bestämmer när den städar.':
    'The page reloads at the end. That is what makes the browser actually hand the memory back; closing the tabs alone is not enough, because it decides for itself when to clean up.',
  '{0} har ändringar som inte exporterats. De går inte att få tillbaka efteråt — exportera först om du vill behålla dem.':
    '{0} have changes that were never exported. There is no getting them back afterwards — export first if you want to keep them.',

  /* ---------- Ångra-stegens namn ---------- */
  /*
   * De sätts när steget görs och byter inte språk efteråt — historiken är en
   * logg, och en logg som skrivs om i efterhand är ingen logg. Se `edits.ts`.
   */
  'Ändrade {0}: ”{1}” → ”{2}”': 'Changed {0}: “{1}” → “{2}”',
  'Tömde {0}': 'Emptied {0}',
  'Satte {0} till ”{1}”': 'Set {0} to “{1}”',
  'Fyllde nedåt i {0}': 'Filled down in {0}',
  'Klistrade in {0}': 'Pasted {0}',
  'Tog bort {0}': 'Removed {0}',
  'Infogade {0}': 'Inserted {0}',
  'Dubblerade {0}': 'Duplicated {0}',
  'Lade till {0} med löpnummer': 'Added {0} with sequence numbers',
  '{0} i {1}': '{0} in {1}',
  '{0} — {1}': '{0} — {1}',
  'Ångra (Ctrl+Z)': 'Undo (Ctrl+Z)',
  'Gör om (Ctrl+Y)': 'Redo (Ctrl+Y)',

  /* ---------- Kvarglömt i skalet ---------- */
  '{0} i {1}…': '{0} in {1}…',
  'Beta av resten': 'Work through the rest',
  'En av filerna är stängd, så det finns inga rader att beta av.':
    'One of the files is closed, so there are no rows left to work through.',
  'En rad per grupp: summa Belopp per Ort, antal ordrar per kund. Resultatet blir en ny flik.':
    'One row per group: total Belopp per Ort, number of orders per customer. The result becomes a new tab.',
  'Filen laddades ner.': 'The file was downloaded.',
  'Kombinera…': 'Combine…',
  'Slå ihop…': 'Merge…',
  'Sätt ihop data ur flera filer — bredvid varandra, ovanpå varandra, eller in i en mall.':
    'Put data from several files together — side by side, stacked, or into a template.',
  'rader som hör ihop läggs sida vid sida, matchat på en nyckel':
    'rows that belong together are placed side by side, matched on a key',
  'filerna läggs på varandra, kolumner som betyder samma sak i samma spalt':
    'the files are stacked, columns that mean the same thing in the same place',
  'en fil med bara rubriker bestämmer formen, data hämtas ur de filer du väljer':
    'a headings-only file decides the shape, the data is taken from the files you pick',
  'Ljust eller mörkt läge': 'Light or dark mode',
  'Radens åtgärder': 'Row actions',
  'Skriv ut filen som Excel eller CSV.': 'Write the file out as Excel or CSV.',
  'Trimma blanksteg, ändra skiftläge och städa bort det osynliga i markeringen.':
    'Trim whitespace, change letter case and clear out the invisible in the selection.',
  Töm: 'Empty',
  'Verktyget öppnar CSV, TXT, TSV och Excel-filer (.xlsx).':
    'The tool opens CSV, TXT, TSV and Excel files (.xlsx).',
  'Visa alla igen': 'Show all again',
  'Webbläsaren tillät inte kopiering till urklipp.':
    'The browser did not allow copying to the clipboard.',

  'Läser {0}': 'Reading {0}',
  'Släpp för att öppna som ny flik': 'Drop to open as a new tab',


  /* ---------- Notiser som etapp 23 lämnade som mallsträngar ---------- */
  'Innehållet är identiskt med den redan öppna fliken ”{0}”.':
    'The content is identical to the already open tab “{0}”.',
  '{0} öppnad — {1} rader, {2} kolumner.': '{0} opened — {1} rows, {2} columns.',
  'Identisk med ”{0}”.': 'Identical to “{0}”.',
  '1 sak att titta på.': '1 thing to look at.',
  '{0} saker att titta på.': '{0} things to look at.',
  'Kunde inte öppna {0}: {1}': 'Could not open {0}: {1}',
  'Kolumnen ”{0}” togs bort.': 'The column “{0}” was deleted.',
  'Rader har lagts till eller tagits bort sedan sist, så verkstadens par pekade inte längre på rätt rader. De har kastats.':
    'Rows have been added or deleted since last time, so the workbench’s pairs no longer pointed at the right rows. They have been thrown away.',
  'Visar {0} rader där ”{1}” inte går att tolka.':
    'Showing {0} rows where “{1}” cannot be read.',
  '{0} kopierade. Klistra in direkt i Excel.': '{0} copied. Paste straight into Excel.',
  'Inga helt tomma rader hittades.': 'No completely empty rows were found.',
  'Tog bort {0} som var helt tomma.': 'Removed {0} that were completely empty.',
  'Inga helt tomma kolumner hittades.': 'No completely empty columns were found.',
  '{0}: inget att ändra i markeringen.': '{0}: nothing to change in the selection.',
  '{0} — {1} ändrades i {2}.': '{0} — {1} changed in {2}.',
  'Filtrera på ”{0}”': 'Filter on “{0}”',
  'Cellen är tom. Filtrera på kolumnen i stället.':
    'The cell is empty. Filter on the column instead.',
  'Sortera på {0}': 'Sort by {0}',
  'Gruppera på {0}…': 'Group by {0}…',
  'Behöll {0} och tog bort {1}.': 'Kept {0} and removed {1}.',
  'Tog bort {0}.': 'Removed {0}.',
  'Tog bort {0} som var dubbletter.': 'Removed {0} that were duplicates.',
  '{0} från förra besöket är tillbaka. Ångra-historiken börjar om.':
    '{0} from your last visit are back. The undo history starts over.',
  'En påbörjad sammanslagning {0} finns kvar med {1} beslut.':
    'A merge in progress, {0}, is still there with {1} decisions.',


  /* ---------- Etapp 25: app-raden, hörnet, redigeringsfältet ---------- */
  Redigering: 'Editing',
  Språk: 'Language',
  Inställningar: 'Settings',
  'Verktygsfält: som rad': 'Toolbar: as a row',
  'Verktygsfält: lodrätt': 'Toolbar: vertical',
  'Tema: följer systemet': 'Theme: follows the system',
  'Tema: ljust': 'Theme: light',
  'Tema: mörkt': 'Theme: dark',
  'Byt verktygsfältets placering': 'Move the toolbar',
  'Som rad under flikarna, eller lodrätt till vänster om kolumnerna.':
    'As a row under the tabs, or vertically to the left of the columns.',
  'Lägg till en rad sist': 'Add a row at the end',
  'Ingen påbörjad sammanslagning att gå tillbaka till.': 'No merge in progress to go back to.',
  'Filerna är stängda, så det finns inga rader att beta av. {0} beslut gick förlorade med dem — en fil som öppnas igen är en ny fil för verktyget, så besluten går inte att återansluta.':
    'The files are closed, so there are no rows left to work through. {0} decisions were lost with them — a file opened again is a new file to the tool, so the decisions cannot be reattached.',

}
