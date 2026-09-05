/**
 * Grundtyper för CSV-verkstan.
 *
 * Bärande princip: originaltexten är sanningen. `ColumnType` är en *tolkning*
 * som styr sortering, filter och vilka verktyg som erbjuds — den skriver
 * aldrig om ett värde. Värden ändras bara av en uttrycklig åtgärd.
 */

export type ColumnId = string
export type FrameId = string

/** Hur en kolumns värden tolkas. Aldrig destruktivt. */
export type ColumnType = 'text' | 'number' | 'date' | 'email' | 'bool' | 'empty'

/**
 * Cellflaggor, en byte per cell vid sidan av värdet.
 * Måste finnas från dag ett — att lägga till dem efter att rutnät, sortering
 * och export skrivits är en omskrivning.
 */
export const Flag = {
  /** Raden hade för få fält; cellen fylldes ut vid import. */
  Padded: 1 << 0,
  /** Värdet gick inte att tolka som kolumnens typ. Råtexten står kvar. */
  ParseError: 1 << 1,
  /** Cellen har redigerats för hand. */
  UserEdited: 1 << 2,
  /** Värdet är härlett av ett verktyg och är en gissning (t.ex. namn ur e-post). */
  DerivedGuess: 1 << 3,
  /** Värdet är en Excel-felsträng (#SAKNAS!, #DIVISION/0! …). */
  ExcelError: 1 << 4,
} as const

export type FlagBit = (typeof Flag)[keyof typeof Flag]

/**
 * En kolumn, ordbokskodad.
 *
 * `dict[0]` är alltid tomma strängen, så en oskriven cell är kod 0.
 * Ordbokskodningen är inte bara en minnesoptimering: filtrering, värdelistor
 * med antal och sorteringsrang räknas alla på ordboken i stället för på
 * raderna, vilket är skillnaden mellan millisekunder och sekunder.
 */
export interface Column {
  readonly id: ColumnId
  name: string
  type: ColumnType
  /** Sant när användaren valt typ manuellt — automatisk omtolkning rör den inte. */
  typeLocked: boolean
  hidden: boolean
  /** Pixelbredd i rutnätet, eller null för automatisk. */
  width: number | null
  /** Unika värden. Index 0 är alltid ''. */
  dict: string[]
  /** dict-index per fysisk rad. */
  codes: Uint32Array
  /** Flaggbitar per fysisk rad. */
  flags: Uint8Array
  /** Uppslagning värde → dict-index. Hålls synkad med `dict`. */
  dictIndex: Map<string, number>
  /**
   * Värden i den ordning de ska sorteras, för kolumner vars ordning inte är
   * alfabetisk.
   *
   * Träff-kolumnen ur en sammanslagning är exemplet: bokstavsordningen ger
   * *bara i den andra filen* → *flera träffar* → *ingen träff* → *träff*,
   * vilket inte betyder någonting. Ordningen som betyder något är den kolumnen
   * berättar, från lyckad till helt utan partner.
   *
   * Värden som inte står i listan sorteras efter dem, sinsemellan i
   * bokstavsordning — en städning som skriver om värdena tappar alltså
   * ordningen i stället för att hamna i en gissad.
   */
  sortordning?: readonly string[]
  /**
   * Hur kolumnen byggdes, när den byggdes ur en mall.
   *
   * Se `Kolumnregel`. Valfri: en vanlig kolumn har ingen.
   */
  regel?: Kolumnregel
}

/**
 * Minnet av hur en kolumn byggdes — inte en levande länk.
 *
 * Skillnaden är hela poängen. Ett kalkylark betalar sin kraft med att ingen
 * längre vet vad en cell innehåller, och det är därför `Räkna` med flit
 * saknar celler som pekar på varandra. En regel bryter inte mot det: värdena
 * är vanlig data i varje ögonblick, exporten och filtren ser ren text, och
 * **ingenting räknas om utan ett klick**.
 *
 * Det enda regeln köper är att verktyget kan *säga till* när kolumnen blivit
 * äldre än sina källor, och fylla den på nytt i ett steg. Exakt samma
 * uppgörelse som den frusna sorteringen och dess *Sortera om*.
 *
 * Unionen har en medlem med flit: en beräknad kolumn kan bli `typ: 'formel'`
 * senare utan att den här filen behöver röras igen.
 */
export type Kolumnregel = {
  typ: 'mall'
  mall: string
  forsta?: string
  sista?: string
  stadaLuckor: boolean
  /**
   * Kolumnnamnen mallarna läser.
   *
   * Namn och inte id, av samma skäl som profilerna: mallen är skriven i namn,
   * och det är namnen som avgör vad den ger.
   */
  kallor: string[]
  /** Fingeravtryck över källorna vid den senaste beräkningen. */
  avtryck: number
  /**
   * Sant när mallen är avstängd.
   *
   * En avstängd mall räknas inte om, flaggas inte som inaktuell och räknas
   * inte med när statusraden erbjuder *Uppdatera* — men den finns kvar, och
   * det är hela skillnaden mot att kasta den. Att slå av något av misstag ska
   * gå att ta tillbaka i morgon, inte bara med nästa `Ctrl+Z`.
   *
   * Valfritt, så varje regel som redan ligger i någons webbläsare läses som
   * påslagen.
   */
  avstangd?: boolean
}

/**
 * Ett dataset: kolumner i ordning plus en vy.
 *
 * `view` är radindex efter filtrering och sortering. Filtrering skapar en ny
 * `view`, sortering permuterar den, kolumnflytt ändrar bara `columns`-ordningen.
 * Ingen celldata kopieras för någon av dem.
 */
export interface Frame {
  readonly id: FrameId
  name: string
  columns: Column[]
  /** Antal fysiska rader (före filtrering). */
  rowCount: number
  /** Fysiska radindex i visningsordning. */
  view: Uint32Array
  /** Ursprunglig 1-baserad radnummer i källfilen, per fysisk rad. */
  sourceRow: Uint32Array
  meta: FrameMeta
}

export interface FrameMeta {
  /** Filnamn som datat kom från, om något. */
  fileName?: string
  /** Hur filen lästes — visas i statusraden och styr export-förval. */
  parse?: ParseSettings
  /** Varningar från importen, visade som en icke-blockerande bricka. */
  warnings: Warning[]
}

export type Delimiter = ',' | ';' | '\t' | '|'

export type Encoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252'

export interface ParseSettings {
  delimiter: Delimiter
  encoding: Encoding
  /** Sant om filen inleddes med en byte order mark. */
  hadBom: boolean
  /** Radslut som dominerade i källan. Styr export-förval. */
  newline: '\r\n' | '\n'
  quote: '"'
  /** 0-baserad rad som innehåller rubrikerna, eller null för inga rubriker. */
  headerRow: number | null
  /** Antal rader att hoppa över före rubrikraden. */
  skipRows: number
  trimFields: boolean
  skipEmptyRows: boolean
  /** Excels `sep=;`-rad konsumerades vid import. */
  hadSepDirective: boolean
}

export type WarningKind =
  | 'ragged-row'
  | 'duplicate-header'
  | 'empty-header'
  | 'empty-column'
  | 'ghost-rows'
  | 'encoding-uncertain'
  | 'mojibake'
  | 'duplicate-file'
  | 'truncated'

export interface Warning {
  kind: WarningKind
  message: string
  /** Berörda fysiska rader, om tillämpligt. Begränsad lista för visning. */
  rows?: number[]
  /** Berörd kolumn, om tillämpligt. */
  columnId?: ColumnId
  count?: number
}
