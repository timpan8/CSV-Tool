import { effect, signal } from '@preact/signals'
import {
  matcha,
  slaSamman,
  type Matchning,
  type Matchningspar,
  type Sammanslagning,
  TOM_MATCHNING,
} from '../core/ops/match.js'
import { notify, tabs, type Tab } from './store.js'
import { laddaSession, lagringsfel, sparaSession } from './lagring.js'
import { findColumn } from '../core/frame/frame.js'
import type { ColumnId, Frame } from '../core/types.js'

/**
 * Matchningsverkstaden: sessionen som betar av restlistorna.
 *
 * Den spänner över två flikar och hör därför inte hemma i en `Tab`. Vad den
 * håller reda på är inte data utan *arbete*: vilka par användaren gjort för
 * hand, vilka förslag som avvisats, och vilka rader som skrivits av.
 *
 * **Fysiska radindex är sessionens valuta**, samma som `Matchning.par`,
 * `vansterUtan` och `hogerUtan` redan talar. Det är därför den måste veta när
 * raderna numrerats om — se `synkaVerkstad`.
 */

export type Parkalla = 'runda' | 'forslag' | 'hand'

/** Ett par som verkstaden lagt till utöver den automatiska matchningen. */
export interface Extrapar {
  v: number
  h: number
  kalla: Parkalla
  /** Kort förklaring att visa i listan: "runda 2", "89 % lika", "för hand". */
  notis: string
}

export interface Runda {
  par: Matchningspar[]
  traffar: number
}

export interface Verkstad {
  vansterTabId: string
  hogerTabId: string
  /**
   * Ramarnas id, som identitetskontroll.
   *
   * Flik-id räcker inte ensamt över en omladdning. Radformssignaturen räcker
   * inte heller: den hashar radantal och `sourceRow`, och en nyinläst fil har
   * alltid `sourceRow = 1..n` — två helt orelaterade filer med lika många
   * rader får därför identisk signatur. Ram-id:t är det enda som säger att det
   * är *samma* fil, och det överlever en omladdning genom `serializeFrame`.
   */
  vansterFrameId: string
  hogerFrameId: string
  /** Filnamnen som de såg ut när sessionen började. För menyn, även när
   *  fliken är stängd och namnet inte går att slå upp längre. */
  vansterNamn: string
  hogerNamn: string
  /**
   * Hur många gånger sessionen körts.
   *
   * Varje körning skapar en **ny** flik — en färdig resultatflik skrivs aldrig
   * i, och det är hela skälet att sessionen får leva vidare utan att bryta mot
   * regeln i `Verkstad.tsx`. Numret skiljer flikarna åt så att man ser vilken
   * som är den senaste.
   */
  omgangar: number
  /** Grundparen från dialogen. */
  par: Matchningspar[]
  sammanslagning: Sammanslagning
  extra: Extrapar[]
  /** Par användaren sagt nej till, som `${v}:${h}`. */
  avvisade: Set<string>
  avskrivnaVanster: Set<number>
  avskrivnaHoger: Set<number>
  rundor: Runda[]
  /** Radformen på vardera sidan när radindexen senast stämde. */
  vansterForm: Radform
  hogerForm: Radform
}

/**
 * Tabellens radform: vilka rader som finns och i vilken ordning.
 *
 * Två fält med olika roller. `sourceRow` är arrayobjektet — `rebuildRows`
 * byter alltid ut hela arrayen, så samma objekt betyder *säkert* oförändrad
 * radform och kostar en jämförelse. `signatur` är en hash över innehållet och
 * behövs bara när objektet bytts: den svarar på om bytet betydde något.
 */
export interface Radform {
  sourceRow: Uint32Array
  signatur: number
}

/**
 * Sessionen. Den lever längre än vyn.
 *
 * Att stänga vyn kastade förut arbetet, och en körning gjorde det innan
 * resultatfliken ens fanns — trettio handgjorda par kunde försvinna på ett
 * Escape. De två sakerna skiljs nu åt: `verkstadOppen` säger om vyn visas,
 * den här signalen om det finns något att visa.
 */
export const verkstad = signal<Verkstad | null>(null)

/** Om vyn är uppe. Sant betyder alltid att `verkstad` också finns. */
export const verkstadOppen = signal(false)

export interface Verkstadsflikar {
  vanster: Tab
  hoger: Tab
}

/** Flikarna sessionen arbetar med, eller null om någon av dem stängts. */
export function flikarna(): Verkstadsflikar | null {
  const s = verkstad.value
  if (!s) return null
  const vanster = tabs.value.find((t) => t.id === s.vansterTabId)
  const hoger = tabs.value.find((t) => t.id === s.hogerTabId)
  if (!vanster || !hoger) return null
  // Ram-id:t är kontrollen. Ett flik-id kan i värsta fall peka på en annan fil
  // än den sessionen började med, och då är varje radindex i sessionen fel.
  if (vanster.frame.id !== s.vansterFrameId || hoger.frame.id !== s.hogerFrameId) return null
  return { vanster, hoger }
}

/**
 * Hur mycket arbete som bara finns i sessionen.
 *
 * Paren, avvisningarna och avskrivningarna hör ingen annanstans hemma — de
 * går inte att räkna fram på nytt ur filerna. Talet är därför måttet på vad
 * som går förlorat, och det räknas på ett ställe så att frågan innan man
 * kastar och frågan innan man skriver över säger samma sak.
 */
export function ogjortArbete(s: Verkstad): number {
  return s.extra.length + s.avvisade.size + s.avskrivnaVanster.size + s.avskrivnaHoger.size
}

/** Vad menyn och paletten behöver veta om den parkerade sessionen. */
export type Sessionslage =
  | { lage: 'ingen' }
  | { lage: 'stangd'; namn: string; ogjort: number }
  | { lage: 'redo'; namn: string; ogjort: number }

/**
 * Sessionens läge, som ett svar i stället för tre.
 *
 * "Ingen session" och "sessionens fil är stängd" är två helt olika saker, och
 * att svara `null` på båda vore att säga tomt när det är saknat. Det andra
 * läget kostar användaren sitt arbete, och då ska hen få veta varför.
 */
export function sessionslage(): Sessionslage {
  const s = verkstad.value
  if (!s) return { lage: 'ingen' }
  const namn = `${s.vansterNamn} ↔ ${s.hogerNamn}`
  const ogjort = ogjortArbete(s)
  return flikarna() ? { lage: 'redo', namn, ogjort } : { lage: 'stangd', namn, ogjort }
}

export function oppnaVerkstad(
  vanster: Tab,
  hoger: Tab,
  par: Matchningspar[],
  sammanslagning: Sammanslagning,
): void {
  verkstad.value = {
    vansterTabId: vanster.id,
    hogerTabId: hoger.id,
    vansterFrameId: vanster.frame.id,
    hogerFrameId: hoger.frame.id,
    vansterNamn: vanster.frame.name,
    hogerNamn: hoger.frame.name,
    par: par.map((p) => ({ ...p })),
    sammanslagning: { ...sammanslagning, hogerKolumner: [...sammanslagning.hogerKolumner] },
    extra: [],
    avvisade: new Set(),
    avskrivnaVanster: new Set(),
    avskrivnaHoger: new Set(),
    rundor: [],
    omgangar: 0,
    vansterForm: radform(vanster.frame),
    hogerForm: radform(hoger.frame),
  }
  verkstadOppen.value = true
}

/**
 * Öppnar vyn igen på den parkerade sessionen.
 *
 * Svaret är synkningens. Vid 'ingen' eller 'stangd' öppnas vyn inte: det
 * finns ingen session, eller så har en källfil stängts och inga rader finns
 * att para ihop — att öppna en tom verkstad vore att låtsas att arbetet är
 * kvar.
 */
export function aterupptaVerkstad(): Synkning {
  if (!verkstad.value) return 'ingen'
  /*
   * Synkningen sker i ingången och inte bara i vyns effekt.
   *
   * Effekten körs efter målningen, och när vyn varit stängd har filerna
   * kunnat ändras under tiden. Utan kontrollen här ritas de gamla paren en
   * gång mot en ny radnumrering — alltså mot andra personer — innan de
   * kastas. Det här är dessutom det enda ställe som kör när vyn är stängd,
   * och därför den enda plats där 'stangd' kan upptäckas alls.
   */
  const svar = synkaVerkstad()
  if (svar === 'ingen' || svar === 'stangd') return svar
  verkstadOppen.value = true
  return svar
}

/** Räknar upp omgången. Varje körning lägger sitt resultat i en egen flik. */
export function antecknaOmgang(): void {
  skriv((s) => ({ ...s, omgangar: s.omgangar + 1 }))
}

/**
 * Radformens signatur.
 *
 * FNV-1a över `frame.sourceRow`, samma sorts hash som `nyckelsignatur` i
 * `ordning.ts`. Radantalet ingår, eftersom en tabell som växt bakifrån annars
 * hade gett samma hash som innan.
 */
export function radformssignatur(frame: Frame): number {
  let h = Math.imul(0x811c9dc5 ^ frame.rowCount, 0x01000193)
  const kalla = frame.sourceRow
  for (let r = 0; r < kalla.length; r++) h = Math.imul(h ^ kalla[r]!, 0x01000193)
  return h >>> 0
}

function radform(frame: Frame): Radform {
  return { sourceRow: frame.sourceRow, signatur: radformssignatur(frame) }
}

/** Sant när ramens rader fortfarande är numrerade som när formen togs. */
function samma(frame: Frame, form: Radform): boolean {
  // Samma array betyder säkert oförändrad numrering, utan att räkna någonting.
  if (frame.sourceRow === form.sourceRow) return true
  return radformssignatur(frame) === form.signatur
}

/**
 * Stänger vyn. Arbetet ligger kvar.
 *
 * Det här är vad Escape, *Avbryt* och en körning gör. Att de förut kastade
 * sessionen var inte ett beslut någon skrivit ner — det var samma funktion
 * använd till två olika saker.
 */
export function lamnaVerkstad(): void {
  verkstadOppen.value = false
}

/**
 * Kastar arbetet.
 *
 * Egen handling med egen knapp, eftersom den inte går att ångra: paren,
 * avvisningarna och avskrivningarna finns bara här.
 */
export function kastaVerkstad(): void {
  verkstad.value = null
  verkstadOppen.value = false
}

export type Synkning = 'ingen' | 'ok' | 'stangd' | 'omnumrerad'

/**
 * Kontrollerar att sessionens radindex fortfarande betyder samma sak.
 *
 * Att skriva en cell numrerar aldrig om raderna. Att ta bort, infoga eller
 * dubblera rader gör det, och all sådan radmanipulation går genom
 * `rebuildRows` i `frame.ts` — som alltid sätter `frame.sourceRow` till en ny
 * `Uint32Array`. Därav den tvådelade kontrollen i `samma`: samma array är ett
 * gratis ja, och först när arrayen bytts kostar det en hash att avgöra om
 * bytet betydde något.
 *
 * Antalet rader duger inte som detektor. En borttagen rad plus en infogad ger
 * samma antal men en helt annan avbildning, och då hade verkstaden parat ihop
 * fel personer utan att någon sett det.
 *
 * Signaturen och inte bara identiteten, därför att en utbytt array inte alltid
 * betyder en ändrad numrering: att ångra en inklistring som inte utökade
 * tabellen sätter `frame.sourceRow` till en kopia med exakt samma innehåll.
 * Med enbart identitetsjämförelse hade det kastat arbetet i onödan.
 *
 * Anropas ur en effekt, aldrig under ritning: den skriver till signalen.
 */
export function synkaVerkstad(): Synkning {
  const s = verkstad.value
  if (!s) return 'ingen'
  const f = flikarna()
  if (!f) {
    kastaVerkstad()
    return 'stangd'
  }
  const vOk = samma(f.vanster.frame, s.vansterForm)
  const hOk = samma(f.hoger.frame, s.hogerForm)
  if (vOk && hOk) {
    // Formen stämmer, men arrayen kan ha bytts. Förankra om, så att nästa
    // kontroll blir den billiga igen.
    if (
      f.vanster.frame.sourceRow !== s.vansterForm.sourceRow ||
      f.hoger.frame.sourceRow !== s.hogerForm.sourceRow
    ) {
      verkstad.value = {
        ...s,
        vansterForm: radform(f.vanster.frame),
        hogerForm: radform(f.hoger.frame),
      }
    }
    return 'ok'
  }

  const nagotAttKasta =
    s.extra.length > 0 ||
    s.avvisade.size > 0 ||
    s.avskrivnaVanster.size > 0 ||
    s.avskrivnaHoger.size > 0
  verkstad.value = {
    ...s,
    extra: [],
    avvisade: new Set(),
    avskrivnaVanster: new Set(),
    avskrivnaHoger: new Set(),
    rundor: [],
    vansterForm: radform(f.vanster.frame),
    hogerForm: radform(f.hoger.frame),
  }
  return nagotAttKasta ? 'omnumrerad' : 'ok'
}

/**
 * Nyckelkolumner som inte finns kvar.
 *
 * Tas en nyckelkolumn bort kraschar ingenting: `findColumn` ger `undefined`,
 * `byggNycklar` ger tom nyckel för varje rad, och *varje* rad blir en restrad.
 * Matchningen ser alltså ut att ha misslyckats när det är verkstaden som
 * tappat sin nyckel. Dialogen har samma hål men lever i sekunder; en verkstad
 * lever i minuter, och därför måste den säga till.
 *
 * Ren läsning — går att anropa under ritning.
 */
export function saknadeKolumner(f: Verkstadsflikar, s: Verkstad): ColumnId[] {
  const saknade: ColumnId[] = []
  for (const p of s.par) {
    if (!findColumn(f.vanster.frame, p.vansterColId)) saknade.push(p.vansterColId)
    if (!findColumn(f.hoger.frame, p.hogerColId)) saknade.push(p.hogerColId)
    if (p.hogerColId2 !== undefined && !findColumn(f.hoger.frame, p.hogerColId2)) {
      saknade.push(p.hogerColId2)
    }
  }
  return saknade
}

/* ---------- Matchningen ---------- */

/** Den automatiska matchningen på grundparen. */
export function grundmatchning(f: Verkstadsflikar, s: Verkstad): Matchning {
  if (s.par.length === 0) return TOM_MATCHNING
  return matcha(f.vanster.frame, f.hoger.frame, s.par)
}

/** Grundmatchningen plus verkstadens egna par. Det är den som slås ihop. */
export function fullmatchning(f: Verkstadsflikar, s: Verkstad, bas: Matchning): Matchning {
  return slaSamman(bas, s.extra, f.vanster.frame, f.hoger.frame)
}

/**
 * Restlistorna: rader utan par, minus de avskrivna.
 *
 * Att en rad ligger här betyder att den saknar partner — inte att den saknas i
 * resultatet. En oparad vänsterrad följer ändå med, med tomma celler, och med
 * *Alla rader ur båda filerna* gör högerlistan det också — det är just den
 * här listan verkstaden skickar in till `slaIhop`, eftersom den redan är
 * rensad från de avskrivna.
 *
 * **`osakra` är en tredje lista och inte en del av de två.** Rader med flera
 * träffar har inte för få partners utan för många, och de två problemen har
 * olika åtgärd: den ena behöver någon att paras med, den andra behöver ett
 * val. De hålls därför isär här — men de visas tillsammans, eftersom en rad
 * som med *Lämna tom* inte får några värden är precis lika mycket en rad att
 * titta på som en rad utan partner. Före den här listan hamnade de i ingen
 * lista alls: räknaren `vansterFlera` fanns, raderna gjorde det inte.
 *
 * `korRunda` och de luddiga förslagen läser bara `vanster`/`hoger`. En ny
 * runda på en osäker rad skulle lägga till *ännu* en träff och göra den mer
 * tvetydig, inte mindre.
 */
export function restlistor(
  s: Verkstad,
  full: Matchning,
): { vanster: number[]; hoger: number[]; osakra: number[] } {
  return {
    vanster: full.vansterUtan.filter((r) => !s.avskrivnaVanster.has(r)),
    hoger: full.hogerUtan.filter((r) => !s.avskrivnaHoger.has(r)),
    osakra: full.vansterOsakra.filter((r) => !s.avskrivnaVanster.has(r)),
  }
}

/* ---------- Åtgärder ---------- */

function skriv(andra: (s: Verkstad) => Verkstad): void {
  const s = verkstad.value
  if (s) verkstad.value = andra(s)
}

/**
 * Parar ihop två rader.
 *
 * Restlistorna `vanster` och `hoger` innehåller bara rader utan par, så ett
 * par mellan två rester är alltid rent 1:1. De osäkra raderna — som redan
 * har flera automatiska träffar — visas i samma vänsterlista men går inte
 * att para här: vyn spärrar det (se `paraIhop` i `Verkstad.tsx`), eftersom
 * ännu en träff hade gjort raden mer tvetydig, inte mindre. Det som kan
 * skapa en flerträff är en runda, och dess träffar är ekvivalensträffar
 * precis som grundmatchningens.
 */
export function laggExtrapar(v: number, h: number, kalla: Parkalla, notis: string): void {
  skriv((s) =>
    s.extra.some((p) => p.v === v && p.h === h)
      ? s
      : { ...s, extra: [...s.extra, { v, h, kalla, notis }] },
  )
}

export function taBortExtrapar(v: number, h: number): void {
  skriv((s) => ({ ...s, extra: s.extra.filter((p) => !(p.v === v && p.h === h)) }))
}

/**
 * Säger nej till ett förslag.
 *
 * Skiljer sig från att skriva av en rad: raden ligger kvar i listan, och andra
 * förslag för den kan fortfarande dyka upp. Det är bara just det här paret som
 * är fel.
 */
export function avvisaForslag(v: number, h: number): void {
  skriv((s) => ({ ...s, avvisade: new Set(s.avvisade).add(`${v}:${h}`) }))
}

export function arAvvisat(s: Verkstad, v: number, h: number): boolean {
  return s.avvisade.has(`${v}:${h}`)
}

/** Tar bort en rad ur restlistan. Ändrar ingenting i resultatet. */
export function skrivAv(sida: 'vanster' | 'hoger', rad: number): void {
  skriv((s) =>
    sida === 'vanster'
      ? { ...s, avskrivnaVanster: new Set(s.avskrivnaVanster).add(rad) }
      : { ...s, avskrivnaHoger: new Set(s.avskrivnaHoger).add(rad) },
  )
}

/** Skriver av allt som är kvar. Den som gjort 30 av 400 ska kunna säga stopp. */
export function skrivAvAlla(vanster: readonly number[], hoger: readonly number[]): void {
  skriv((s) => ({
    ...s,
    avskrivnaVanster: new Set([...s.avskrivnaVanster, ...vanster]),
    avskrivnaHoger: new Set([...s.avskrivnaHoger, ...hoger]),
  }))
}

/**
 * Kör en ny runda: matchar om restraderna på ett annat kolumnpar.
 *
 * Träffarna läggs till direkt och inte som förslag. De är ekvivalensträffar
 * precis som grundmatchningens — samma sorts svar på samma sorts fråga, bara
 * ställd om en annan kolumn. Det som ska granskas rad för rad är den luddiga
 * likheten, inte det här.
 */
export function korRunda(par: Matchningspar[]): number {
  const s = verkstad.value
  const f = flikarna()
  if (!s || !f || par.length === 0) return 0

  const full = fullmatchning(f, s, grundmatchning(f, s))
  const rest = restlistor(s, full)
  const m = matcha(f.vanster.frame, f.hoger.frame, par, {
    vansterRader: rest.vanster,
    hogerRader: rest.hoger,
  })
  if (m.par.length === 0) {
    verkstad.value = { ...s, rundor: [...s.rundor, { par, traffar: 0 }] }
    return 0
  }

  const nr = s.rundor.length + 1
  verkstad.value = {
    ...s,
    extra: [
      ...s.extra,
      ...m.par.map((p) => ({ v: p.v, h: p.h, kalla: 'runda' as const, notis: `runda ${nr}` })),
    ],
    rundor: [...s.rundor, { par, traffar: m.par.length }],
  }
  return m.par.length
}

/* ---------- Sessionen mellan besök ---------- */

/**
 * Sessionen i ett skick som går att skriva till IndexedDB.
 *
 * Nästan allt är redan ren data. Tre saker skiljer sig:
 *
 * **Mängderna blir listor.** Structured clone klarar `Set`, men en list-form
 * är den som går att läsa i en felsökare och den som inte ändrar betydelse om
 * lagringen någon gång byts ut.
 *
 * **`sourceRow` sparas inte.** Vid 100 000 rader är den 400 kB per sida, och
 * den är dessutom meningslös efter en omladdning: `deserializeFrame` bygger
 * alltid en ny array, så identitetsgenvägen i `samma` kan aldrig slå till mot
 * en inläst form. Bara signaturen behövs — fyra byte som svarar på den enda
 * fråga fältet ställs: betyder radindexen fortfarande samma sak?
 *
 * **Ram-id:na följer med.** De är det som säger att det är samma *fil*.
 * Signaturen kan inte svara på det: en nyinläst fil har alltid
 * `sourceRow = 1..n`, så två orelaterade filer med lika många rader hashar
 * likadant.
 */
export interface SparadVerkstad {
  vansterTabId: string
  hogerTabId: string
  vansterFrameId: string
  hogerFrameId: string
  vansterNamn: string
  hogerNamn: string
  omgangar: number
  par: Matchningspar[]
  sammanslagning: Sammanslagning
  extra: Extrapar[]
  avvisade: string[]
  avskrivnaVanster: number[]
  avskrivnaHoger: number[]
  rundor: Runda[]
  vansterSignatur: number
  hogerSignatur: number
}

/**
 * Sessionen tillbaka ur sin sparade form — den rena spegeln av
 * `sparadVerkstad`, så att fältmappningen går att testa som en rundtur.
 *
 * Radformerna får en tom array med flit. Kontrollen i `samma` tar annars
 * identitetsgenvägen mot den levande ramens array och svarar "oförändrad"
 * utan att ha jämfört någonting — alltså skulle kontrollen alltid säga ja.
 */
export function verkstadAvSparad(data: SparadVerkstad): Verkstad {
  const tom = new Uint32Array(0)
  return {
    vansterTabId: data.vansterTabId,
    hogerTabId: data.hogerTabId,
    vansterFrameId: data.vansterFrameId,
    hogerFrameId: data.hogerFrameId,
    vansterNamn: data.vansterNamn,
    hogerNamn: data.hogerNamn,
    omgangar: data.omgangar,
    par: data.par,
    sammanslagning: data.sammanslagning,
    extra: data.extra,
    avvisade: new Set(data.avvisade),
    avskrivnaVanster: new Set(data.avskrivnaVanster),
    avskrivnaHoger: new Set(data.avskrivnaHoger),
    rundor: data.rundor,
    vansterForm: { sourceRow: tom, signatur: data.vansterSignatur },
    hogerForm: { sourceRow: tom, signatur: data.hogerSignatur },
  }
}

export function sparadVerkstad(s: Verkstad): SparadVerkstad {
  return {
    vansterTabId: s.vansterTabId,
    hogerTabId: s.hogerTabId,
    vansterFrameId: s.vansterFrameId,
    hogerFrameId: s.hogerFrameId,
    vansterNamn: s.vansterNamn,
    hogerNamn: s.hogerNamn,
    omgangar: s.omgangar,
    par: s.par.map((p) => ({ ...p })),
    sammanslagning: { ...s.sammanslagning, hogerKolumner: [...s.sammanslagning.hogerKolumner] },
    extra: s.extra.map((p) => ({ ...p })),
    avvisade: [...s.avvisade],
    avskrivnaVanster: [...s.avskrivnaVanster],
    avskrivnaHoger: [...s.avskrivnaHoger],
    rundor: s.rundor.map((r) => ({ traffar: r.traffar, par: r.par.map((p) => ({ ...p })) })),
    vansterSignatur: s.vansterForm.signatur,
    hogerSignatur: s.hogerForm.signatur,
  }
}

/**
 * Läser tillbaka sessionen.
 *
 * **Måste köras efter att flikarna lagts i `tabs`.** `flikarna()` slår upp
 * flik-id:na där; körs det här först finns de inte, och nästa `synkaVerkstad`
 * skulle kasta arbetet permanent med motiveringen att filen är stängd.
 *
 * Vyn öppnas aldrig av sig själv. Vägen tillbaka in är menyposten — en vy som
 * poppar upp av sig själv efter en omladdning vore inte hjälpsam utan
 * påträngande.
 */
export async function aterstallVerkstad(): Promise<boolean> {
  const data = (await laddaSession()) as SparadVerkstad | null
  /*
   * Läsningen är asynkron och gränssnittet lever under tiden: användaren kan
   * hinna släppa filer och starta en ny sammanslagning innan den lagrade
   * sessionen kommit tillbaka. Då vinner den levande — den är nyare — och
   * skrivs över den lagrade i stället för tvärtom.
   */
  if (verkstad.value !== null) {
    laddad = true
    schemalaggSessionsskrivning(JSON.stringify(sparadVerkstad(verkstad.value)))
    return true
  }
  if (!data) {
    laddad = true
    sparad = null
    return false
  }
  verkstad.value = verkstadAvSparad(data)
  verkstadOppen.value = false
  laddad = true
  /*
   * Bokför det lästa som redan skrivet. Effekten nedan dedupar mot `sparad`,
   * och utan den här raden stod den kvar på "okänt" — så när användaren
   * kastade sessionen blev både nästa värde och det bokförda null, raderingen
   * dedupades bort, och den kastade sessionen återuppstod vid nästa start.
   */
  sparad = JSON.stringify(sparadVerkstad(verkstad.value))
  return flikarna() !== null
}

/**
 * Sant först när återställningen körts.
 *
 * Utan den skulle den första skrivningen ske innan läsningen hunnit klart och
 * radera det som låg där — en tom session skulle skriva över en sparad.
 */
let laddad = false

let sessionsTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Serialiseringen som lagringen redan har. `null` betyder att den är tom,
 * `undefined` att den är okänd — före återställningen, och efter en
 * misslyckad skrivning — så att nästa ändring skriver i stället för att
 * dedupas bort.
 */
let sparad: string | null | undefined

function schemalaggSessionsskrivning(nasta: string | null): void {
  sparad = nasta
  if (sessionsTimer !== null) clearTimeout(sessionsTimer)
  sessionsTimer = setTimeout(() => {
    sessionsTimer = null
    void skrivSession(nasta)
  }, 800)
}

/**
 * Skrivningen, med samma varning som flikarnas.
 *
 * Rent verkstadsarbete rör aldrig någon fliks `dataRevision` och går alltså
 * aldrig genom `skrivFlikar` — den enda andra plats som visar lagringsfelet.
 * Utan felhanteringen här kunde användaren beta av hundratals beslut i tron
 * att de sparades, utan att någonsin få veta att de inte gjorde det.
 */
async function skrivSession(nasta: string | null): Promise<void> {
  const gick = await sparaSession(nasta === null ? null : (JSON.parse(nasta) as SparadVerkstad))
  // Har en nyare skrivning redan schemalagts är det den som gäller — både
  // bokföringen och varningen hör då till den.
  if (gick || sparad !== nasta) return
  sparad = undefined
  const text = lagringsfel()
  if (text) notify(text, { ton: 'varning' })
}

/**
 * Efter »Glöm sparade filer«: lagringen är tom, så bokföringen får inte påstå
 * något annat. Finns en levande session skrivs den tillbaka — samma beslut
 * som för flikarna, som också står kvar och återsparas efter en glömning.
 */
export function glomdSession(): void {
  const s = verkstad.value
  if (s === null) sparad = null
  else schemalaggSessionsskrivning(JSON.stringify(sparadVerkstad(s)))
}

/**
 * Skriver sessionen när den ändrats, en stund efter sista ändringen.
 *
 * Egen fördröjning och egen transaktion, skild från flikarnas. Ett handgjort
 * par ändrar varken flikens `dataRevision` eller dess lätta signatur, så
 * flikskrivningens avbrottsvillkor hade hoppat över skrivningen helt — och en
 * avbruten sessionsskrivning ska inte rulla tillbaka ramarna.
 */
effect(() => {
  const s = verkstad.value
  // Läs signalen innan vi eventuellt hoppar av, annars prenumererar effekten
  // inte på nästa ändring.
  if (!laddad) return
  const nasta = s === null ? null : JSON.stringify(sparadVerkstad(s))
  if (nasta === sparad) return
  schemalaggSessionsskrivning(nasta)
})
