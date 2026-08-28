import type { Column, ColumnId, Frame } from '../types.js'
import { findColumn } from '../frame/frame.js'
import { getCell } from '../frame/column.js'
import { normalizeAlways, stripDiacritics } from '../locale/sv.js'
import { delaEpost } from './email.js'

/**
 * Matchning av två filer.
 *
 * **Alla matchningstyper här är ekvivalensrelationer**, och det är inte en
 * begränsning av bekvämlighet utan av storleksordning. En hashjoin kostar
 * O(n + m); att i stället jämföra varje rad mot varje rad — vilket är vad
 * "börjar med", "innehåller" och luddig matchning kräver — kostar O(n · m).
 * Två filer med 100 000 rader vardera blir tio miljarder jämförelser, alltså
 * inte en långsam funktion utan en som aldrig blir klar.
 *
 * De osymmetriska och luddiga typerna hör därför hemma i restlistan, där
 * antalet rader är litet och varje förslag ändå ska granskas för hand.
 *
 * **Tomma nycklar matchar aldrig.** Två rader som båda saknar personnummer
 * är inte samma person. Utan den regeln skulle alla ofullständiga rader falla
 * ihop i en enda jättegrupp, vilket är den värsta sortens fel: det ser ut som
 * att matchningen lyckats.
 */

export type Matchningstyp =
  | 'exakt'
  | 'oberoende'
  | 'accentoberoende'
  | 'epostNamn'
  | 'siffror'
  | 'namndelar'

export interface Matchningstypspost {
  typ: Matchningstyp
  etikett: string
  beskrivning: string
  /** Typen läser två kolumner på högersidan i stället för en. */
  tvaHoger?: boolean
}

export const MATCHNINGSTYPER: Matchningstypspost[] = [
  {
    typ: 'oberoende',
    etikett: 'Vanlig',
    beskrivning: 'Struntar i versaler och extra blanksteg. Passar de flesta textkolumner.',
  },
  {
    typ: 'exakt',
    etikett: 'Teckenexakt',
    beskrivning: 'Varje tecken måste stämma. Använd för id-kolumner där skiftläget betyder något.',
  },
  {
    typ: 'accentoberoende',
    etikett: 'Utan å ä ö',
    beskrivning: 'Struntar också i prickarna. Öberg matchar Oberg — men även För matchar For.',
  },
  {
    typ: 'siffror',
    etikett: 'Bara siffror',
    beskrivning: 'Allt utom siffror skalas bort. Passar telefonnummer och organisationsnummer.',
  },
  {
    typ: 'namndelar',
    etikett: 'Namn mot förnamn + efternamn',
    tvaHoger: true,
    beskrivning:
      'Jämför en kolumn med hela namnet mot två kolumner som har förnamn och efternamn var för sig. Orden sorteras, så Karlsson Anna matchar Anna Karlsson. Båda delarna måste vara ifyllda.',
  },
  {
    typ: 'epostNamn',
    etikett: 'E-post mot namn',
    beskrivning:
      'Läser förnamn och efternamn ur adressen och jämför med en namnkolumn. Prickarna stryks, eftersom adressen aldrig har dem.',
  },
]

export interface Matchningspar {
  vansterColId: ColumnId
  hogerColId: ColumnId
  /**
   * Andra högerkolumnen, för typer som läser två.
   *
   * Bara `namndelar` använder den. Att lägga den som ett valfritt fält i
   * stället för en egen partyp håller resten av kedjan orörd: matchningen är
   * fortfarande en ekvivalensrelation, och hashjoinen vet inte om skillnaden.
   */
  hogerColId2?: ColumnId
  typ: Matchningstyp
}

/** Typer som kräver en andra högerkolumn. */
export function kraverTvaHoger(typ: Matchningstyp): boolean {
  return MATCHNINGSTYPER.find((t) => t.typ === typ)?.tvaHoger === true
}

/**
 * Nyckeldelarna sammanfogas med ett tecken som inte kan förekomma i data.
 *
 * Exporterad för att gränssnittet ska kunna dela en nyckel i sina delar och
 * visa den normaliserade formen per kolumnpar. Att se att `Öberg` blir
 * `oberg` säger mer om vad en matchningstyp gör än någon beskrivning gör.
 */
export const NYCKELAVSKILJARE = '\u0000'

function normalisera(value: string, typ: Matchningstyp): string {
  const v = normalizeAlways(value).trim()
  if (v === '') return ''

  switch (typ) {
    case 'exakt':
      return v
    case 'oberoende':
      return v.replace(/\s+/g, ' ').toLocaleLowerCase('sv')
    case 'accentoberoende':
      return stripDiacritics(v.replace(/\s+/g, ' ')).toLocaleLowerCase('sv')
    case 'siffror': {
      const siffror = v.replace(/\D/g, '')
      return siffror
    }
    case 'namndelar':
      // Orden sorteras så att ordningen inte spelar roll: ”Karlsson Anna”
      // och ”Anna Karlsson” är samma namn. Prickarna behålls — Öberg och
      // Oberg är två namn, och den som vill slå ihop dem har `Utan å ä ö`.
      return v.replace(/\s+/g, ' ').toLocaleLowerCase('sv').split(' ').sort().join(' ')
    case 'epostNamn': {
      // En e-postkolumn ger namnet ur adressen; en namnkolumn ger sig själv.
      // Båda sidor stryks på prickar, eftersom adressen aldrig kan bära dem.
      const del = delaEpost(v)
      const bas = del && del.fornamn !== '' ? `${del.fornamn} ${del.efternamn}`.trim() : v
      return stripDiacritics(bas.replace(/\s+/g, ' ')).toLocaleLowerCase('sv')
    }
  }
}

/**
 * Nyckel per rad, räknad en gång per unikt värde och kolumn.
 *
 * Returnerar tom sträng för rader vars nyckel inte går att använda — alltså
 * där någon del är tom. Anroparen ska då hoppa över raden helt.
 */
export function byggNycklar(
  frame: Frame,
  par: readonly Matchningspar[],
  sida: 'vanster' | 'hoger',
): string[] {
  const kolumner = par.map((p) => ({
    col: findColumn(frame, sida === 'vanster' ? p.vansterColId : p.hogerColId),
    // Andra kolumnen finns bara på högersidan och bara för de typer som
    // läser två. Vänstersidan har alltid en kolumn per par.
    col2:
      sida === 'hoger' && kraverTvaHoger(p.typ) && p.hogerColId2 !== undefined
        ? findColumn(frame, p.hogerColId2)
        : undefined,
    tvaKravs: sida === 'hoger' && kraverTvaHoger(p.typ),
    typ: p.typ,
  }))

  // En tabell per kolumn: ordbokskod → normaliserad nyckeldel.
  const tabeller = kolumner.map(({ col, col2, tvaKravs, typ }) => {
    if (!col) return null
    // Kräver typen två kolumner och den andra saknas är paret obrukbart.
    if (tvaKravs && !col2) return null
    const ut = new Array<string>(col.dict.length)
    for (let kod = 0; kod < col.dict.length; kod++) ut[kod] = normalisera(col.dict[kod]!, typ)
    if (!col2) return { col, ut, col2: undefined, ut2: undefined }
    const ut2 = new Array<string>(col2.dict.length)
    for (let kod = 0; kod < col2.dict.length; kod++) ut2[kod] = normalisera(col2.dict[kod]!, typ)
    return { col, ut, col2, ut2 }
  })

  const nycklar = new Array<string>(frame.rowCount)
  for (let r = 0; r < frame.rowCount; r++) {
    let nyckel = ''
    let anvandbar = tabeller.length > 0
    for (let i = 0; i < tabeller.length; i++) {
      const t = tabeller[i]
      if (!t) {
        anvandbar = false
        break
      }
      let del = t.ut[t.col.codes[r]!]!
      if (t.col2 && t.ut2) {
        const del2 = t.ut2[t.col2.codes[r]!]!
        // Båda delarna måste finnas. Ett efternamn som saknas skulle annars
        // låta ”Anna” matcha vilken Anna som helst — samma fel som en tom
        // nyckel, bara svårare att se.
        if (del === '' || del2 === '') {
          anvandbar = false
          break
        }
        // Delarna är redan normaliserade var för sig; hopslagningen sorterar
        // om orden så att resultatet blir detsamma som för hela namnet.
        del = `${del} ${del2}`.split(' ').sort().join(' ')
      }
      if (del === '') {
        anvandbar = false
        break
      }
      nyckel = i === 0 ? del : nyckel + NYCKELAVSKILJARE + del
    }
    nycklar[r] = anvandbar ? nyckel : ''
  }
  return nycklar
}

export interface Matchning {
  /** Träffarna, som par av fysiska radindex. */
  par: { v: number; h: number }[]
  /** Vänsterrader utan träff, i filens ordning. */
  vansterUtan: number[]
  /** Högerrader utan träff. */
  hogerUtan: number[]
  /** Antal vänsterrader med minst en träff. */
  vansterMatchade: number
  hogerMatchade: number
  /** Vänsterrader som matchar mer än en högerrad. Kardinaliteten. */
  vansterFlera: number
  /** Högerrader som träffas av mer än en vänsterrad. */
  hogerFlera: number
  /** Rader vars nyckel är tom och som därför aldrig kan matcha. */
  tommaVanster: number
  tommaHoger: number
  /** Största antalet högerrader en enda vänsterrad matchar. */
  storstaTraff: number
}

/**
 * Delad konstant, och `matcha` returnerar den direkt när inga kolumnpar valts.
 * En anropare får därför aldrig mutera en `Matchning` den fått tillbaka.
 */
export const TOM_MATCHNING: Matchning = {
  par: [],
  vansterUtan: [],
  hogerUtan: [],
  vansterMatchade: 0,
  hogerMatchade: 0,
  vansterFlera: 0,
  hogerFlera: 0,
  tommaVanster: 0,
  tommaHoger: 0,
  storstaTraff: 0,
}

/**
 * Rader att begränsa matchningen till.
 *
 * En utelämnad sida betyder alla rader; en tom lista betyder inga. Indexen som
 * kommer ut är fysiska även med urval, och räknarna räknar inom urvalet. Det
 * är precis vad en ny runda på restlistan behöver, och därför slipper den både
 * delramar och indexöversättning.
 *
 * Urvalet förutsätts vara i stigande ordning — restlistorna är det.
 */
export interface Urval {
  vansterRader?: readonly number[]
  hogerRader?: readonly number[]
}

/**
 * Matchar två ramar på ett eller flera kolumnpar.
 *
 * Hashjoin: högersidan indexeras en gång, sedan sveps vänstersidan. Siffrorna
 * som faller ut — hur många som matchar, hur många som matchar flera, hur
 * många som har tom nyckel — är hela poängen med att räkna före körningen.
 * Ett par kolumner som ger 3 träffar av 5 000 rader är nästan alltid fel
 * kolumnpar, inte fel data.
 *
 * Nycklarna räknas alltid över hela ordboken, även med urval: kostnaden följer
 * antalet unika värden och inte antalet rader, så det finns inget att spara på
 * att räkna dem för färre rader.
 */
export function matcha(
  vanster: Frame,
  hoger: Frame,
  par: readonly Matchningspar[],
  urval?: Urval,
): Matchning {
  if (par.length === 0) return TOM_MATCHNING

  const vNycklar = byggNycklar(vanster, par, 'vanster')
  const hNycklar = byggNycklar(hoger, par, 'hoger')

  const vRader = urval?.vansterRader
  const hRader = urval?.hogerRader
  const antalV = vRader ? vRader.length : vanster.rowCount
  const antalH = hRader ? hRader.length : hoger.rowCount

  const index = new Map<string, number[]>()
  let tommaHoger = 0
  for (let i = 0; i < antalH; i++) {
    const r = hRader ? hRader[i]! : i
    const nyckel = hNycklar[r]
    if (nyckel === undefined) continue
    if (nyckel === '') {
      tommaHoger += 1
      continue
    }
    const lista = index.get(nyckel)
    if (lista) lista.push(r)
    else index.set(nyckel, [r])
  }

  const resultat: { v: number; h: number }[] = []
  const vansterUtan: number[] = []
  const hogerTraffad = new Uint32Array(hoger.rowCount)
  let tommaVanster = 0
  let vansterMatchade = 0
  let vansterFlera = 0
  let storstaTraff = 0

  for (let i = 0; i < antalV; i++) {
    const r = vRader ? vRader[i]! : i
    const nyckel = vNycklar[r]
    if (nyckel === undefined) continue
    if (nyckel === '') {
      tommaVanster += 1
      vansterUtan.push(r)
      continue
    }
    const traffar = index.get(nyckel)
    if (!traffar) {
      vansterUtan.push(r)
      continue
    }
    vansterMatchade += 1
    if (traffar.length > 1) vansterFlera += 1
    if (traffar.length > storstaTraff) storstaTraff = traffar.length
    for (const h of traffar) {
      resultat.push({ v: r, h })
      hogerTraffad[h]! += 1
    }
  }

  const hogerUtan: number[] = []
  let hogerMatchade = 0
  let hogerFlera = 0
  for (let i = 0; i < antalH; i++) {
    const r = hRader ? hRader[i]! : i
    const n = hogerTraffad[r]!
    if (n === 0) hogerUtan.push(r)
    else {
      hogerMatchade += 1
      if (n > 1) hogerFlera += 1
    }
  }

  return {
    par: resultat,
    vansterUtan,
    hogerUtan,
    vansterMatchade,
    hogerMatchade,
    vansterFlera,
    hogerFlera,
    tommaVanster,
    tommaHoger,
    storstaTraff,
  }
}

/**
 * Lägger handgjorda par till en matchning och räknar om de härledda talen.
 *
 * Verkstaden bygger sin matchning så här: grundmatchningen plus de par som
 * betats fram för hand, i rundor och ur förslagen. Resultatet är en vanlig
 * `Matchning` som `slaIhop` tar emot utan att veta något om verkstaden.
 *
 * `tommaVanster` och `tommaHoger` följer med oförändrade — de är en egenskap
 * hos nycklarna, inte hos paren. En rad med tom nyckel kan mycket väl paras
 * för hand, och den är fortfarande en rad som aldrig kunde matcha av sig själv.
 */
export function slaSamman(
  bas: Matchning,
  extra: readonly { v: number; h: number }[],
  vanster: Frame,
  hoger: Frame,
): Matchning {
  if (extra.length === 0) return bas

  const sedda = new Set<string>()
  const par: { v: number; h: number }[] = []
  for (const p of bas.par) {
    sedda.add(`${p.v}:${p.h}`)
    par.push({ v: p.v, h: p.h })
  }
  for (const p of extra) {
    const nyckel = `${p.v}:${p.h}`
    if (sedda.has(nyckel)) continue
    sedda.add(nyckel)
    par.push({ v: p.v, h: p.h })
  }
  // Samma ordning som en hashjoin ger, så att "ta den första" betyder första
  // träffen i den andra filens ordning även för de tillagda paren.
  par.sort((a, b) => a.v - b.v || a.h - b.h)

  const vAntal = new Uint32Array(vanster.rowCount)
  const hAntal = new Uint32Array(hoger.rowCount)
  for (const p of par) {
    if (p.v < vanster.rowCount) vAntal[p.v]! += 1
    if (p.h < hoger.rowCount) hAntal[p.h]! += 1
  }

  const vansterUtan: number[] = []
  let vansterMatchade = 0
  let vansterFlera = 0
  let storstaTraff = 0
  for (let r = 0; r < vanster.rowCount; r++) {
    const n = vAntal[r]!
    if (n === 0) {
      vansterUtan.push(r)
      continue
    }
    vansterMatchade += 1
    if (n > 1) vansterFlera += 1
    if (n > storstaTraff) storstaTraff = n
  }

  const hogerUtan: number[] = []
  let hogerMatchade = 0
  let hogerFlera = 0
  for (let r = 0; r < hoger.rowCount; r++) {
    const n = hAntal[r]!
    if (n === 0) {
      hogerUtan.push(r)
      continue
    }
    hogerMatchade += 1
    if (n > 1) hogerFlera += 1
  }

  return {
    par,
    vansterUtan,
    hogerUtan,
    vansterMatchade,
    hogerMatchade,
    vansterFlera,
    hogerFlera,
    tommaVanster: bas.tommaVanster,
    tommaHoger: bas.tommaHoger,
    storstaTraff,
  }
}

/** Hur en vänsterrad med flera träffar ska hanteras. */
export type Flertraff = 'forsta' | 'duplicera' | 'lamna'

export const FLERTRAFF: { varde: Flertraff; etikett: string; beskrivning: string }[] = [
  {
    varde: 'forsta',
    etikett: 'Ta den första',
    beskrivning: 'Första träffen i den andra filens ordning. Resten ignoreras.',
  },
  {
    varde: 'duplicera',
    etikett: 'En rad per träff',
    beskrivning: 'Raden upprepas, en gång för varje träff. Filen blir längre.',
  },
  {
    varde: 'lamna',
    etikett: 'Lämna tom',
    beskrivning: 'Osäkra rader lämnas ofyllda och hamnar i restlistan för granskning.',
  },
]

export interface Sammanslagning {
  /** Kolumner ur högerfilen som ska följa med, i ordning. */
  hogerKolumner: ColumnId[]
  flertraff: Flertraff
  /** Prefix på de nya kolumnnamnen, t.ex. "Fil 2 – ". Tomt för inget. */
  prefix: string
}

export interface Resultat {
  frame: Frame
  /** Antal rader i resultatet som fick värden ur högerfilen. */
  fyllda: number
  /** Antal resultatrader, som kan skilja sig från vänsterfilens vid duplicering. */
  rader: number
}

/**
 * Vänsterrader som en förhandsvisning ska byggas av.
 *
 * De första N raderna duger inte. Råkar de alla ha träff ser resultatet
 * felfritt ut; råkar ingen ha det ser det ut som att filerna inte hör ihop.
 * Båda intrycken är fel, och båda uppstår av ren slump i vilken ände filen
 * råkar börja.
 *
 * Urvalet tar därför träffar och icke-träffar i **den proportion de faktiskt
 * har**, men aldrig så att någon sida försvinner helt när den finns: en enda
 * omatchad rad bland tusen ska synas i förhandsvisningen, eftersom det är den
 * raden man behöver upptäcka. Resultatet står i filens ordning, så att raderna
 * går att känna igen mot rutnätet.
 */
export function forhandsurval(matchning: Matchning, tak: number): number[] {
  if (tak <= 0) return []

  // `par` byggs genom att svepa vänsterraderna i ordning, så de unika
  // vänsterraderna faller ut stigande utan att behöva sorteras.
  const matchade: number[] = []
  let forra = -1
  for (const { v } of matchning.par) {
    if (v !== forra) {
      matchade.push(v)
      forra = v
    }
  }
  const utan = matchning.vansterUtan

  if (matchade.length === 0) return utan.slice(0, tak)
  if (utan.length === 0) return matchade.slice(0, tak)

  const totalt = matchade.length + utan.length
  // Minst en av varje så länge båda finns, och minst en av varje så länge
  // taket räcker till det.
  let antalMatchade = Math.round((tak * matchade.length) / totalt)
  antalMatchade = Math.min(Math.max(antalMatchade, 1), Math.max(1, tak - 1))
  antalMatchade = Math.min(antalMatchade, matchade.length)
  let antalUtan = Math.min(tak - antalMatchade, utan.length)
  // Räcker inte den ena sidan till får den andra ta över det som blev över.
  antalMatchade = Math.min(tak - antalUtan, matchade.length)

  const valda = [...matchade.slice(0, antalMatchade), ...utan.slice(0, antalUtan)]
  valda.sort((a, b) => a - b)
  return valda
}

/**
 * Bygger den sammanslagna ramen.
 *
 * Vänsterfilen är stommen: alla dess rader följer med, även de utan träff.
 * Det är den enda varianten som aldrig tappar data i tysthet — rader som
 * inte matchade blir synliga som tomma celler i stället för att försvinna,
 * och högerfilens omatchade rader hamnar i restlistan.
 *
 * `vansterRader` begränsar bygget till ett urval, i den ordning urvalet står.
 * Det är samma begrepp som `matcha`s `Urval` och `stapla`s `Kalla.rader`, och
 * finns av samma skäl: en förhandsvisning ska räknas med *samma* funktion som
 * körningen, bara på färre rader. En egen förhandsvisningsfunktion vore en
 * andra sanning som förr eller senare säger något annat än knappen gör.
 *
 * Med urval beskriver `fyllda` och `rader` bara urvalet — inte vad en
 * fullständig körning skulle ge.
 */
export function slaIhop(
  vanster: Frame,
  hoger: Frame,
  matchning: Matchning,
  val: Sammanslagning,
  vansterRader?: readonly number[],
): Resultat {
  const hogerKolumner = val.hogerKolumner
    .map((id) => findColumn(hoger, id))
    .filter((c): c is Column => c !== undefined)

  // Träffarna per vänsterrad, i högerfilens ordning.
  const traffar = new Map<number, number[]>()
  for (const { v, h } of matchning.par) {
    const lista = traffar.get(v)
    if (lista) lista.push(h)
    else traffar.set(v, [h])
  }

  // Vilka (vänsterrad, högerrad) resultatet ska bestå av. null = ingen träff.
  const plan: { v: number; h: number | null }[] = []
  const kallrader = vansterRader ?? null
  const antalKallrader = kallrader ? kallrader.length : vanster.rowCount
  for (let i = 0; i < antalKallrader; i++) {
    const r = kallrader ? kallrader[i]! : i
    const lista = traffar.get(r)
    if (!lista || lista.length === 0) {
      plan.push({ v: r, h: null })
    } else if (lista.length === 1) {
      plan.push({ v: r, h: lista[0]! })
    } else if (val.flertraff === 'duplicera') {
      for (const h of lista) plan.push({ v: r, h })
    } else if (val.flertraff === 'forsta') {
      plan.push({ v: r, h: lista[0]! })
    } else {
      plan.push({ v: r, h: null })
    }
  }

  const antal = plan.length
  const namn = new Set(vanster.columns.map((c) => c.name))
  const kolumner: Column[] = []

  // Vänsterkolumnerna kopieras rad för rad enligt planen, eftersom en rad kan
  // förekomma flera gånger vid duplicering.
  for (const col of vanster.columns) {
    const ny = kopieraColumn(col, antal, (i) => plan[i]!.v)
    kolumner.push(ny)
  }

  for (const col of hogerKolumner) {
    const onskat = `${val.prefix}${col.name}`
    let unikt = onskat
    let n = 2
    while (namn.has(unikt)) {
      unikt = `${onskat} (${n})`
      n += 1
    }
    namn.add(unikt)
    const ny = kopieraColumn(col, antal, (i) => plan[i]!.h, unikt)
    kolumner.push(ny)
  }

  const frame: Frame = {
    id: `f${Math.round(antal)}-${vanster.id}-${hoger.id}`,
    name: `${vanster.name} + ${hoger.name}`,
    columns: kolumner,
    rowCount: antal,
    view: Uint32Array.from({ length: antal }, (_, i) => i),
    // Radnumret pekar på vänsterfilen: det är den som är stommen.
    sourceRow: Uint32Array.from(plan, (p) => vanster.sourceRow[p.v] ?? p.v + 1),
    meta: { warnings: [] },
  }

  let fyllda = 0
  for (const p of plan) if (p.h !== null) fyllda += 1

  return { frame, fyllda, rader: antal }
}

/**
 * Kopierar en kolumn enligt en radplan.
 *
 * Ordboken följer med som den är och bara koderna skrivs om, så kostnaden
 * följer antalet rader och inte antalet tecken. En rad utan källa (`null`)
 * blir tom.
 */
function kopieraColumn(
  kalla: Column,
  antal: number,
  radFor: (i: number) => number | null,
  nyttNamn?: string,
): Column {
  const dict = kalla.dict.slice()
  const dictIndex = new Map(kalla.dictIndex)
  const codes = new Uint32Array(antal)
  const flags = new Uint8Array(antal)
  for (let i = 0; i < antal; i++) {
    const r = radFor(i)
    if (r === null) continue
    codes[i] = kalla.codes[r]!
    flags[i] = kalla.flags[r]!
  }
  return {
    id: `c${nyttNamn ?? kalla.name}-${Math.random().toString(36).slice(2, 8)}`,
    name: nyttNamn ?? kalla.name,
    type: kalla.type,
    typeLocked: kalla.typeLocked,
    hidden: false,
    width: kalla.width,
    dict,
    dictIndex,
    codes,
    flags,
  }
}

/** Läser en cell ur en ram, för restlistans förslag. */
export function cellText(frame: Frame, colId: ColumnId, row: number): string {
  const col = findColumn(frame, colId)
  return col ? getCell(col, row) : ''
}
