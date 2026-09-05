import type { Column, ColumnId, Frame } from '../types.js'
import { createColumn, intern } from '../frame/column.js'
import { findColumn, identityView, newFrameId, uniqueColumnName } from '../frame/frame.js'
import { inferAllTypes } from '../infer.js'
import { kolumnrang, talnycklar, TOM_RANG } from '../frame/rank.js'
import { byggNormaliserare, gruppIder, type Normalisering } from './duplicates.js'
import { sorteraNiva } from './sort.js'
import { TOMT_FILTER, tillampaFilter, type Filter } from './filter.js'
import { skrivTal, type Talformat } from './numbers.js'
import {
  BERAKNINGAR,
  berakningsnamn,
  type Berakning,
  type Berakningspost,
  type Berakningstyp,
  type Lasbarhet,
} from './gruppera.js'

/**
 * Pivoten.
 *
 * Grupperingen svarar *en rad per grupp*. Pivoten svarar på samma fråga ställd
 * åt två håll samtidigt: summa Belopp per Ort **och** per Status, i en matris
 * där man ser mönstret utan att läsa en enda siffra i taget. Det är skillnaden
 * mellan en lista och en överblick.
 *
 * **Samma begrepp om vad en grupp är.** Varje dimension normaliseras med
 * `gruppIder` ur dubblettvyn, precis som `gruppera()` gör. Att dela den
 * funktionen är hela poängen: *hitta dubbletter i Ort*, *summera per Ort* och
 * *pivotera på Ort* måste vara eniga om vad som räknas som samma ort, annars
 * är det tre verktyg som ger tre svar på samma fråga.
 *
 * **Men pivoten räknar på hela filen som förval.** Grupperingen lovar i sin
 * dokumentation att den går på det man ser, och det löftet rörs inte här —
 * pivoten har en egen radkälla och ett eget val. En överblick som tyst krympt
 * för att ett filter låg kvar är sämre än ingen överblick alls, så valet står
 * som en kryssruta i vyn i stället för att gissas.
 *
 * **Totalt räknas om, aldrig ihop.** Varje cell, varje radsumma, varje
 * kolumnsumma och totalen räknas av samma funktion över ett större eller
 * mindre band av rader. En total som summerade cellerna hade svarat fel på
 * snitt (ett snitt av snitt är inget snitt) och på unika (samma kund i två
 * orter är en kund, inte två). Det är den enda regel i den här filen som är
 * värd att kunna utantill.
 */

/**
 * Mätvärdena en pivot kan visa: sju av grupperingens tio.
 *
 * *Första värdet*, *Sista värdet* och *Lista värdena* saknas, och skälet är
 * delsummorna. De tre svaren beror på radernas ordning, och en delsummerad
 * rad räknas över ett band där flera kolumners rader ligger om varandra —
 * ”första värdet i Malmö” hade blivit det första i den ordning pivoten råkade
 * sortera, inte i filen. De sju som är kvar ger samma svar oavsett hur raderna
 * ligger, och det är just det som gör att en delsumma kan räknas om från
 * grunden. Vill man ha de tre finns de kvar i *Sammanfatta*, där radordningen
 * är väldefinierad.
 */
export const PIVOTBERAKNINGAR: readonly Berakningstyp[] = [
  'antal',
  'summa',
  'snitt',
  'minsta',
  'storsta',
  'ifyllda',
  'unika',
]

export function pivotberakningar(): Berakningspost[] {
  return BERAKNINGAR.filter((b) => PIVOTBERAKNINGAR.includes(b.typ))
}

/**
 * Mätvärden som går att lägga ihop — och därför att visa som andel.
 *
 * *Andel av raden* betyder ”hur stor del av radens helhet”. Det är en fråga
 * med svar bara när delarna summerar till helheten. Snittet i Malmö är ingen
 * del av snittet i landet, och antalet unika kunder i en cell är ingen del av
 * antalet unika i raden. Vyn stänger av procentvalet med det skälet skrivet i
 * klartext i stället för att visa ett tal som ser rimligt ut.
 */
export const ADDITIVA: readonly Berakningstyp[] = ['antal', 'summa', 'ifyllda']

export function arAdditiv(matvarde: Berakning): boolean {
  return ADDITIVA.includes(matvarde.typ)
}

/** Hur många värden en dimension visar innan resten viks in i Övriga. */
export const RADTAK = 200
export const KOLUMNTAK = 25
export const KOLUMNTAK_VAL = [10, 25, 50] as const

/**
 * Tak för antalet utskrivna rader, delsummor inräknade.
 *
 * Taken per dimension räcker för en dimension men inte för tre: tre nivåer med
 * tvåhundra värden var kan i teorin ge åtta miljoner rader. Det här är den
 * sista spärren, och den räknas — foten säger hur många rader som inte fick
 * plats, och fliken får dem allihop.
 */
export const MAXRADER = 2000

/**
 * Hur många kolumnkombinationer som får egna spalter.
 *
 * `kolumntak` gäller per dimension och håller varje enskild dimension kort.
 * Två korta dimensioner kan ändå ge en bred tabell — tio gånger tio är hundra
 * spalter — så det här är taket på produkten. Resten viks in i ett Övriga-löv
 * så att Totalt fortfarande stämmer.
 */
export const KOLUMNLOVTAK = 40

/**
 * Id för ett mätvärde.
 *
 * En löpande räknare, inte en tidsstämpel: id:t är bara en nyckel för listan
 * och för `key=` i vyn, och ett id som beror på klockan gör två annars lika
 * körningar olika. Samma val som filterreglerna gör.
 */
let matvardesraknare = 0
export function nyttMatvardeId(): string {
  matvardesraknare += 1
  return `m${matvardesraknare.toString(36)}`
}

export type Underlag = 'hela' | 'vyn'

export interface Pivotplan {
  /** Raddimensionerna, utifrån och in. Tom lista ger bara Totalt-raden. */
  rader: ColumnId[]
  /** Kolumndimensionerna, utifrån och in. Tom lista ger bara Totalt-kolumnen. */
  kolumner: ColumnId[]
  /** Ett eller flera mätvärden, sida vid sida under varje kolumnvärde. */
  matvarden: readonly Berakning[]
  /**
   * Vad som räknas med.
   *
   * Samma typ som rutnätets snabbfilter, och samma motor: ett filterfält i
   * panelen är en regel med operatorn *är något av*. Två filter i verktyget
   * som betydde olika saker vore ett verktyg för mycket att lära sig.
   */
  filter: Filter
  strunta: Normalisering
  /** Ge tomma värden en egen rubrik i stället för att lämna raderna utanför. */
  tommaMed: boolean
  underlag: Underlag
  radtak: number
  kolumntak: number
  format: Talformat
  decimaler: number | null
}

export interface Pivotrubrik {
  /** Värdet så som det står i filen — gruppens första rad, som i grupperingen. */
  etikett: string
  /** Källrader bakom rubriken. */
  rader: number
  /** Samlingsposten som bär det som inte fick plats under taket. */
  ovriga: boolean
  /** Rubriken för tomt värde, när `tommaMed` är på. */
  tom: boolean
  /** Hur många värden som viks ihop här. Bara satt på Övriga. */
  varden: number
}

/**
 * En kolumn i matrisen: en kombination av värden, ett per kolumndimension.
 *
 * Med en enda kolumndimension är det bara ett värde, som förr. Med flera är
 * det vägen genom dem — `Aktiv › Sverige` — och rubrikraderna ritas genom att
 * leta löpor av lika `stig` per nivå.
 *
 * Bara kombinationer som **finns i datat** blir kolumner. Den kartesiska
 * produkten vore mest tomma spalter: tjugofem värden i två dimensioner ger
 * sexhundratjugofem kombinationer, och en fil har sällan ens hundra av dem.
 */
export interface Kolumnlov {
  /** Ett rubrikindex per kolumndimension, utifrån och in. */
  stig: number[]
  /** Rubriken per nivå, med `tom` och `ovriga` intakta så vyn kan skilja dem. */
  nivaer: Pivotrubrik[]
  /** Källrader bakom lövet. */
  rader: number
  /** Samlingslövet som bär kombinationerna som inte fick plats under taket. */
  ovriga: boolean
}

export interface Pivotrad {
  /** Ett värde per raddimension, tomma strängar under den nivå raden gäller. */
  etiketter: string[]
  /** 0 är översta nivån. Lövrader har `niva === plan.rader.length - 1`. */
  niva: number
  /** Stigen genom trädet, `"3/7"`. Nyckel för hopfällning och för `key=`. */
  stig: string
  /** Källrader bakom raden. */
  antal: number
  ovriga: boolean
  tom: boolean
  /**
   * Radens band i `Pivotresultat.kallrader`, halvöppet: `[start, slut)`.
   *
   * Det är precis de rader `raknaBand` räknade när cellerna på den här raden
   * skrevs, och därför det enda ärliga svaret på *vilka rader ligger bakom
   * talet*. Se `radernaBakom`.
   */
  start: number
  slut: number
}

export interface Pivotresultat {
  /** Kolumnernas kombinationer. Totalt-kolumnen ligger sist i matrisen. */
  kolumner: Kolumnlov[]
  /** Hur många nivåer kolumnrubriken har. Noll när ingen kolumndimension finns. */
  kolumnnivaer: number
  /** Raderna med delsummor. Totalt-raden ligger sist i matrisen. */
  rader: Pivotrad[]
  /** `kolumner.length + 1` — den sista är Totalt. */
  bredd: number
  /** `rader.length + 1` — den sista är Totalt. */
  hojd: number
  /**
   * Cellernas text, `null` för tom cell.
   *
   * Index: `(rad * bredd + kolumn) * matvarden.length + matvarde`.
   */
  text: (string | null)[]
  /** Samma index som `text`. `NaN` när cellen saknar ett tal att räkna med. */
  tal: Float64Array
  /**
   * Källraderna i den ordning matrisen räknade dem.
   *
   * Fysiska radnummer, sorterade så att varje `Pivotrad` blir ett
   * sammanhängande band. Det här är vad som gör *visa raderna bakom cellen*
   * möjligt utan att gissa: talet i cellen och listan man får fram är
   * räknade ur samma rader.
   */
  kallrader: Uint32Array
  /**
   * Kolumnhinken per plats i `kallrader`, eller `null` utan kolumnfält.
   *
   * Aligned med `kallrader`, inte med filens rader: en fil på en miljon rader
   * betalar för de rader som kom med, inte för alla.
   */
  kolumnband: Uint32Array | null
  /** Källrader som kom med. */
  antalKallrader: number
  /** Rader som lämnades utanför för att någon dimension var tom. */
  utanNyckel: number
  doldaRadvarden: number
  doldaKolumnvarden: number
  /** Kombinationer som inte fick plats under lövtaket och vikts in i Övriga. */
  doldaKolumnlov: number
  /** Sant när taket slog i och utskriften avbröts. */
  kapat: boolean
  lasbarhet: Lasbarhet[]
}

/** Raden ligger utanför pivoten — någon dimension saknar värde. */
const UTANFOR = 0xffffffff

interface Dimension {
  col: Column
  /** Visningsindex per fysisk rad, eller `UTANFOR`. */
  hink: Uint32Array
  rubriker: Pivotrubrik[]
  dolda: number
}

/**
 * En dimensions rubriker, i den ordning de ska visas.
 *
 * Två olika frågor besvaras med två olika ordningar, och det är avsiktligt.
 * **Vilka värden som får plats** avgörs av storleken: det sällsynta är det man
 * kan avvara. **I vilken ordning de står** avgörs av kolumnens egen rang —
 * samma som sorteringen använder — så att månader hamnar i månadsordning och
 * tal i talordning i stället för i popularitetsordning. Att välja på det ena
 * och visa efter det andra är det som gör en kapad tabell läsbar.
 */
function byggDimension(
  col: Column,
  radkalla: Uint32Array,
  normalisera: (v: string) => string,
  tak: number,
  tommaMed: boolean,
): Dimension {
  const ider = gruppIder(col, normalisera)
  let maxId = 0
  for (let kod = 1; kod < ider.length; kod++) {
    const id = ider[kod]!
    if (id > maxId) maxId = id
  }

  const antalPerId = new Uint32Array(maxId + 1)
  const forstaKod = new Uint32Array(maxId + 1)
  for (let i = 0; i < radkalla.length; i++) {
    const kod = col.codes[radkalla[i]!]!
    const id = ider[kod]!
    antalPerId[id]! += 1
    // Etiketten är gruppens första rad, inte det normaliserade värdet. Har man
    // struntat i skiftläget står det ”Malmö” om det var stavningen som kom
    // först — i alla fall ett av de värden som faktiskt fanns i filen.
    if (id !== 0 && forstaKod[id] === 0) forstaKod[id] = kod
  }

  const { rang } = kolumnrang(col)
  const minRang = new Float64Array(maxId + 1).fill(Infinity)
  for (let kod = 1; kod < ider.length; kod++) {
    const id = ider[kod]!
    if (id === 0) continue
    const r = rang[kod]!
    if (r !== TOM_RANG && r < minRang[id]!) minRang[id] = r
  }

  const narvarande: number[] = []
  for (let id = 1; id <= maxId; id++) if (antalPerId[id]! > 0) narvarande.push(id)

  const behallna = [...narvarande]
    .sort((a, b) => antalPerId[b]! - antalPerId[a]! || a - b)
    .slice(0, Math.max(1, tak))
  const dolda = narvarande.length - behallna.length

  // Otolkbara värden saknar rang och hamnar sist, som i sorteringen.
  const efterRang = (a: number, b: number): number => {
    const ra = minRang[a]!
    const rb = minRang[b]!
    if (ra !== rb) {
      if (!Number.isFinite(ra)) return 1
      if (!Number.isFinite(rb)) return -1
      return ra - rb
    }
    return antalPerId[b]! - antalPerId[a]! || a - b
  }
  behallna.sort(efterRang)

  const rubriker: Pivotrubrik[] = []
  const idTillIndex = new Int32Array(maxId + 1).fill(-1)
  for (const id of behallna) {
    idTillIndex[id] = rubriker.length
    rubriker.push({
      etikett: col.dict[forstaKod[id]!] ?? '',
      rader: antalPerId[id]!,
      ovriga: false,
      tom: false,
      varden: 0,
    })
  }

  let tomIndex = -1
  if (tommaMed && antalPerId[0]! > 0) {
    tomIndex = rubriker.length
    rubriker.push({ etikett: '', rader: antalPerId[0]!, ovriga: false, tom: true, varden: 0 })
  }

  let ovrigaIndex = -1
  if (dolda > 0) {
    let rader = 0
    for (const id of narvarande) if (idTillIndex[id] === -1) rader += antalPerId[id]!
    ovrigaIndex = rubriker.length
    rubriker.push({ etikett: '', rader, ovriga: true, tom: false, varden: dolda })
  }

  const hink = new Uint32Array(col.codes.length).fill(UTANFOR)
  for (let i = 0; i < radkalla.length; i++) {
    const r = radkalla[i]!
    const id = ider[col.codes[r]!]!
    if (id === 0) {
      if (tomIndex >= 0) hink[r] = tomIndex
      continue
    }
    const plats = idTillIndex[id]!
    hink[r] = plats >= 0 ? plats : ovrigaIndex >= 0 ? ovrigaIndex : UTANFOR
  }

  return { col, hink, rubriker, dolda }
}

interface Kolumnaxel {
  /** Lövindex per fysisk rad, eller `UTANFOR`. */
  hink: Uint32Array
  lov: Kolumnlov[]
  /** Värden som föll bort per dimension, summerade. */
  dolda: number
  /** Kombinationer som inte fick plats under lövtaket. */
  doldaLov: number
}

/**
 * Kolumndimensionerna vikta till **en** hink per rad.
 *
 * Det är den enda anledningen till att flera kolumnfält blev en liten ändring:
 * `raknaBand` läser ett heltal per rad och bryr sig inte om att heltalet numera
 * står för en kombination i stället för ett värde. Hela Totalt-logiken —
 * regeln som är värd att kunna utantill — rörs inte alls.
 *
 * **En dimension i taget, tätt numrerad efter varje steg.** Den uppenbara
 * vägen vore en blandad radix över alla dimensioner på en gång, men ett sådant
 * tal växer med produkten av rubrikantalen och spränger heltalen vid en
 * handfull fält. Att numrera om efter varje dimension håller talen under
 * radantalet, och ordningen bevaras ändå: nyckeln `plats · n + hink` är
 * växande i den ordning man läser stigen, så en stigande sortering av
 * nycklarna *är* den nästlade visningsordningen. Ingen extra sortering behövs.
 *
 * **Bara kombinationer som finns i datat.** Den kartesiska produkten vore mest
 * tomma spalter — tjugofem värden i två dimensioner ger sexhundratjugofem — och
 * en tom spalt är bläck utan innehåll.
 */
function byggKolumnaxel(
  dimensioner: Dimension[],
  radkalla: Uint32Array,
  radantal: number,
  tak: number,
): Kolumnaxel {
  const hink = new Uint32Array(radantal).fill(UTANFOR)
  const dolda = dimensioner.reduce((s, d) => s + d.dolda, 0)
  if (dimensioner.length === 0) return { hink, lov: [], dolda, doldaLov: 0 }

  // En rad utan värde i någon av dimensionerna har ingen spalt att stå i.
  const med: number[] = []
  for (let i = 0; i < radkalla.length; i++) {
    const r = radkalla[i]!
    let inne = true
    for (const d of dimensioner) {
      if (d.hink[r]! === UTANFOR) {
        inne = false
        break
      }
    }
    if (inne) med.push(r)
  }

  let stigar: number[][] = [[]]
  const plats = new Uint32Array(radantal)
  for (const d of dimensioner) {
    const n = Math.max(1, d.rubriker.length)
    const antalPerNyckel = new Map<number, number>()
    for (const r of med) {
      const nyckel = plats[r]! * n + d.hink[r]!
      antalPerNyckel.set(nyckel, (antalPerNyckel.get(nyckel) ?? 0) + 1)
    }
    const nycklar = [...antalPerNyckel.keys()].sort((a, b) => a - b)
    const tillIndex = new Map<number, number>()
    const nya: number[][] = []
    for (const nyckel of nycklar) {
      tillIndex.set(nyckel, nya.length)
      nya.push([...stigar[Math.floor(nyckel / n)]!, nyckel % n])
    }
    for (const r of med) plats[r] = tillIndex.get(plats[r]! * n + d.hink[r]!)!
    stigar = nya
  }

  const antal = new Uint32Array(stigar.length)
  for (const r of med) antal[plats[r]!]! += 1

  /*
   * Lövtaket, valt på storlek och visat i ordning.
   *
   * Samma regel som `byggDimension` följer, och av samma skäl: det sällsynta är
   * det man kan avvara, men ordningen ska vara den man läser i. Här är
   * läsordningen index­ordningen, eftersom stigarna redan numrerats i den.
   */
  const behallna = stigar.map((_, i) => i).sort((a, b) => antal[b]! - antal[a]! || a - b)
  const doldaLov = Math.max(0, behallna.length - Math.max(1, tak))
  behallna.length = Math.min(behallna.length, Math.max(1, tak))
  behallna.sort((a, b) => a - b)

  const tillLov = new Int32Array(stigar.length).fill(-1)
  const lov: Kolumnlov[] = []
  for (const i of behallna) {
    tillLov[i] = lov.length
    const stig = stigar[i]!
    lov.push({
      stig,
      nivaer: stig.map((h, n) => dimensioner[n]!.rubriker[h]!),
      rader: antal[i]!,
      ovriga: false,
    })
  }

  let ovrigaIndex = -1
  if (doldaLov > 0) {
    let rader = 0
    for (let i = 0; i < stigar.length; i++) if (tillLov[i] === -1) rader += antal[i]!
    ovrigaIndex = lov.length
    // Övriga-lövet har ingen stig — det är många stigar. Vyn ritar det som en
    // enda rubrik över alla våningar, och `nivaer: []` är det som säger det.
    lov.push({ stig: [], nivaer: [], rader, ovriga: true })
  }

  for (const r of med) {
    const i = tillLov[plats[r]!]!
    hink[r] = i >= 0 ? i : ovrigaIndex >= 0 ? ovrigaIndex : UTANFOR
  }

  return { hink, lov, dolda, doldaLov }
}

export function pivotera(frame: Frame, plan: Pivotplan): Pivotresultat {
  const normalisera = byggNormaliserare(plan.strunta)
  const utgangslage = plan.underlag === 'vyn' ? frame.view : identityView(frame.rowCount)
  // Filterrutans fält är vanliga filterregler, och det här är hela kostnaden
  // för dem: `tillampaFilter` lämnar tillbaka utgångsläget orört när inga
  // aktiva regler finns.
  const radkalla = tillampaFilter(frame, plan.filter, utgangslage).rader

  const raddim = plan.rader
    .map((id) => findColumn(frame, id))
    .filter((c): c is Column => c !== undefined)
    .map((col) => byggDimension(col, radkalla, normalisera, plan.radtak, plan.tommaMed))

  const koldim = plan.kolumner
    .map((id) => findColumn(frame, id))
    .filter((c): c is Column => c !== undefined)
    .map((col) => byggDimension(col, radkalla, normalisera, plan.kolumntak, plan.tommaMed))

  // Med ett enda kolumnfält *är* produkten fältet, och `kolumntak` har redan
  // gjort sitt. Lövtaket finns för att två korta fält inte ska ge hundra
  // spalter — inte för att köra över valet Spalter = 50.
  const lovtak = koldim.length <= 1 ? Number.POSITIVE_INFINITY : KOLUMNLOVTAK
  const axel = byggKolumnaxel(koldim, radkalla, frame.rowCount, lovtak)
  const kolumner = axel.lov
  // Nyckeln är fälten, inte löven: ett kolumnfält där varje rad saknar värde
  // ger noll löv, och då hör raderna hemma utanför — inte i Totalt som om
  // fältet aldrig funnits.
  const kolhink = koldim.length > 0 ? axel.hink : null
  const bredd = kolumner.length + 1
  const totalKol = bredd - 1
  const steg = Math.max(1, plan.matvarden.length)

  /*
   * Rader som saknar värde i någon dimension lämnas utanför.
   *
   * Grupperingen har den mildare regeln — den lämnar bara ut raden när *hela*
   * nyckeln är tom — men den skriver också ut nyckeln som en kolumn, där ett
   * tomt värde blir en tom cell man ser. En pivot har ingen sådan plats: en
   * rad utan ort har ingen radrubrik att stå på. Antingen får tomt vara ett
   * eget värde (`tommaMed`) eller så räknas raden inte, och då står det i
   * foten hur många det gällde.
   */
  const kvar: number[] = []
  let utanNyckel = 0
  for (let i = 0; i < radkalla.length; i++) {
    const r = radkalla[i]!
    let inne = kolhink === null || kolhink[r]! !== UTANFOR
    if (inne) {
      for (const d of raddim) {
        if (d.hink[r]! === UTANFOR) {
          inne = false
          break
        }
      }
    }
    if (inne) kvar.push(r)
    else utanNyckel += 1
  }

  /*
   * Sorteringen: kolumnhinken först, sedan raddimensionerna bakifrån.
   *
   * Räknesorteringen är stabil, så den sist körda nivån blir den yttersta.
   * Efter svepen ligger raderna grupperade på första raddimensionen, inom den
   * på den andra, och innerst på kolumnvärdet — vilket är precis den ordning
   * som gör varje **radband** till ett sammanhängande intervall.
   *
   * Observera att det gäller radbandet, inte (radband × kolumn). För en
   * lövrad är kolumnhinken den sista nyckeln och kolumnens rader ligger
   * mycket riktigt i följd, men för en delsummerad rad är de djupare
   * radfälten mer signifikanta — då ligger kolumnens rader utspridda i
   * bandet, en klunga per barn. `raknaBand` bryr sig inte, eftersom den
   * filtrerar per rad, och `radernaBakom` gör likadant.
   */
  let rader: Uint32Array = Uint32Array.from(kvar)
  if (kolhink) rader = sorteraNiva(rader, kolhink, kolumner.length)
  for (let i = raddim.length - 1; i >= 0; i--) {
    rader = sorteraNiva(rader, raddim[i]!.hink, raddim[i]!.rubriker.length)
  }

  /*
   * Kolumnhinken flyttad till platsordning.
   *
   * `kolhink` är indexerad med fysiskt radnummer och lever bara under
   * körningen. Den här är indexerad med plats i `rader`, alltså exakt så som
   * ett band läses, och är den enda av de två som är värd att spara: den är
   * så lång som antalet rader som kom med, inte som hela filen.
   */
  const kolumnband = kolhink === null ? null : new Uint32Array(rader.length)
  if (kolumnband && kolhink) {
    for (let k = 0; k < rader.length; k++) kolumnband[k] = kolhink[rader[k]!]!
  }

  const radlista: Pivotrad[] = []
  const celltext: (string | null)[] = []
  const celltal: number[] = []
  const lasbarhet: Lasbarhet[] = plan.matvarden.map((m) => ({ id: m.id, lasta: 0, ifyllda: 0 }))

  // Ackumulatorer per kolumn, återanvända över alla rader och mätvärden.
  const summa = new Float64Array(bredd)
  const raknade = new Uint32Array(bredd)
  const ifylldaPerKol = new Uint32Array(bredd)
  const bastKod = new Uint32Array(bredd)
  const bastRang = new Float64Array(bredd)

  /*
   * Stämpelfälten för `unika`, ett par per mätvärde och hela körningen igenom.
   *
   * Fältet nollställs genom att stämpeln räknas upp, aldrig genom att fältet
   * skrivs om — en ny mängd per cell hade kostat cellantalet gånger ordboken.
   * Två fält behövs eftersom en kod ska kunna vara sedd i sin kolumn och ändå
   * oräknad i totalen: samma kund i Malmö och i Lund är en kund, inte två.
   */
  const seddKol: (Uint32Array | null)[] = []
  const seddTot: (Uint32Array | null)[] = []
  for (const m of plan.matvarden) {
    const kall = m.typ === 'unika' && m.colId !== null ? findColumn(frame, m.colId) : undefined
    seddKol.push(kall ? new Uint32Array(kall.dict.length) : null)
    seddTot.push(kall ? new Uint32Array(kall.dict.length) : null)
  }
  let stampel = 0

  const skriv = (n: number): string => skrivTal(n, plan.format, plan.decimaler)

  /**
   * Ett mätvärdes celler för ett band av rader — inklusive Totalt-kolumnen.
   *
   * Totalt-kolumnen räknas i samma svep som de andra, inte som en summa av
   * dem. För `snitt` och `unika` är det skillnaden mellan rätt och fel svar.
   *
   * `bokfor` är sann bara för Totalt-raden, som täcker varje källrad exakt en
   * gång. Läsbarheten — ”3 av 16 gick att läsa som tal” — är ett påstående om
   * filen, inte om en cell, och skulle bli fel så många gånger om som det
   * finns rader om varje band fick räkna upp den.
   */
  const raknaBand = (
    mIndex: number,
    start: number,
    slut: number,
    bokfor: boolean,
    ut: (kol: number, text: string | null, tal: number) => void,
  ): void => {
    const m = plan.matvarden[mIndex]!
    const kall = m.colId === null ? undefined : findColumn(frame, m.colId)
    const las = lasbarhet[mIndex]!

    summa.fill(0)
    raknade.fill(0)
    ifylldaPerKol.fill(0)

    if (m.typ === 'antal') {
      for (let k = start; k < slut; k++) {
        const kol = kolhink ? kolhink[rader[k]!]! : totalKol
        raknade[kol]! += 1
        if (kol !== totalKol) raknade[totalKol]! += 1
      }
      for (let kol = 0; kol < bredd; kol++) {
        const n = raknade[kol]!
        ut(kol, n === 0 ? null : skriv(n), n === 0 ? Number.NaN : n)
      }
      return
    }

    // Ett mätvärde vars kolumn tagits bort ger tomma celler i stället för att
    // kasta — samma val som sorteringen gör för en borttagen nivå.
    if (!kall) {
      for (let kol = 0; kol < bredd; kol++) ut(kol, null, Number.NaN)
      return
    }

    switch (m.typ) {
      case 'summa':
      case 'snitt': {
        const tal = talnycklar(kall)
        for (let k = start; k < slut; k++) {
          const rad = rader[k]!
          const kod = kall.codes[rad]!
          if (kod === 0) continue
          const kol = kolhink ? kolhink[rad]! : totalKol
          ifylldaPerKol[kol]! += 1
          if (kol !== totalKol) ifylldaPerKol[totalKol]! += 1
          const v = tal[kod]!
          if (Number.isNaN(v)) continue
          summa[kol]! += v
          raknade[kol]! += 1
          if (kol !== totalKol) {
            summa[totalKol]! += v
            raknade[totalKol]! += 1
          }
        }
        for (let kol = 0; kol < bredd; kol++) {
          const n = raknade[kol]!
          // Noll läsbara värden ger tom cell, aldrig 0. En nolla man inte kan
          // skilja från ”inget att räkna på” är det fel som inte syns förrän
          // någon jämför mot facit.
          if (n === 0) {
            ut(kol, null, Number.NaN)
            continue
          }
          const v = m.typ === 'summa' ? summa[kol]! : summa[kol]! / n
          ut(kol, skriv(v), v)
        }
        break
      }

      case 'minsta':
      case 'storsta': {
        const { rang } = kolumnrang(kall)
        const talvarden = kall.type === 'number' ? talnycklar(kall) : null
        const minsta = m.typ === 'minsta'
        bastKod.fill(0)
        bastRang.fill(0)
        const prova = (kol: number, kod: number, rg: number): void => {
          if (bastKod[kol] === 0 || (minsta ? rg < bastRang[kol]! : rg > bastRang[kol]!)) {
            bastKod[kol] = kod
            bastRang[kol] = rg
          }
        }
        for (let k = start; k < slut; k++) {
          const rad = rader[k]!
          const kod = kall.codes[rad]!
          if (kod === 0) continue
          const kol = kolhink ? kolhink[rad]! : totalKol
          ifylldaPerKol[kol]! += 1
          if (kol !== totalKol) ifylldaPerKol[totalKol]! += 1
          const rg = rang[kod]!
          if (rg === TOM_RANG) continue
          raknade[kol]! += 1
          prova(kol, kod, rg)
          if (kol !== totalKol) {
            raknade[totalKol]! += 1
            prova(totalKol, kod, rg)
          }
        }
        for (let kol = 0; kol < bredd; kol++) {
          const kod = bastKod[kol]!
          if (kod === 0) {
            ut(kol, null, Number.NaN)
            continue
          }
          // Talet finns bara när värdet går att läsa som tal. Annars sorterar
          // och räknar vyn inte på cellen, och det är rätt: ett ortnamn är
          // ingen storhet.
          ut(kol, kall.dict[kod]!, talvarden ? talvarden[kod]! : Number.NaN)
        }
        break
      }

      case 'ifyllda':
      case 'unika': {
        const kolfalt = seddKol[mIndex] ?? null
        const totfalt = seddTot[mIndex] ?? null
        const bas = stampel + 1
        stampel += bredd
        for (let k = start; k < slut; k++) {
          const rad = rader[k]!
          const kod = kall.codes[rad]!
          if (kod === 0) continue
          const kol = kolhink ? kolhink[rad]! : totalKol
          ifylldaPerKol[kol]! += 1
          if (kol !== totalKol) ifylldaPerKol[totalKol]! += 1
          if (kolfalt === null || totfalt === null) {
            raknade[kol]! += 1
            if (kol !== totalKol) raknade[totalKol]! += 1
            continue
          }
          if (kolfalt[kod] !== bas + kol) {
            kolfalt[kod] = bas + kol
            raknade[kol]! += 1
          }
          if (kol !== totalKol && totfalt[kod] !== bas) {
            totfalt[kod] = bas
            raknade[totalKol]! += 1
          }
        }
        for (let kol = 0; kol < bredd; kol++) {
          ut(kol, skriv(raknade[kol]!), raknade[kol]!)
        }
        break
      }
    }

    if (bokfor) {
      las.ifyllda = ifylldaPerKol[totalKol]!
      las.lasta = raknade[totalKol]!
    }
  }

  const raknaRad = (start: number, slut: number, bokfor: boolean): void => {
    for (let kol = 0; kol < bredd; kol++) {
      for (let m = 0; m < steg; m++) {
        celltext.push(null)
        celltal.push(Number.NaN)
      }
    }
    const bas = celltext.length - bredd * steg
    for (let m = 0; m < plan.matvarden.length; m++) {
      raknaBand(m, start, slut, bokfor, (kol, text, tal) => {
        celltext[bas + kol * steg + m] = text
        celltal[bas + kol * steg + m] = tal
      })
    }
  }

  const sista = raddim.length - 1
  let kapat = false

  const emitera = (niva: number, start: number, slut: number, stig: number[]): void => {
    if (radlista.length >= MAXRADER) {
      kapat = true
      return
    }
    const etiketter: string[] = []
    for (let n = 0; n < raddim.length; n++) {
      const rubrik = n <= niva ? raddim[n]!.rubriker[stig[n]!] : undefined
      etiketter.push(rubrik ? rubrik.etikett : '')
    }
    const egen = raddim[niva]!.rubriker[stig[niva]!]!
    radlista.push({
      etiketter,
      niva,
      stig: stig.join('/'),
      antal: slut - start,
      ovriga: egen.ovriga,
      tom: egen.tom,
      start,
      slut,
    })
    raknaRad(start, slut, false)

    if (niva === sista) return
    const nasta = raddim[niva + 1]!
    let i = start
    while (i < slut) {
      const h = nasta.hink[rader[i]!]!
      let j = i + 1
      while (j < slut && nasta.hink[rader[j]!]! === h) j += 1
      emitera(niva + 1, i, j, [...stig, h])
      i = j
    }
  }

  if (raddim.length > 0) {
    const forsta = raddim[0]!
    let i = 0
    while (i < rader.length) {
      const h = forsta.hink[rader[i]!]!
      let j = i + 1
      while (j < rader.length && forsta.hink[rader[j]!]! === h) j += 1
      emitera(0, i, j, [h])
      i = j
    }
  }

  // Totalt-raden sist i matrisen, räknad över allt som kom med. Det är också
  // det enda svep som bokför läsbarheten, eftersom det ser varje rad en gång.
  raknaRad(0, rader.length, true)

  return {
    kolumner,
    kolumnnivaer: kolumner.length === 0 ? 0 : koldim.length,
    rader: radlista,
    bredd,
    hojd: radlista.length + 1,
    text: celltext,
    tal: Float64Array.from(celltal),
    kallrader: rader,
    kolumnband,
    antalKallrader: rader.length,
    utanNyckel,
    doldaRadvarden: raddim.reduce((s, d) => s + d.dolda, 0),
    doldaKolumnvarden: axel.dolda,
    doldaKolumnlov: axel.doldaLov,
    kapat,
    lasbarhet,
  }
}

/**
 * Planen pivoten öppnas med: fyra tomma rutor.
 *
 * Verktyget gissade förut en raddimension och ett mätvärde åt en. Det såg
 * hjälpsamt ut och var det inte: det man fick var någon annans fråga, och det
 * första man gjorde var att plocka bort den. Tomma rutor säger i stället
 * precis vad som ska hända — dra dit ett fält — och det som sedan står i
 * tabellen är det man själv bad om.
 */
export function tomPlan(): Pivotplan {
  return {
    rader: [],
    kolumner: [],
    matvarden: [],
    filter: TOMT_FILTER,
    strunta: { skiftlage: false, blanksteg: true, diakriter: false },
    tommaMed: false,
    underlag: 'hela',
    radtak: RADTAK,
    kolumntak: KOLUMNTAK,
    format: 'komma',
    decimaler: null,
  }
}

/**
 * Källraderna bakom en cell i matrisen — pivotens svar på *vilka*.
 *
 * `rad` är radens index i `resultat.rader`, eller `resultat.rader.length` för
 * Totalt-raden. `kol` är kolumnindexet, eller `resultat.bredd - 1` för
 * Totalt-kolumnen. Båda faller ut ur samma uttryck: Totalt-raden är hela
 * bandet, Totalt-kolumnen är ingen hinkfiltrering alls.
 *
 * **Raderna är de som räknades, inte de som ett filter skulle ha hittat.**
 * Frestelsen är att bygga ett `Filter` av radens etiketter och kolumnens
 * rubriker och köra det mot filen. Det svaret hade varit ett annat tal än det
 * som står i cellen, tyst, i fyra fall: Övriga bär bara ett antal och aldrig
 * vilka värden som vikts in; pivotens *(tomt)* rymmer värden som bara var
 * blanksteg medan filtrets `tom` bara matchar den tomma strängen; `strunta`
 * med skiftläge och diakriter har ingen motsvarighet i filtermotorn; och en
 * delsummerad rad kan inte uttrycka *och har ett värde i alla andra
 * dimensioner*. Bandet slipper alltihop genom att vara samma rader som talet
 * räknades ur.
 *
 * Filtrerar, skivar inte: i en delsummerad rad ligger kolumnens rader
 * utspridda i bandet, en klunga per barn.
 */
export function radernaBakom(resultat: Pivotresultat, rad: number, kol: number): Uint32Array {
  const post = resultat.rader[rad]
  const start = post ? post.start : 0
  const slut = post ? post.slut : resultat.kallrader.length
  const band = resultat.kolumnband
  // Totalt-kolumnen är ingen hink utan hela bandet — den räknas på samma sätt
  // i `raknaBand`, där varje rad skriver både i sin egen kolumn och i totalen.
  if (band === null || kol >= resultat.bredd - 1) {
    return resultat.kallrader.slice(start, slut)
  }
  const ut: number[] = []
  for (let k = start; k < slut; k++) {
    if (band[k] === kol) ut.push(resultat.kallrader[k]!)
  }
  return Uint32Array.from(ut)
}

/** En rubriks text på en nivå: värdet, eller det som står i stället för det. */
export function rubriktext(rubrik: Pivotrubrik, tomtext: string, ovrigatext: string): string {
  if (rubrik.ovriga) return ovrigatext
  if (rubrik.tom) return tomtext
  return rubrik.etikett
}

/**
 * Rubriken en pivotkolumn får där den bara får en rad text.
 *
 * Hela vägen genom kolumndimensionerna, inte det innersta värdet: `Aktiv ·
 * Sverige` säger vad spalten är, `Sverige` ensamt säger det inte när samma
 * land står under både Aktiv och Vilande.
 */
export function kolumnrubrik(lov: Kolumnlov, tomtext: string, ovrigatext: string): string {
  if (lov.ovriga) return ovrigatext
  return lov.nivaer.map((n) => rubriktext(n, tomtext, ovrigatext)).join(' · ')
}

/**
 * Pivoten som en vanlig flik.
 *
 * Bara lövraderna följer med, inte delsummorna, och ingen Totalt-rad. En
 * summarad i en datatabell är en fälla: nästa gång någon sorterar hamnar den
 * mitt i materialet, och nästa gång någon summerar räknas den två gånger.
 * Den som vill ha totalerna har dem i vyn, där de inte kan flytta på sig.
 */
export function pivotTillFrame(
  resultat: Pivotresultat,
  plan: Pivotplan,
  frame: Frame,
  namn: string,
  /**
   * Orden som inte är data: Totalt, tomt, Övriga — och mätvärdets namn, som
   * vyn översätter. Kärnan skriver svenska, och en flik som blandade engelska
   * rubriker med svenska mätvärden hade sett ut som ett fel.
   */
  texter: {
    totalt: string
    tomt: string
    ovriga: string
    matnamn?: (m: Berakning) => string
  },
): Frame {
  const raddim = plan.rader
    .map((id) => findColumn(frame, id))
    .filter((c): c is Column => c !== undefined)
  const sista = raddim.length - 1
  /*
   * Utan radfält finns bara Totalt-raden — och den är då hela svaret, inte en
   * summa av något annat. Den blir flikens enda rad. Utan mätvärden *och* utan
   * radfält finns ingenting att skriva, och fliken blir ärligt tom.
   */
  const lov: { i: number; etiketter: string[] }[] =
    raddim.length === 0
      ? plan.matvarden.length === 0
        ? []
        : [{ i: resultat.rader.length, etiketter: [] }]
      : resultat.rader
          .map((rad, i) => ({ i, etiketter: rad.etiketter, niva: rad.niva }))
          .filter((rad) => rad.niva === sista)
  const antalRader = lov.length

  const kolumner: Column[] = []
  const tagna: string[] = []
  const ny = (rubrik: string): Column => {
    const n = uniqueColumnName(tagna, rubrik)
    tagna.push(n)
    return createColumn(n, antalRader)
  }

  for (let n = 0; n < raddim.length; n++) {
    const col = ny(raddim[n]!.name)
    for (let r = 0; r < antalRader; r++) {
      col.codes[r] = intern(col, lov[r]!.etiketter[n] ?? '')
    }
    col.type = raddim[n]!.type
    col.typeLocked = raddim[n]!.typeLocked
    kolumner.push(col)
  }

  const enda = plan.matvarden.length === 1
  const steg = Math.max(1, plan.matvarden.length)
  for (let kol = 0; kol < resultat.bredd; kol++) {
    const rubrik = resultat.kolumner[kol]
    const kolnamn =
      rubrik === undefined
        ? texter.totalt
        : kolumnrubrik(rubrik, texter.tomt, texter.ovriga)
    for (let m = 0; m < plan.matvarden.length; m++) {
      const mv = plan.matvarden[m]!
      const matnamn = texter.matnamn ? texter.matnamn(mv) : berakningsnamn(mv, frame)
      const col = ny(enda ? kolnamn : `${kolnamn} · ${matnamn}`)
      for (let r = 0; r < antalRader; r++) {
        const bas = (lov[r]!.i * resultat.bredd + kol) * steg + m
        col.codes[r] = intern(col, resultat.text[bas] ?? '')
      }
      kolumner.push(col)
    }
  }

  inferAllTypes(kolumner)

  return {
    id: newFrameId(),
    name: namn,
    columns: kolumner,
    rowCount: antalRader,
    view: identityView(antalRader),
    // Radnummer 0 betyder ”fanns inte i filen”, och det stämmer: en pivotrad
    // är många rader och ingen av dem.
    sourceRow: new Uint32Array(antalRader),
    meta: { warnings: [] },
  }
}

/**
 * Förslag på namn för fliken pivoten skapar.
 *
 * `per` och `pivot` är de två orden i namnet som inte är data, och de kommer
 * från vyn så att namnet talar samma språk som resten av fliken.
 */
export function pivotnamn(
  frame: Frame,
  plan: Pivotplan,
  ord: { per: string; pivot: string } = { per: 'per', pivot: 'pivot' },
): string {
  const rad = plan.rader
    .map((id) => findColumn(frame, id)?.name)
    .filter((n): n is string => n !== undefined)
  const kol = plan.kolumner
    .map((id) => findColumn(frame, id)?.name)
    .filter((n): n is string => n !== undefined)
  if (rad.length === 0 && kol.length === 0) return `${frame.name} – ${ord.pivot}`
  if (kol.length === 0) return `${frame.name} ${ord.per} ${rad.join(', ')}`
  if (rad.length === 0) return `${frame.name} ${ord.per} ${kol.join(', ')}`
  return `${frame.name} ${ord.per} ${rad.join(', ')} × ${kol.join(', ')}`
}
