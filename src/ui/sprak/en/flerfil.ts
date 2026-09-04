/**
 * Flerfilsvyerna: Slå ihop, verkstaden, Kombinera, aliaskartan, jämförelsebänken och restlistan.
 *
 * Nyckeln är den svenska texten — se `sprak.ts`. En mening som saknas här
 * står kvar på svenska i gränssnittet.
 */
export const FLERFIL: Record<string, string> = {
  /* ---------- Restlistan ---------- */
  'filens ordning': 'the order of the file',
  'Inget kvar att beta av.': 'Nothing left to work through.',
  'Alla rader hittade en partner.': 'Every row found a partner.',
  saknades: 'was missing',
  tomt: 'empty',
  'tom nyckel': 'empty key',
  'flera träffar': 'several matches',
  'Skriv av raden — den försvinner ur listan, men resultatet blir detsamma':
    'Write the row off — it disappears from the list, but the result stays the same',
  'Skriv av rad {0}': 'Write off row {0}',
  'Visar {0} av {1}. Kör en ny runda på en annan kolumn för att korta listan.':
    'Showing {0} of {1}. Run another round on a different column to shorten the list.',
  '{0} avskrivna': '{0} written off',


  /* ---------- Förslagslistan (luddig likhet) ---------- */
  'Luddig likhet är avstängd för talkolumner. 10021 och 10024 liknar varandra som text, men är olika kunder — och ett förslag som ser rimligt ut är farligare än inget förslag.':
    'Fuzzy similarity is switched off for number columns. 10021 and 10024 look alike as text, but they are different customers — and a suggestion that looks reasonable is more dangerous than no suggestion.',
  'Restlistorna har {0} och {1} rader. Verkstaden är gjord för tiotal eller hundratal — så många rader betyder nästan alltid att grundmatchningen behöver ett annat kolumnpar först.':
    'The leftover lists hold {0} and {1} rows. The workbench is made for tens or hundreds — that many rows nearly always means the base matching needs a different column pair first.',
  'Värdena i de här kolumnerna är för korta för att jämföras luddigt. Tre tecken som liknar varandra är brus.':
    'The values in these columns are too short to compare fuzzily. Three characters that resemble each other are noise.',
  'Inga rader liknar varandra tillräckligt. Prova en annan kolumn.':
    'No rows resemble each other closely enough. Try a different column.',
  'Liknande rader ({0})': 'Similar rows ({0})',
  'Raderna är varandras bästa träff': 'The rows are each other’s best match',
  'bästa åt båda håll': 'best both ways',
  'Dice över teckentrigram': 'Dice over character trigrams',
  'stavning {0}': 'spelling {0}',
  'Dice över ordmängderna — fångar omkastad ordföljd':
    'Dice over the word sets — catches a swapped word order',
  'orden {0}': 'words {0}',
  Godkänn: 'Accept',
  Nej: 'No',
  'Listan kortades av vid taket. Kör en runda på en annan kolumn för att korta ner den först.':
    'The list was cut off at the cap. Run a round on a different column to shorten it first.',
  'rad {0}': 'row {0}',


  /* ---------- Jämförelsebänken ---------- */
  'Markera en rad i någon av listorna, så visas dess fält här. Med en rad vald i vardera listan ställs de mot varandra.':
    'Select a row in either list and its fields show up here. With a row selected in each list, they are put side by side.',
  'ingen rad vald': 'no row selected',
  nyckel: 'key',
  gissad: 'guessed',
  'Kopplad på rubriknamnet, inte av matchningen.':
    'Linked on the heading name, not by the matching.',
  'tom nyckel — kan aldrig matcha': 'empty key — can never match',
  'skiljer sig': 'differ',
  vänsterfilen: 'the left file',
  högerfilen: 'the right file',
  'Klicka för att rätta värdet i källfilen': 'Click to correct the value in the source file',


  /* ---------- Aliaskartan ---------- */
  Målkolumn: 'Target column',
  'Värde för de filer som inte ger något.': 'Value for the files that give nothing.',
  Standard: 'Default',
  Med: 'In',
  'Namn på målkolumn {0}': 'Name of target column {0}',
  'Samma spalt som en annan målkolumn: {0}': 'Same column as another target column: {0}',
  'Samma spalt som…': 'Same column as…',
  't.ex. {0}': 'e.g. {0}',
  'Dela upp {0} igen': 'Split {0} apart again',
  'Dela upp igen': 'Split apart again',
  'finns i {0} av {1}': 'present in {0} of {1}',
  '{0} rader blir tomma': '{0} rows come out empty',
  '{0} rader fylls med {1}': '{0} rows are filled with {1}',
  'Blir tom i hela resultatet': 'Comes out empty in the whole result',
  'alla tomma': 'all empty',
  'Standardvärde för {0}': 'Default value for {0}',
  'Fyller bara de filer som inte ger något. Celler som finns men är tomma rörs inte.':
    'Only fills the files that give nothing. Cells that exist but are empty are left alone.',
  'Alla filer ger något — inget att fylla i.': 'Every file gives something — nothing to fill in.',
  'Ta med': 'Include',
  'Ta med {0}': 'Include {0}',
  'Hoppa över': 'Skip',
  'Fråga igen om {0}': 'Ask again about {0}',
  'Fråga igen': 'Ask again',
  'Målkolumn som hör till samma spalt': 'Target column that belongs in the same column',
  'Samma spalt': 'Same column',
  'fil har': 'file has',
  'filer har': 'files have',
  '{0} {1} båda kolumnerna. Där ryms bara en, så resten står kvar som en egen rad att besluta om.':
    '{0} {1} both columns. Only one fits there, so the rest stay as a row of their own to decide on.',
  raden: 'the row',
  'Värdena flyttas hit och {0} tas bort.': 'The values move here and {0} is removed.',


  /* ---------- Verkstaden ---------- */
  Matchningsverkstaden: 'The matching workbench',
  'av {0} rader i {1} har en partner': 'of the {0} rows in {1} have a partner',
  'kvar att titta på': 'left to look at',
  'matchar flera rader och får därför inga värden':
    'match several rows and therefore get no values',
  'matchar flera rader — regeln valde åt dig': 'match several rows — the rule chose for you',
  'par gjorda här': 'pairs made here',
  'avskrivna — de följer med i resultatet precis som förut':
    'written off — they come along in the result exactly as before',
  'En kolumn som matchningen bygger på finns inte längre. Varje rad ser därför ut att sakna partner. Stäng verkstaden och ställ in matchningen på nytt.':
    'A column the matching is built on no longer exists. Every row therefore looks like it has no partner. Close the workbench and set the matching up again.',
  'Kvar i stommen (vänsterfilen)': 'Left in the base (the left file)',
  'Kvar i högerfilen': 'Left in the right file',
  Arbetsbänk: 'Workbench',
  'Raden matchar redan flera rader och behöver ett val bland sina träffar — ett par till hade gjort den mer tvetydig, inte mindre.':
    'The row already matches several rows and needs a choice among its matches — one more pair would have made it more ambiguous, not less.',
  'Markera en rad i varje lista först.': 'Select a row in each list first.',
  'Para ihop': 'Pair up',
  '{0} % lika': '{0} % alike',
  'för hand': 'by hand',
  'runda {0}': 'round {0}',
  'Par gjorda här': 'Pairs made here',
  'Ta bort paret': 'Remove the pair',
  'Skriv av allt som är kvar': 'Write off everything that is left',
  'Att skriva av en rad tar bort den ur listan — inget annat. Rader ur {0} utan partner följer ändå med i resultatet, med tomma celler.':
    'Writing a row off removes it from the list — nothing else. Rows from {0} without a partner still come along in the result, with empty cells.',
  'Rader ur {0} utan partner följer också med, sist i resultatet — utom de du skrivit av.':
    'Rows from {0} without a partner also come along, last in the result — except the ones you wrote off.',
  'Rader ur {0} utan partner blir kvar i sin egen flik.':
    'Rows from {0} without a partner stay in their own tab.',
  'Omgång {0} ligger i en egen flik. En ny körning skapar en till — den gamla rörs aldrig.':
    'Round {0} sits in a tab of its own. A new run creates another — the old one is never touched.',
  'Arbetet ligger kvar när du stänger. Du hittar tillbaka under Flera filer.':
    'The work stays when you close. You find your way back under Several files.',
  'Skriver de kvarvarande raderna ur vardera filen som var sin CSV.':
    'Writes the remaining rows from each file as a CSV of its own.',
  'Exportera restlistorna': 'Export the leftover lists',
  'Paren, avvisningarna och avskrivningarna finns bara här och går inte att ångra.':
    'The pairs, rejections and write-offs exist only here and cannot be undone.',
  'Kasta arbetet i verkstaden? {0} beslut försvinner.':
    'Throw away the work in the workbench? {0} decisions disappear.',
  'Kasta arbetet': 'Throw the work away',
  'Slå ihop igen': 'Merge again',
  ' — kvar': ' — leftovers',
  'Nytt försök på en annan kolumn': 'Another try on a different column',
  'Kolumn i vänsterfilen': 'Column in the left file',
  'Kolumn i högerfilen': 'Column in the right file',
  'Så här jämförs värdena': 'How the values are compared',
  Luddig: 'Fuzzy',
  'Letar efter rader som liknar varandra. Ger förslag att godkänna, inte färdiga par — en gissning som ser rimlig ut är farligare än ingen gissning.':
    'Looks for rows that resemble each other. Gives suggestions to accept, not finished pairs — a guess that looks reasonable is more dangerous than no guess.',
  'Visa liknande rader': 'Show similar rows',
  'Kör runda': 'Run a round',
  '({0} körda)': '({0} run)',
  'inga kolumnpar': 'no column pairs',


  /* ---------- Slå ihop filer ---------- */
  'Slå ihop filer': 'Merge files',
  'Öppna filen du vill slå ihop med': 'Open the file you want to merge with',
  'Öppna de två filer du vill slå ihop': 'Open the two files you want to merge',
  '{0} är redan öppen. Släpp den andra här, eller välj den nedan — den blir en egen flik.':
    '{0} is already open. Drop the other one here, or choose it below — it becomes a tab of its own.',
  'Släpp dem här, eller välj dem nedan. Varje fil blir en egen flik.':
    'Drop them here, or choose them below. Each file becomes a tab of its own.',
  'Filerna blir egna flikar och rörs inte av det här.':
    'The files become tabs of their own and are not touched by this.',
  'Stommen — den står först i resultatet': 'The base — it comes first in the result',
  'Stommen — alla rader följer med': 'The base — every row comes along',
  'Byt håll: den andra filen blir stommen.': 'Swap sides: the other file becomes the base.',
  '⇄ Byt håll': '⇄ Swap sides',
  'Hämta uppgifter ur': 'Take details from',
  '{0} av {1} rader hittar en träff ({2} %)': '{0} of {1} rows find a match ({2} %)',
  '{0} hittar ingen': '{0} find none',
  'kommer med bara från {0}': 'come along from {0} only',
  'blir över i {0}': 'are left over in {0}',
  '{0} matchar flera (som mest {1})': '{0} match several (at most {1})',
  '{0} används av flera': '{0} are used by several',
  '{0} har tom nyckel och kan aldrig matcha': '{0} have an empty key and can never match',
  'Resultatet får {0} rader': 'The result gets {0} rows',
  'Rader hör ihop när de stämmer i': 'Rows belong together when they match in',
  'Vänsterkolumn i par {0}': 'Left column in pair {0}',
  'Högerkolumn i par {0}': 'Right column in pair {0}',
  'Ta bort kolumnparet': 'Remove the column pair',
  och: 'and',
  'Andra högerkolumnen': 'The second right column',
  'Välj kolumn…': 'Choose column…',
  'Jämförelse i par {0}': 'Comparison in pair {0}',
  'Inget kolumnpar hittar en enda gemensam rad. Alla kombinationer är provade, med tre jämförelser: vanlig, utan å ä ö och bara siffror.':
    'No column pair finds a single row in common. Every combination has been tried, with three comparisons: plain, without å ä ö, and digits only.',
  'Inga kolumnpar valda. Lägg till minst ett för att kunna matcha.':
    'No column pairs chosen. Add at least one to be able to match.',
  '＋ Lägg till kolumnpar': '＋ Add column pair',
  'Föreslaget efter att alla kolumnpar provats mot varandra: det här ger flest träffar ({0} av {1}). Ändra fritt.':
    'Suggested after trying every column pair against the others: this one gives the most matches ({0} of {1}). Change it freely.',
  'Föreslaget utifrån kolumnernas namn. Filerna har för många kolumner för att hinna prova alla par mot varandra, så siffrorna fick inte vara med och bestämma.':
    'Suggested from the column names. The files have too many columns to try every pair against the others in time, so the numbers did not get a say.',
  'Föreslaget utifrån kolumnernas namn, och det är också paret som matchar bäst{0}. Ändra fritt.':
    'Suggested from the column names, and it is also the pair that matches best{0}. Change it freely.',
  '({0} träffar)': '({0} matches)',
  'Ett kolumnpar saknar sin andra högerkolumn': 'One column pair is missing its second right column',
  '{0} kolumnpar saknar sin andra högerkolumn':
    '{0} column pairs are missing their second right column',
  '. Matchningen kan inte köras förrän den är vald — utan den finns ingen nyckel att jämföra med.':
    '. The matching cannot run until it is chosen — without it there is no key to compare with.',
  'Inte en enda rad matchar.': 'Not a single row matches.',
  '{0} Antingen är det fel kolumnpar, eller så är värdena skrivna på olika sätt i de två filerna — prova en annan jämförelse, eller städa kolumnerna först.':
    '{0} Either it is the wrong column pair, or the values are written differently in the two files — try another comparison, or clean up the columns first.',
  'Verktyget hittade andra par som ger träffar; klicka ＋ Lägg till kolumnpar för att prova nästa.':
    'The tool found other pairs that do give matches; click ＋ Add column pair to try the next one.',
  'Bara {0} % av raderna matchar. Så låg andel beror oftast på fel kolumnpar eller på att värdena är skrivna på olika sätt — prova en annan jämförelse, eller städa kolumnerna först.':
    'Only {0} % of the rows match. A share that low usually comes down to the wrong column pair, or to values written in different ways — try another comparison, or clean up the columns first.',
  'När en rad matchar flera ({0} gör det)': 'When a row matches several ({0} do)',
  'Vilka rader som kommer med': 'Which rows come along',
  stommens: 'the base’s',
  '{0} ur {1} följer med sist, med tomma celler i {2} kolumner.':
    '{0} from {1} come along last, with empty cells in {2} columns.',
  '{0} ur {1} hittar ingen kund och kommer inte med.':
    '{0} from {1} find no customer and do not come along.',
  'Kolumner att hämta': 'Columns to take',
  'den andra filen': 'the other file',
  'Nyckelkolumnen följer med automatiskt — annars går raderna som bara finns i {0} inte att känna igen.':
    'The key column comes along automatically — otherwise the rows that exist only in {0} cannot be recognised.',
  ' — matchningsnyckel': ' — matching key',
  'Namnprefix på de hämtade kolumnerna': 'Name prefix on the columns taken',
  't.ex. {0} – ': 'e.g. {0} – ',
  'Resultatet blir en ny flik. Källfilerna rörs inte.':
    'The result becomes a new tab. The source files are not touched.',
  '{0} rader hittar ingen partner, men kommer med.':
    '{0} rows find no partner, but come along anyway.',
  '{0} rader hittar ingen partner.': '{0} rows find no partner.',
  '{0} matchar flera och behöver ett val.': '{0} match several and need a choice.',
  'Välj minst ett kolumnpar först.': 'Choose at least one column pair first.',
  'Ingen rad blev över och ingen matchar flera — det finns inget att beta av.':
    'No row was left over and none match several — there is nothing to work through.',
  'Gå igenom raderna som inte matchade, och de som matchar flera, innan filerna slås ihop.':
    'Go through the rows that did not match, and the ones that match several, before the files are merged.',
  'Välj minst ett kolumnpar att matcha på.': 'Choose at least one column pair to match on.',
  'Inga rader matchar med de här kolumnerna.': 'No rows match with these columns.',
  '{0} av {1}, valda ur hela filen': '{0} of {1}, picked from the whole file',
  'Så här paras de': 'How they pair up',
  'Välj ett kolumnpar, så visas de första paren här.':
    'Choose a column pair and the first pairs show up here.',
  '✕ ingen partner': '✕ no partner',
  '+{0} till': '+{0} more',
  '✕ ingen rad i {0}': '✕ no row in {0}',
  'Så här blir resultatet': 'How the result turns out',
  'Välj ett kolumnpar, så visas resultatet här.':
    'Choose a column pair and the result shows up here.',
  'Raden hittade ingen partner': 'The row found no partner',
  'Raden finns bara i den andra filen': 'The row exists only in the other file',
  'Öppna exempelparet': 'Open the example pair',

  'Slå ihop': 'Merge',
  'Beta av resten…': 'Work through the rest…',
  '{0} av {1}': '{0} of {1}',


  /* ---------- Kombinera filer ---------- */
  'Kombinera filer': 'Combine files',
  Kombinera: 'Combine',
  'Fyller {0} med data ur de valda filerna.': 'Fills {0} with data from the chosen files.',
  'Lägger filerna på varandra. Kolumner som betyder samma sak hamnar i samma spalt.':
    'Stacks the files. Columns that mean the same thing end up in the same place.',
  '{0} rader ur {1} filer': '{0} rows from {1} files',
  '{0} kolumner i resultatet': '{0} columns in the result',
  '{0} väntar på beslut': '{0} are waiting for a decision',
  '{0} blir tomma': '{0} come out empty',
  'Filer att hämta data ur': 'Files to take data from',
  'Filer att stapla': 'Files to stack',
  Målform: 'Target shape',
  'Filernas egna kolumner': 'The files’ own columns',
  '{0} som mall': '{0} as the template',
  'Öppna mallfil…': 'Open template file…',
  Exempelmall: 'Example template',
  'Mallens {0} är exempel och tas inte med i resultatet.':
    'The template’s {0} are examples and are not carried into the result.',
  'Mallen bestämmer kolumnerna, deras namn och deras ordning.':
    'The template decides the columns, their names and their order.',
  'En mall är en fil med bara rubriker. Den bestämmer resultatets form.':
    'A template is a file with headings only. It decides the shape of the result.',
  mall: 'template',
  '{0} visas': '{0} shown',
  'Rader att ta med': 'Rows to include',
  'Hela filen, i den ordning du sorterat den.': 'The whole file, in the order you sorted it.',
  'Bara de som visas nu': 'Only the ones shown now',
  'Följer filtret och sorteringen i varje flik.':
    'Follows the filter and the sorting in each tab.',
  'Kolumn med källfilens namn': 'Column with the source file’s name',
  'Radnumret börjar om för varje fil, så utan den går rad 12 ur två filer inte att skilja åt.':
    'The row number starts over for each file, so without it row 12 from two files cannot be told apart.',
  'Så här kopplas kolumnerna': 'How the columns are linked',
  '{0} finns bara i vissa av filerna. Tas de med blir de tomma för de andra; hoppas de över försvinner värden som fanns. Båda kan vara rätt — därför frågar verktyget i stället för att gissa.':
    '{0} exist in only some of the files. Included, they come out empty for the others; skipped, values that were there disappear. Either can be right — so the tool asks instead of guessing.',
  'Ta med alla': 'Include all',
  'Hoppa över alla': 'Skip all',
  'Välj minst en fil att stapla.': 'Choose at least one file to stack.',
  'Så här börjar resultatet': 'How the result begins',
  'Välj minst en fil, så visas resultatet här.':
    'Choose at least one file and the result shows up here.',
  'Inga kolumner är med i resultatet.': 'No columns are included in the result.',
  '{0} behöver ett beslut.': '{0} need a decision.',
  'Besluta om kolumnerna som bara finns i vissa filer först.':
    'Decide on the columns that exist in only some files first.',
  'ej beslutad': 'not decided',
  'Stod inte i filen': 'Was not in the file',

  '{0} ur {1}': '{0} from {1}',


  /* ---------- Kärnans matchningstabeller (`core/ops/match.ts`) ---------- */
  /*
   * Ritas av den delade `Val`-komponenten och av vyernas egna listor. Värdena
   * i Träff-kolumnen står *inte* här: de blir celler i resultatet och är
   * alltså data, inte etiketter.
   */
  Vanlig: 'Plain',
  'Struntar i versaler och extra blanksteg. Passar de flesta textkolumner.':
    'Ignores capitals and extra whitespace. Fits most text columns.',
  Teckenexakt: 'Character-exact',
  'Varje tecken måste stämma. Använd för id-kolumner där skiftläget betyder något.':
    'Every character has to match. Use it for id columns where the case means something.',
  'Utan å ä ö': 'Without å ä ö',
  'Struntar också i prickarna. Öberg matchar Oberg — men även För matchar For.':
    'Ignores the dots as well. Öberg matches Oberg — but För matches For too.',
  'Bara siffror': 'Digits only',
  'Allt utom siffror skalas bort. Passar telefonnummer och organisationsnummer.':
    'Everything but digits is stripped away. Fits phone numbers and company numbers.',
  'Ta den första': 'Take the first',
  'Första träffen i den andra filens ordning. Resten ignoreras.':
    'The first match in the other file’s order. The rest are ignored.',
  'En rad per träff': 'One row per match',
  'Raden upprepas, en gång för varje träff. Filen blir längre.':
    'The row is repeated, once per match. The file gets longer.',
  'Lämna tom': 'Leave empty',
  'Osäkra rader lämnas ofyllda och hamnar i restlistan för granskning.':
    'Uncertain rows are left unfilled and end up in the leftover list for review.',
  'Bara stommens rader': 'The base’s rows only',
  'Alla rader ur stommen följer med. Rader som bara finns i den andra filen hamnar i restlistan.':
    'Every row from the base comes along. Rows that exist only in the other file end up in the leftover list.',
  'Alla rader ur båda filerna': 'All rows from both files',
  'Ingenting faller bort. Rader som bara finns i den ena filen får tomma celler i den andras kolumner.':
    'Nothing is dropped. Rows that exist in only one file get empty cells in the other one’s columns.',

}
