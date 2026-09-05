/**
 * Användarguidens innehåll, på engelska.
 *
 * Samma text som `docs/USER-GUIDE.md`, men strukturerad: guiden vet
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
 * `docs/bilder/en/`. Lägger du till ett avsnitt här ska det också finnas i
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
 *   img     — filnamn i docs/bilder/en/, cap är dess bildtext
 *   imgWidth — maxbredd i pixlar för smala bilder; utan den blir en liten
 *             dialogruta uppblåst till hela spaltbredden och ser suddig ut
 */
window.GUIDE_EN = {
  lang: 'en',
  title: 'User guide',
  tagline: 'CSV-verkstan, one tool at a time. Each section says what the tool does, how to run it and what is worth knowing — nothing more.',
  facts: [
    { k: 'Nothing leaves your computer', v: 'The file is opened in the browser and stays there. The page is not even allowed to make a network request.' },
    { k: 'Nothing changes quietly', v: 'Every tool shows counts and examples before it runs, and Ctrl+Z brings it back.' }
  ],
  ui: {
    search: 'Search the guide…',
    noHits: 'No matches',
    contents: 'Contents',
    steps: 'How to',
    notes: 'Worth knowing',
    top: 'Back to top',
    close: 'Close',
    zoom: 'Click to enlarge',
    prev: 'Previous',
    next: 'Next',
    inThisSection: 'In this section'
  },
  groups: [
    {
      id: 'kom-igang', t: 'Getting started', sub: 'Your first file, and what you are looking at',
      sections: [
        {
          id: 'oppna-forsta', t: 'Open your first file', img: 'tomt-lage.png',
          cap: 'The empty state: drop a file anywhere, or open the example file.',
          lead: 'Drop a file anywhere in the window, or click **Choose file…**. To just try it out, there is **Open example file** — sixteen rows of deliberately messy Swedish data, so every tool has something to bite into.',
          notes: [
            'Opens CSV, TXT, TSV and Excel (`.xlsx`). Several files at once become several tabs.',
            'No file is uploaded anywhere. All the work happens in your browser.'
          ]
        },
        {
          id: 'skarmen', t: 'What the screen looks like', img: 'oversikt-app.png',
          cap: 'The whole window with the example file open.',
          lead: 'Six areas, and they are always in the same place.',
          legend: [
            { t: 'The app row', d: 'The file’s errands: open, profiles, export. On the far right: language, light/dark mode and the settings gear.' },
            { t: 'The tab bar', d: 'One tab per open file.' },
            { t: 'The editing toolbar', d: 'Undo and redo, then what changes the view (sort, filter, duplicates), then what creates data (clean, summarise, pivot, multiple files).' },
            { t: 'The column list', d: 'On the left: search, hide and drag columns around.' },
            { t: 'The table and the panel', d: 'The table in the middle, the panel on the right — the inspector, or whichever tool you opened.' },
            { t: 'The status bar', d: 'At the bottom: row count, sorting, and a quick sum for the selection.' }
          ]
        }
      ]
    },
    {
      id: 'oppna-exportera', t: 'Opening and exporting', sub: 'Into the workshop and back out',
      sections: [
        {
          id: 'oppna-en-fil', t: 'Open a file', img: 'import.png',
          cap: 'The import dialog with the guessed encoding and delimiter.',
          steps: [
            'Drop the file in the window, or click **Open** in the app row.',
            'The dialog shows its guess at encoding and delimiter, with a preview. Change it if the guess is wrong.',
            'Click **Open the file**.'
          ],
          notes: [
            'If the file contains Swedish characters, the dialog says outright whether they look right. If they don’t, try another encoding.',
            'Broken rows, duplicate headers and Excel’s `sep=;` line are reported rather than disappearing quietly.',
            'An Excel workbook with several sheets lets you pick a sheet. Dates become `YYYY-MM-DD` and numbers get the decimal mark you choose.'
          ]
        },
        {
          id: 'exportera', t: 'Export', img: 'export.png',
          cap: 'The export dialog with format and row selection.',
          steps: [
            '**Export** in the app row, or `Ctrl+S`.',
            'Pick a format: **Excel file (.xlsx)**, **CSV, Excel-friendly**, **CSV, comma + UTF-8** or **CSV, custom**.',
            'Choose whether **all rows** or only the ones shown come along, and whether hidden columns follow.',
            'Click **Export**.'
          ],
          notes: [
            'Excel is the default: it is the only format that both keeps `01234` as `01234` and writes number columns as real numbers, so `SUM` works.',
            '**CSV, custom** lets you set delimiter, encoding, BOM and line ending separately.'
          ]
        },
        {
          id: 'klistra-in', t: 'Paste as a new file',
          lead: 'If you copied a whole table from somewhere else, `Ctrl+Shift+V` opens it as a tab of its own instead of writing it into the table you are standing in.',
          notes: [
            '`Ctrl+C` copies the selection as TSV, which is what Excel understands. `Ctrl+V` pastes TSV or CSV.',
            'If what you pasted is bigger than the selection, the tool asks whether to make room, cut it off, or open it as its own file. It never cuts off silently.'
          ]
        }
      ]
    },
    {
      id: 'tabellen', t: 'The table', sub: 'Order, weed out and find',
      sections: [
        {
          id: 'sortera', t: 'Sort', img: 'sortera.png',
          cap: 'The sorting panel with two levels.',
          lead: 'Multi-level sorting with Swedish collation: `Öberg` after `Zetterlund`, and `Kund 2` before `Kund 10`.',
          steps: [
            'Click the arrow in a column header. Shift-click in the next header to add another level.',
            'Or open **Sort** in the editing toolbar and build the list there — levels can be dragged into order.'
          ],
          notes: [
            'Number columns sort numerically and date columns as dates, however they happen to be written. Empty cells always come last, in both directions.',
            'If you fix a cell after sorting, the row stays put under the cursor. The status bar offers **Sort again** when you are done.'
          ]
        },
        {
          id: 'filter', t: 'Filter', img: 'filter.png',
          cap: 'The filter panel with a rule on Ort.',
          lead: 'A filter is a list of rules. Each rule can be switched off without being deleted.',
          steps: [
            '**Filter** in the editing toolbar → **＋ Add rule**.',
            'Pick column, operator and value. The rules show as chips above the table.',
            'Choose whether **all rules match** or whether **some rule matches** is enough.'
          ],
          notes: [
            'The operators follow the column’s type: comparisons and `between` exist only on numbers and dates.',
            '**Show the rows the filter hides instead** inverts the selection — the easiest way to notice you filtered out the wrong things.',
            'When the selection is right, **keep only the ones being shown** or **remove the ones being shown** makes it permanent. Both can be undone.',
            'An empty cell only matches `is empty`. It is not “not Malmö”, it is unknown.'
          ]
        },
        {
          id: 'dubbletter', t: 'Duplicates', img: 'dubbletter.png',
          cap: 'The duplicates panel keyed on Namn and E-post.',
          lead: 'Finds rows alike in the columns you choose — almost always what you want, since two records about the same person tend to differ on a sequence number or a date.',
          steps: [
            '**Duplicates** in the editing toolbar.',
            'Tick the columns that decide what counts as the same row.',
            'The panel says how many groups were found and how many rows a cleanup would remove — before you run it.',
            'Choose which row stays, and remove.'
          ],
          notes: [
            '**Ignore** UPPERCASE, extra whitespace and å ä ö in the comparison when spellings vary.',
            'Removal keeps the first or the last row **in the file’s order**, not in the one you happen to be looking at.',
            'If the rows differ in other columns, choose **The one I pick** and ring the row that should stay, group by group.'
          ]
        },
        {
          id: 'sok', t: 'Search', img: 'sok.png',
          cap: 'The search bar with a hit counter.',
          lead: '`Ctrl+F` searches accent-insensitively: `oberg` finds `Öberg`. Hits are highlighted and counted.'
        },
        {
          id: 'angra', t: 'Undo and redo',
          lead: '`Ctrl+Z` undoes, `Ctrl+Y` redoes — on everything. The column panel has a step list you can rewind to any point in.',
          notes: ['A tool run across several columns is undone as a single step.']
        }
      ]
    },
    {
      id: 'stada', t: 'Cleaning and rewriting', sub: 'Nine tools that rewrite values',
      intro: 'The eight panel tools live in the **column menu** (click `⋮` in the header, or right-click), in the **cell menu** and in the command palette. The menu puts the tools that suit the column’s content at the top, with the reason spelled out; the rest sit under **More tools**.',
      introNotes: [
        'All the panels work the same way: they sit **beside** the table, draw the proposal in your own cells while you set it up, and change nothing until you click **Apply**.',
        '`Only changed` and `Only problems` filter out exactly those rows. `Ctrl+Z` brings it back.',
        'Dates, numbers, phone numbers and find & replace run across **the whole selection**: select twelve month columns, right-click, and run once.'
      ],
      sections: [
        {
          id: 'snabbstadning', t: 'Quick text cleanups', img: 'stada-meny.png', imgWidth: 520,
          cap: 'The clean menu with the six text actions.',
          lead: 'Six actions without a panel, straight onto the selection. **Clean ▾** in the editing toolbar.',
          table: {
            head: ['Action', 'Does'],
            rows: [
              ['Trim whitespace', 'Removes spaces at the start and end'],
              ['Collapse double spaces', 'Several spaces become one'],
              ['Remove invisible characters', 'Zero-width characters, non-breaking spaces, decomposed letters'],
              ['UPPERCASE · lowercase · Capital First Letter', 'Changes case — Anna-Lena and O’Brien survive']
            ]
          },
          notes: ['The same menu holds **Delete completely empty rows** and **Delete completely empty columns**.']
        },
        {
          id: 'datum', t: 'Dates', img: 'datum.png',
          cap: 'The date tool lists the formats the column actually contains, with counts and examples from your file.',
          lead: 'Rewrites mixed date formats into a single one.',
          steps: [
            'Column menu → **Dates…**',
            'The panel lists the formats the column actually contains, with counts and examples from your file.',
            'Pick **Rewrite as**, e.g. `YYYY-MM-DD`. The table shows `before → after` straight away.',
            'Click **Apply**.'
          ],
          before: { label: 'Mixed in the file', items: ['2026-08-27', '27/8 2026', '27 aug 2026', '45231'] },
          after: { label: 'After Apply', items: ['2026-08-27', '2026-08-27', '2026-08-27', '2026-08-27'] },
          notes: [
            '`03/04/2026` could be 3 April or 4 March. The tool looks for evidence in the column first and only asks when there is none.',
            'Excel dates still sitting there as serial numbers (`45231`) are only read as dates if you tick the box.',
            'Tick **Put the result in a new column** to keep both `2026-08-27 12:55` and `2026-08-27`.',
            'Rows that cannot be read can be left as they are, written `INVALID`, or emptied — your choice.'
          ]
        },
        {
          id: 'tal', t: 'Numbers', img: 'tal.png',
          cap: 'The number tool strips currency, percent signs and thousands separators.',
          lead: 'Turns text that looks like numbers into real numbers.',
          steps: [
            'Column menu → **Numbers…**',
            'Pick **decimal comma** or **decimal point**, and how many decimals.',
            'Click **Apply**.'
          ],
          before: { label: 'Text in the file', items: ['1 240,50 kr', '(1 240,50)', '1240–', '12 %'] },
          after: { label: 'Real numbers', items: ['1240,50', '−1240,50', '−1240,00', '12,00'] },
          notes: [
            'Strips `kr`, `%` and thousands separators, and reads accounting’s `(1 240,50)` and `1240–` as negative numbers.',
            'The point’s ambiguity is handled like the dates’: is `1.234` a decimal or a thousand? Evidence first, question second.',
            'The column is typed as a number, so sorting goes the numeric route and the Excel export writes real numbers.'
          ]
        },
        {
          id: 'telefon', t: 'Phone numbers', img: 'telefon.png',
          cap: 'The phone tool normalises numbers so they can be compared across files.',
          lead: 'Normalises phone numbers so they can be compared across files.',
          steps: [
            'Column menu → **Phone numbers…**',
            'Choose which country numbers without a country code belong to.',
            'Pick `+46701234567` or `0701234567`, and click **Apply**.'
          ],
          before: { label: 'As written', items: ['070-123 45 67', '0046 70 1234567', '+46 (0)70 123 45 67'] },
          after: { label: 'Normalised', items: ['+46701234567', '+46701234567', '+46701234567'] },
          notes: ['No pretty grouping with spaces — the area code’s length varies, and a guess that gets it wrong looks plausible.']
        },
        {
          id: 'epost', t: 'Email to name', img: 'epost.png',
          cap: 'The email tool pulls name and domain parts out as new columns.',
          lead: 'Pulls name and domain parts out of an address, as **new** columns beside it.',
          steps: [
            'Column menu → **Email → name…**',
            'Choose what you want under **Take out**: first name, last name, both as separate columns, `First Last`, domain, domain without the top level, or the top-level domain.',
            'Click **Create the column**.'
          ],
          notes: [
            'Role accounts like `info@` do not become people.',
            'Å, ä and ö cannot be recovered from an address. The panel says so plainly.'
          ]
        },
        {
          id: 'dela', t: 'Split a column', img: 'dela.png',
          cap: 'The new columns are drawn as ghost columns with a dashed border before they are created.',
          lead: 'Splits one column into several new ones.',
          steps: [
            'Column menu → **Split the column…**',
            'Choose where the split happens: **at every**, **at the first**, **at the last** occurrence of a character, or **after a number of characters**.',
            'Pick the character and the number of new columns, and click **Create 2 columns**.'
          ],
          notes: [
            '**At the last** space keeps double first names together: `Anna Karlsson` and `Carl-Johan Nilsson` both split correctly.',
            'Whatever does not fit lands in the last column instead of disappearing. The panel warns when that happens.',
            '**By a pattern** is the fifth way, and it is the template in reverse: write the value the way it looks and put braces around what you want out. The text in between is the separators, and every pair of braces becomes a column with its own name.',
            'That the trailing text must sit at the end is what strips `<>` for free — no regular expression needed. Separators inside are searched from the left, exactly like **At the first**.',
            'A value that does not match the pattern gets empty cells and is counted as a problem. **Only unmatched** filters those out, and the source column is left untouched, so nothing is lost.'
          ],
          before: { t: 'The value', items: ['last1 first1 <last1.first1@exempel.com>'] },
          after: { t: 'The pattern {Namn} <{E-post}> gives', items: ['Namn: last1 first1 · E-post: last1.first1@exempel.com'] }
        },
        {
          id: 'dela-till-rader', t: 'Split into rows',
          lead: 'Splits a column downwards instead of sideways: **one row per part**. Addresses copied out of Outlook sit as `a <x@y>; b <z@w>; c <q@r>` in a single cell, and they are not three fields on one person — they are three people.',
          steps: [
            'Column menu → **Split into rows…**',
            'Choose the character to split at.',
            'Click **Create a new tab with 48 rows**. The number is on the button.'
          ],
          notes: [
            'The result becomes a **new tab**. The original tab is left alone, and the other columns\' values come along down onto the new rows.',
            'The split goes on **what you see**: if you have filtered, those are the rows that get split, and the panel says so.',
            'A cell with no separator gives one unchanged row. No row disappears because a cell was empty.',
            'If you paste the list as its own file, the import guesses semicolon — right for a CSV, wrong for an address list where the semicolons separate *people* and not *fields*. Choose **Pipe** in the import dialog and the row stays whole. That is the only place the choice can be made: afterwards it is already split.',
            'The other direction is **Group and summarise** with the *list* calculation. It caps at fifty values and writes out how many more there were, so a truncated list never looks complete.'
          ]
        },
        {
          id: 'slaihop-kolumner', t: 'Build column from template', img: 'slaihop-kolumner.png',
          cap: 'The template tool builds a new column from a template, with exceptions for the first and last rows.',
          lead: 'Builds a new column from a template. Two things in one: the template merges columns, and it wraps each value in a structure. Everything outside the braces comes along as written, so the template builds a line of SQL just as readily as a full name.',
          steps: [
            'Column menu → **Build column from template…**',
            'Write the template, e.g. `{Förnamn} {Efternamn}` or `(\'{Namn}\'),`. **Add column** inserts a name for you.',
            'If the last row needs to look different — a SQL list has no comma there — tick **The last row should look different** and change only the ending.',
            'Click **Create the column**.'
          ],
          notes: [
            'Column names that do not exist are reported as an error instead of quietly coming out empty.',
            '**Clear out the gaps left by empty values** removes the double spaces that otherwise appear when a field is empty.',
            'The **How it comes out** box shows the first, a middle and the last row from your own file. The exception is otherwise visible in two cells out of a thousand.',
            'The first and last rows are counted in **the order you see now** — the same order `Ctrl+C` copies. A physical reading would have put the comma on the last copied row.',
            '**The column remembers its template** with **Remember the template for the column** ticked. The header gets a `template` badge, and the column **never** recalculates on its own — but when the sources change the badge turns yellow and the status bar offers **Update**, exactly the way *Sort again* does for a sorted list. The update is a single `Ctrl+Z`.',
            'The column menu has **Update from the template**, **Change the template…** and **Drop the template** when the column has one. If you rename a source column the template comes along; if you delete one the badge says so instead of the column being filled with half values.'
          ],
          before: { t: 'The template', items: ["('{Namn}'),", "last row: ('{Namn}')"] },
          after: { t: 'The column', items: ["('Anna Karlsson'),", "('Greta Öhrn')"] }
        },
        {
          id: 'rakna', t: 'Calculate', img: 'rakna.png',
          cap: 'The calculate tool with a formula. The error is shown while you type.',
          lead: 'A new column from a formula.',
          steps: [
            'Column menu → **Calculate…**',
            'Write the formula, e.g. `{Antal} * {Pris}`, `RUNDA({Belopp} * 1,25; 2)` or `{Slut} - {Start}`.',
            'Choose decimals and decimal mark, and click **Create the column**.'
          ],
          notes: [
            'Four operators, parentheses and the functions `RUNDA`, `ABS`, `MIN`, `MAX`. The error in the formula is shown while you type.',
            'Numbers are written as they are in the file: `1 240,50` works just as well as `1240.5`.',
            'A date column counts as a number of days, so `{Slut} - {Start}` gives the difference in days.',
            'Empty cells, text that is not a number, and division by zero give **empty, not zero**. A gap can be seen; a wrong zero cannot.'
          ]
        },
        {
          id: 'ersatt', t: 'Find and replace', img: 'ersatt.png',
          cap: 'Find and replace with a literal search.',
          steps: [
            'Column menu → **Find and replace…**',
            'Write what to look for and what it should become.',
            'Click **Apply**.'
          ],
          notes: [
            'A literal search is literal: `1.5` does not match `125`.',
            'Tick **Regular expression** for patterns. The error is shown while you type.',
            '**The whole cell** only replaces when the entire value matches, not part of it.'
          ]
        }
      ]
    },
    {
      id: 'sammanfatta', t: 'Summarising and analysing', sub: 'Answers out of the data, without touching it',
      sections: [
        {
          id: 'gruppera', t: 'Group and summarise', img: 'gruppera.png',
          cap: 'The grouping dialog with a sum per city. The box “How it turns out” shows the result while you set it up.',
          lead: '*Sum Belopp per Ort*, *number of orders per customer*, *first and last date per project* — one row per group.',
          steps: [
            '**Summarise…** in the editing toolbar.',
            'Pick the columns to **group by**.',
            'Add the calculations: row count, sum, average, smallest, largest, filled in, unique, first, last, or the values listed out.',
            'The box **How it turns out** shows the result while you set it up. Click **Create the tab**.'
          ],
          notes: [
            'The result becomes a **new tab**. The original is left alone.',
            'Grouping runs on **what you see**: if you filtered to 2024, the sum is 2024’s sum.',
            'A sum with no readable numbers comes out **empty, not zero**.',
            'Rows with no value in the grouping columns are not counted into any group — they are reported, and can be included as a group of their own if that is what you want.'
          ]
        },
        {
          id: 'pivot', t: 'Pivot', img: 'pivot.png',
          cap: 'The pivot view as a cross table: number of orders per Ort and Status.',
          lead: '*Number of orders per Ort and Status* in a cross table. A **view of its own** that never touches the data.',
          steps: [
            '**Pivot** in the editing toolbar. The view opens with a table that already says something.',
            'Pick the dimension for **rows** and for **columns**. **⇄** swaps them.',
            'Pick **measures** — count, sum, average, smallest, largest, filled in, unique. Several can sit side by side.',
            '**Make a new tab** if you want to sort, filter or export the answer.'
          ],
          notes: [
            '**Level list** is the same calculation ordered in one direction instead, with subtotals at every level that can be collapsed.',
            '**View** switches between numbers, *% of row* and *% of column*. The percentage is only offered for measures that can be added up — an average is not part of another average.',
            'Clicking a column header sorts the rows by that column.',
            'The pivot counts the **whole file** by default; tick **only the ones shown right now** to follow the filter.'
          ]
        },
        {
          id: 'kolumnoversikt', t: 'Column overview', img: 'kolumnoversikt.png',
          cap: 'One row per column, with type, fill rate, unique values and problems.',
          lead: 'Answers the question you ask before you start: *what kind of file is this?*',
          steps: [
            '**Overview** above the column list.',
            'One row per column, with type, fill rate, unique values and problems.',
            'Click a suggestion on the right — that opens the right tool on the right column.'
          ]
        },
        {
          id: 'inspektor', t: 'The column inspector', img: 'inspektor.png', imgWidth: 520,
          cap: 'The inspector shows the column the cursor is in.',
          lead: 'The panel on the right when no tool is open. Shows how many values are filled in, empty, unique and unreadable, plus the most common values.',
          notes: [
            '**Show those N rows** filters out exactly the problematic rows.',
            'From here you can also change the type, rename, duplicate and delete the column.'
          ]
        }
      ]
    },
    {
      id: 'flera-filer', t: 'Multiple files', sub: 'Put data together from several sources',
      intro: 'The three ways of putting data together from several files sit under **Multiple files ▾** in the editing toolbar. Open the files as separate tabs first.',
      sections: [
        {
          id: 'slaihop', t: 'Merge two files', img: 'slaihop.png',
          cap: 'The merge view shows four things at once: both source files with the normalised key, how the rows pair up, and how the result turns out.',
          lead: 'Puts rows that belong together side by side, matched on a key — like `VLOOKUP`, but with the answer key visible.',
          steps: [
            '**Multiple files ▾ → Merge…**',
            'The tool has already tried every column pair against every other and suggested the one that gives the most matches. Change it freely, or **＋ Add column pair**.',
            'Read the numbers at the top: how many rows find a match, how many are left over, how many match more than one.',
            'Tick the **columns to take**, and click **Merge**.'
          ],
          notes: [
            'The view shows four things at once while you set it up: both source files with the normalised key under each value, how the rows pair up, and how the result turns out. The preview’s rows mix hits and misses in the proportion they actually have.',
            'The result becomes a **new tab** with a **Träff** column: `träff`, `ingen träff` or `flera träffar`. That column is data, so it stays Swedish in both languages. It is what makes the unmatched rows filterable afterwards.',
            '**Which rows come along** decides whether only the base’s rows follow, or all rows from both files.',
            'The comparison can be plain, character-exact, without å ä ö, digits only, email against name, or name against first + last name. **Empty keys never match.**',
            '`⇄ Swap sides` changes which file is the base.'
          ]
        },
        {
          id: 'verkstad', t: 'The matching workbench', img: 'verkstad.png',
          cap: 'The workbench: two leftover lists and a bench that compares the rows field by field.',
          lead: 'For the rows that were left over. A merge never ends at a hundred percent.',
          steps: [
            '**Work through the rest…** in the merge view — or **Continue** on the chip in the status bar when you come back later.',
            'The unmatched rows sit as two lists. Click a row in each and compare them field by field on the workbench.',
            'Four ways out: **Pair up** by hand, fix a value in place so the row finds its partner by itself, **another try on a different column**, or **write the row off**.',
            'Click **Merge** when you are happy. Every round puts its result in a tab of its **own**.'
          ],
          notes: [
            '**Fuzzy** similarity exists only here, never across the whole file. The score is shown as two numbers — spelling and word order — so it says *why*.',
            'The leftover list distinguishes a row without a partner, a row whose key is empty, and a row that matches several and needs a choice.',
            'The work survives closing the view and reloading the page. **Export the leftover lists** gives one CSV per file to send on.'
          ]
        },
        {
          id: 'kombinera', t: 'Combine files', img: 'kombinera.png',
          cap: 'The alias map: one row per target column, one column per file, with an example value under each picker.',
          lead: 'Stacks files **on top of each other**. Twelve monthly files, three salespeople’s customer lists — the same kind of data, but the headers are named differently.',
          steps: [
            '**Multiple files ▾ → Combine…**',
            'The alias map shows one row per target column and one column per file, and has already guessed `Namn`, `Name` and `kundnamn` together.',
            'Columns that exist in only some files have to be **decided** — **Include** or **Skip**, one by one or all at once.',
            'Click **Combine**.'
          ],
          notes: [
            'Under each source picker sits one of the column’s values, because headers lie: `Kontakt` can be a name in one file and an address in another.',
            'If the tool guesses wrong, there is **Same column as…** on the row.',
            'A **Default** value fills the files that give nothing — `Unknown` where the column is missing. Only there: a cell that exists but is empty is never touched.',
            'A column with the source file’s name comes along by default, since the row number starts over for each file.'
          ]
        },
        {
          id: 'mall', t: 'Fill a template with data',
          lead: 'The same view as **Combine**, but the shape comes from a **template file**: a document with headers only.',
          steps: [
            '**Multiple files ▾ → Fill a template with data…**',
            'Open the template file, or use **Example template**.',
            'Point out where each target column takes its value from, and run.'
          ],
          notes: [
            'The template decides which columns the result has, what they are called and in which order they come.',
            'Example rows in the template never come along, but are shown as a hint in the map.',
            'Columns that exist in the files but not in the template are not thrown away quietly — you are asked about them.'
          ]
        }
      ]
    },
    {
      id: 'spara', t: 'Keeping your work', sub: 'Profiles, tabs and starting over',
      sections: [
        {
          id: 'profiler', t: 'Profiles', img: 'profiler.png',
          cap: 'The profile dialog shows the steps you took in this file.',
          lead: 'The same export file arrives every month, and the same ten manual steps have to be repeated. A profile is the list of those steps.',
          steps: [
            '**Profiles…** in the app row.',
            'The dialog shows what you did in this file. **Save as a profile**, with a name.',
            'Open next month’s file and press **Run** on the profile.'
          ],
          notes: [
            'Columns are matched by **name**, since a column id means nothing in another file. If a step cannot find its column, it says so.',
            'Only what can be repeated comes along. A hand-edited cell or a deleted row points at that specific file’s rows, and is greyed out with its reason.',
            'After the run it says step by step what happened. `Ctrl+Z` goes back one step at a time.',
            '**Save to file** if the profile needs to travel somewhere else.'
          ]
        },
        {
          id: 'flikarna', t: 'Your tabs come back',
          lead: 'The files you have open are saved in your own browser — with sorting, filter, duplicate view and selection — and come back the next time you open the page. A closed tab is forgotten immediately.',
          notes: [
            '**The undo history does not come along.** The tool says so when the tabs come back.',
            '**Forget saved files** in the command palette empties what was saved but leaves your tabs open.'
          ]
        },
        {
          id: 'borja-om', t: 'Start over', img: 'borja-om.png', imgWidth: 520,
          cap: 'The dialog lists what is stored before anything is cleared.',
          lead: 'When you are done: click **● All local** in the status bar.',
          steps: [
            'The dialog lists what exists — open files with row counts, a merge in progress, and how many bytes the browser has stored.',
            'Files with changes that have not been exported are listed separately.',
            'Click **Clear everything.** The page reloads.'
          ],
          warn: 'This is one of the few actions that **cannot** be undone.'
        }
      ]
    },
    {
      id: 'genvagar', t: 'Shortcuts and settings', sub: 'The palette, the keyboard and the look',
      sections: [
        {
          id: 'palett', t: 'The command palette', img: 'palett.png', imgWidth: 520,
          cap: 'Ctrl+K opens the palette.',
          lead: '`Ctrl+K` opens the palette. It is the way in for someone who knows *what* they want to do but not where the button is.',
          notes: [
            'The search is literal and accent-insensitive, and finds Swedish terms too: `undo`, `join`, `makro`.',
            'Column commands apply to the column the cursor is in, and are listed with the column’s name spelled out.'
          ]
        },
        {
          id: 'tangentbord', t: 'Keyboard',
          kbd: [
            ['Ctrl+K', 'The command palette'],
            ['Ctrl+F', 'Search'],
            ['Ctrl+S', 'Export'],
            ['Ctrl+Z · Ctrl+Y', 'Undo · Redo'],
            ['Enter · F2 · double-click', 'Edit the cell'],
            ['Shift + arrow keys', 'Extend the selection'],
            ['Ctrl+D', 'Fill down'],
            ['Delete', 'Empty the selection'],
            ['Ctrl+C · Ctrl+V', 'Copy · Paste (TSV, as Excel does)'],
            ['Ctrl+Shift+V', 'Paste as a new file'],
            ['F2 in the header', 'Rename the column'],
            ['The menu key', 'Opens the menu at the selection']
          ]
        },
        {
          id: 'installningar', t: 'Language, theme and toolbar', img: 'installningar.png', imgWidth: 360,
          cap: 'The settings menu on the far right of the app row.',
          lead: 'On the far right of the app row: the `SV | EN` language choice, light/dark mode and the settings gear.',
          notes: [
            '**Language** changes the labels only. Sorting is still Swedish, numbers are still written `1 240,50` and the date tool still reads `augusti` — otherwise the same file sorted in two languages would give two orders.',
            '**Theme** can follow the system, or be locked to light or dark.',
            '**The toolbar** can sit as a row under the tabs or vertically to the left of the columns. The choice is saved.'
          ]
        }
      ]
    }
  ]
};
