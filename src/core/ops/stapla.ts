import { Flag, type Column, type ColumnId, type Frame } from '../types.js'
import { createColumn, intern } from '../frame/column.js'
import { findColumn, identityView, newFrameId, uniqueColumnName, visibleColumns } from '../frame/frame.js'
import { inferAllTypes } from '../infer.js'
import { hittaAlias } from './rubriker.js'

/**
 * Stapla flera filer på varandra.
 *
 * Etapp 5 löste sidled: två filer som hör ihop rad för rad. Det här är den
 * andra halvan — tolv månadsfiler ur samma system, tre säljares kundlistor,
 * fyra kommuners deltagarlistor. Samma sorts data, men rubrikerna heter
 * olika, och det är hela problemet: `Namn` i den ena, `Name` i den andra,
 * `kundnamn` i den tredje.
 *
 * **Varje målkolumn räknas en gång per unikt värde, inte per rad.** Den
 * uppenbara implementationen — slå upp varje cellvärde i målordboken medan man
 * kopierar — kostar en hashuppslagning per cell, alltså tio miljoner för fem
 * filer med 100 000 rader och tjugo kolumner. I stället interneras varje
 * källkolumns *ordbok* en gång till en omskrivningstabell, och sedan är
 * kopieringen ett heltalssvep. Det är samma princip som `mapColumnValues`,
 * `byggNycklar` och `hittaDubbletter` redan följer.
 *
 * **En kolumn som saknas i en fil kostar nästan ingenting.** Kod 0 är alltid
 * tomma strängen, så bara flaggorna behöver skrivas.
 */

/** Var en målkolumns värden hämtas i en källfil. */
export type Hamtning = { fran: 'kolumn'; colId: ColumnId } | { fran: 'tomt' }

export const TOMT: Hamtning = { fran: 'tomt' }

export interface Malkolumn {
  /** Namnet i resultatet. */
  namn: string
  /**
   * Radens oföränderliga identitet: namnet förslaget gav den.
   *
   * `namn` går att skriva om, tecken för tecken, och duger därför inte som
   * nyckel. Nycklas ett bevarat svar på `namn` räcker det att döpa om en rad
   * till en annans namn för att svaren ska byta plats — och en hopslagning som
   * antecknat ett namn kan bli sin egen absorberade rad och ta bort sig själv.
   *
   * Namnet räknas fram en gång per förslag och är unikt inom det. Det ändras
   * bara när kolumnuppsättningen ändras, alltså precis när förslaget ändå
   * räknas om.
   */
  forslagsnamn: string
  /** En hämtning per källa, i samma ordning som `kallor`. */
  hamtning: Hamtning[]
  /**
   * Med i resultatet. `null` betyder obeslutad och spärrar körningen.
   *
   * En kolumn som finns i alla filer behöver inget beslut. En som finns i
   * vissa gör det: tas den med blir den tom för de andra filerna, och tas den
   * inte med försvinner data. Båda kan vara rätt, och att gissa är inte
   * verktygets sak.
   *
   * `stapla` behandlar `null` som *inte med* — det är gränssnittet som spärrar
   * körningen tills allt är besluta, se `obeslutade`.
   */
  med: boolean | null
  /**
   * Sant när det var *verktyget* som ställde frågan.
   *
   * Skiljer en kolumn som fick `med: true` för att den fanns i alla filer från
   * en som fick det för att användaren svarade. Bara den senare hör hemma i
   * massbesluten och i *Börja om* — annars skulle en knapp längst upp kunna
   * kasta ett svar användaren aldrig ombads ge.
   *
   * Fältet följer med genom omdöpning och redigering, eftersom `Malkolumn`
   * alltid kopieras med spread. Det vore ömtåligare att härleda villkoret på
   * nytt ur `antalKallor`: ändrar man en hämtning så att kolumnen plötsligt
   * fylls av alla filer var frågan ändå ställd.
   */
  fraga?: boolean
  /**
   * Värde att fylla cellerna med i de filer som *saknar* kolumnen.
   *
   * Bara där. En cell som finns men är tom rörs aldrig — tomt betyder okänt,
   * och att skriva `Okänd` över ett medvetet tomt fält vore att hitta på data.
   * Skillnaden är samma som `Flag.Padded` bär genom hela verktyget, och den
   * går inte att göra ogjord i efterhand.
   *
   * Fyllda celler behåller `Flag.Padded`: värdet står fortfarande inte i
   * filen, och rutnätets strimma ska säga det.
   */
  standard?: string
  /**
   * Målkolumner den här har absorberat, med sina namn.
   *
   * Bara handgjorda hopslagningar hamnar här. `hittaAlias` behöver ingen
   * anteckning — den hittar rätt igen nästa gång — men ett handgrepp som säger
   * att `Mobilnr` och `Telefon` är samma sak vet bara användaren, och det ska
   * inte gå förlorat för att en fil kryssas av.
   */
  sammanslagna?: string[]
  /**
   * Ett exempelvärde ur mallfilen.
   *
   * Det är hela skälet att en mall får innehålla exempeldata: den visar vad
   * kolumnen ska innehålla, och det är precis vad man behöver se när man
   * väljer källkolumn. Värdet följer aldrig med i resultatet.
   */
  ledtrad?: string
}

export interface Kalla {
  frame: Frame
  /** Rader att ta med, i den ordning de ska hamna. */
  rader: ArrayLike<number>
}

export interface Staplingsplan {
  kolumner: readonly Malkolumn[]
  /** Namn på en kolumn med källfilens namn, eller null för ingen. */
  kallkolumn: string | null
  /** Namn på resultatfliken. */
  namn: string
}

export interface Staplingsresultat {
  frame: Frame
  /** Antal rader varje källa bidrog med, i samma ordning. */
  perKalla: number[]
  /** Målkolumner som blev tomma i hela resultatet. */
  ofyllda: string[]
  /**
   * Var varje kolumn i `frame` kom ifrån: index i `plan.kolumner`, eller -1
   * för källkolumnen.
   *
   * Namnet duger inte som svar. `uniqueColumnName` döper om kollisioner, så
   * två målkolumner som båda heter `Namn` blir `Namn` och `Namn (2)` — och
   * den som vill märka en kolumn i förhandsvisningen efter vad användaren
   * svarade om den behöver veta *vilken* av dem det var.
   */
  ursprung: number[]
}

/**
 * Filnamn som går att skilja åt.
 *
 * Samma fil kan vara öppnad två gånger, och då säger en källkolumn med två
 * likadana namn ingenting. `uniqueColumnName` gör samma sak för kolumner vid
 * import och sammanslagning, så mönstret är redan inlärt.
 */
export function kallnamn(kallor: readonly { frame: Frame }[]): string[] {
  const tagna: string[] = []
  return kallor.map((k) => {
    const namn = uniqueColumnName(tagna, k.frame.name)
    tagna.push(namn)
    return namn
  })
}

export function stapla(kallor: readonly Kalla[], plan: Staplingsplan): Staplingsresultat {
  // Hämtningarna är positionella. Vore listan kortare än källorna skulle
  // värden ur fil 3 hamna under fil 2:s rubrik, tyst.
  const med: { mal: Malkolumn; index: number }[] = []
  plan.kolumner.forEach((k, i) => {
    if (k.med === true) med.push({ mal: normaliseraHamtning(k, kallor.length), index: i })
  })
  let totalRader = 0
  for (const k of kallor) totalRader += k.rader.length

  const tagna: string[] = []
  const kolumner: Column[] = []
  const ofyllda: string[] = []
  const ursprung: number[] = []

  for (const { mal, index } of med) {
    const namn = uniqueColumnName(tagna, mal.namn)
    tagna.push(namn)
    const { col, fylld } = byggKolumn(namn, mal, kallor, totalRader)
    if (!fylld) ofyllda.push(namn)
    kolumner.push(col)
    ursprung.push(index)
  }

  if (plan.kallkolumn !== null) {
    const namn = uniqueColumnName(tagna, plan.kallkolumn)
    tagna.push(namn)
    kolumner.push(byggKallkolumn(namn, kallor, totalRader))
    ursprung.push(-1)
  }

  // Radnumret är sant inom sin källa, och källkolumnen är det som gör paret
  // entydigt. Rad 12 ur två filer är två olika rader.
  const sourceRow = new Uint32Array(totalRader)
  let ut = 0
  for (const kalla of kallor) {
    for (let i = 0; i < kalla.rader.length; i++) {
      sourceRow[ut++] = kalla.frame.sourceRow[kalla.rader[i]!] ?? 0
    }
  }

  // Typen är en tolkning av datat, och det staplade datat är inte något av
  // källornas. Låsningar som alla källor är eniga om har redan satts i
  // `byggKolumn`, och `inferAllTypes` rör inte dem.
  inferAllTypes(kolumner)

  const frame: Frame = {
    id: newFrameId(),
    name: plan.namn,
    columns: kolumner,
    rowCount: totalRader,
    view: identityView(totalRader),
    sourceRow,
    meta: { warnings: [] },
  }

  return { frame, perKalla: kallor.map((k) => k.rader.length), ofyllda, ursprung }
}

function byggKolumn(
  namn: string,
  mal: Malkolumn,
  kallor: readonly Kalla[],
  totalRader: number,
): { col: Column; fylld: boolean } {
  const col = createColumn(namn, totalRader)
  const bidragande: Column[] = []
  const standard = mal.standard ?? ''
  let standardanvand = false
  /*
   * Vittne om att någon icke-tom kod faktiskt skrevs.
   *
   * Bitvis eller, för att slingan ändå läser koden och en gren per cell inte
   * betalar för sig. Negativt är också skilt från noll, så teckenbiten spelar
   * ingen roll.
   */
  let ack = 0
  let ut = 0

  for (let i = 0; i < kallor.length; i++) {
    const kalla = kallor[i]!
    const hamtning = mal.hamtning[i]
    const kall =
      hamtning && hamtning.fran === 'kolumn' ? findColumn(kalla.frame, hamtning.colId) : undefined
    if (!kall) {
      /*
       * Kolumnen fanns inte i den här filen. Det är samma sak som en rad med
       * för få fält: värdet *saknades*, det var inte tomt — och den skillnaden
       * är hela poängen med att fråga per kolumn.
       *
       * Ett standardvärde fyller just de här cellerna, och bara dem. Flaggan
       * sätts ändå: värdet står fortfarande inte i filen, och strimman i
       * rutnätet ska säga det. Utan standardvärde är kod 0 redan tomma
       * strängen, så bara flaggan behöver skrivas.
       */
      if (standard !== '' && kalla.rader.length > 0) {
        const kod = intern(col, standard)
        col.codes.fill(kod, ut, ut + kalla.rader.length)
        ack |= kod
        standardanvand = true
      }
      col.flags.fill(Flag.Padded, ut, ut + kalla.rader.length)
      ut += kalla.rader.length
      continue
    }
    bidragande.push(kall)

    /*
     * Omskrivningstabellen byggs en gång per unikt värde, inte per rad.
     *
     * När hela kolumnen följer med är ordboken den billigaste vägen. Vid ett
     * urval — ett filter, en frusen vy, en förhandsvisning på tre rader — är
     * den däremot både dyrare *och fel*: `inferType` läser ordboken, så värden
     * som inte är med i resultatet skulle vara med och bestämma dess typ.
     */
    const remap = new Uint32Array(kall.dict.length)
    if (kalla.rader.length >= kall.codes.length) {
      for (let kod = 1; kod < kall.dict.length; kod++) remap[kod] = intern(col, kall.dict[kod]!)
    } else {
      for (let r = 0; r < kalla.rader.length; r++) {
        const kod = kall.codes[kalla.rader[r]!]!
        // `intern` ger aldrig 0 för ett icke-tomt värde, så 0 duger som "osedd".
        if (kod !== 0 && remap[kod] === 0) remap[kod] = intern(col, kall.dict[kod]!)
      }
    }

    for (let r = 0; r < kalla.rader.length; r++) {
      const rad = kalla.rader[r]!
      // Både uppslagen normaliseras till 0. Ett radnummer utanför källan ger
      // `undefined`, och att låta en Uint32Array göra 0 av det på vägen in
      // vore att lita på en tillfällighet — `ack` nedan läser samma värde.
      const kod = remap[kall.codes[rad] ?? 0] ?? 0
      col.codes[ut] = kod
      ack |= kod
      // Flaggorna hör till cellen — det är samma cell, i en ny fil.
      col.flags[ut] = kall.flags[rad]!
      ut += 1
    }
  }

  /*
   * En låsning som alla bidragande källor är eniga om ärvs: har man låst
   * Postnr till text för att 01234 inte ska bli ett tal ska det inte tappas
   * här. Motstridiga låsningar är ingen låsning.
   *
   * Ett standardvärde bryter arvet. Källorna kan vara eniga om att kolumnen är
   * tal, men `Okänd` i de filer som saknade den är inte ett tal — och att ärva
   * låsningen då vore att påstå något om datat som inte längre stämmer.
   */
  const forsta = bidragande[0]
  if (!standardanvand && forsta && bidragande.every((c) => c.typeLocked && c.type === forsta.type)) {
    col.type = forsta.type
    col.typeLocked = true
  }

  /*
   * Svaret kommer ur det som skrevs, inte ur ordbokslängden.
   *
   * Ordboken vore det uppenbara måttet, och det var måttet — men det är fel.
   * Grenen ovan interner hela källordboken när hela filen följer med, och en
   * källordbok kan innehålla värden som ingen kvarvarande rad pekar på:
   * `intern` tar aldrig bort, så en raderad rad eller en tömd cell lämnar sitt
   * gamla värde kvar. En kolumn vars enda rad är tom skulle då rapporteras som
   * ifylld, och varningen om tomma kolumner uteblir just i det fall den behövs.
   */
  return { col, fylld: ack !== 0 }
}

/** Ser till att hämtningslistan har exakt en post per källa. */
function normaliseraHamtning(kol: Malkolumn, antal: number): Malkolumn {
  if (kol.hamtning.length === antal) return kol
  const hamtning = Array.from({ length: antal }, (_, i) => kol.hamtning[i] ?? TOMT)
  return { ...kol, hamtning }
}

function byggKallkolumn(namn: string, kallor: readonly Kalla[], totalRader: number): Column {
  const col = createColumn(namn, totalRader)
  col.typeLocked = true
  const namnen = kallnamn(kallor)
  let ut = 0
  for (let i = 0; i < kallor.length; i++) {
    const kod = intern(col, namnen[i]!)
    const antal = kallor[i]!.rader.length
    for (let r = 0; r < antal; r++) col.codes[ut++] = kod
  }
  return col
}

/**
 * Målform ur källornas egna kolumner, med alias hopslagna.
 *
 * Girigheten går i filordning, och en källkolumn kan bara bindas en gång. Utan
 * den regeln kan `E-post` och `epost2` i samma fil hamna i två målkolumner med
 * identiskt innehåll, och det syns inte förrän långt senare.
 */
export function malformAvKallor(kallor: readonly Frame[]): Malkolumn[] {
  const tagna = kallor.map(() => new Set<ColumnId>())
  return laggTillObundna([], kallor, tagna, (hamtning) =>
    antalKallor(hamtning) === kallor.length ? true : null,
  )
}

/**
 * Lägger till en målkolumn för varje källkolumn som ingen ännu bundit.
 *
 * Girigheten går i filordning: den första filen som har kolumnen får ge den
 * dess namn, och de följande binder sina alias till den.
 */
function laggTillObundna(
  ut: Malkolumn[],
  kallor: readonly Frame[],
  tagna: Set<ColumnId>[],
  beslut: (hamtning: readonly Hamtning[]) => boolean | null,
): Malkolumn[] {
  // Identiteterna görs unika över hela förslaget, mallens kolumner inräknade.
  const namngivna = ut.map((k) => k.forslagsnamn)
  for (let i = 0; i < kallor.length; i++) {
    for (const col of visibleColumns(kallor[i]!)) {
      if (tagna[i]!.has(col.id)) continue
      const hamtning: Hamtning[] = kallor.map(() => TOMT)
      hamtning[i] = { fran: 'kolumn', colId: col.id }
      tagna[i]!.add(col.id)

      for (let j = i + 1; j < kallor.length; j++) {
        const traff = hittaAlias(kallor[j]!, col.name, tagna[j]!)
        if (traff !== null) {
          hamtning[j] = { fran: 'kolumn', colId: traff }
          tagna[j]!.add(traff)
        }
      }

      const med = beslut(hamtning)
      const forslagsnamn = uniqueColumnName(namngivna, col.name)
      namngivna.push(forslagsnamn)
      ut.push({ namn: col.name, forslagsnamn, hamtning, med, fraga: med === null })
    }
  }
  return ut
}

/**
 * Källor där två målkolumner båda hämtar något — alltså där en hopslagning
 * skulle kasta det ena värdet.
 *
 * `hittaAlias` kan bara gissa på rubriknamn, och gissar den fel finns ingen
 * väg tillbaka i kartan: `Mobilnr` och `Telefon` blir två halvfyllda spalter.
 * Hopslagningen är den vägen. Men i en fil som har *båda* kolumnerna är de
 * inte samma sak, och då ska användaren få veta vad som går förlorat innan
 * hen trycker — inte upptäcka det i resultatet.
 */
export function krockandeKallor(a: Malkolumn, b: Malkolumn): number[] {
  const ut: number[] = []
  const antal = Math.max(a.hamtning.length, b.hamtning.length)
  for (let i = 0; i < antal; i++) {
    if (a.hamtning[i]?.fran === 'kolumn' && b.hamtning[i]?.fran === 'kolumn') ut.push(i)
  }
  return ut
}

/**
 * Slår ihop två målkolumner för hand.
 *
 * `behall` ger namnet och har företräde i varje fil; `slopa` fyller luckorna.
 *
 * **Den slopade försvinner bara om den inte har något kvar att ge.** En
 * `Hamtning[]` rymmer exakt en källkolumn per fil, så en fil som har *båda*
 * kolumnerna kan inte uttryckas i en målkolumn. Att ändå ta bort raden vore
 * att kasta den filens värden tyst. I stället står den kvar med just de
 * källorna och en ny fråga — och en fråga spärrar körningen tills den besvaras.
 *
 * Den överlevande antecknar vad den absorberat, så att handgreppet går att
 * göra om när förslaget räknas om. Se `medBevaradeBeslut`.
 */
export function slaIhopMal(
  kolumner: readonly Malkolumn[],
  behall: number,
  slopa: number,
): Malkolumn[] {
  const a = kolumner[behall]
  const b = kolumner[slopa]
  if (!a || !b || behall === slopa) return [...kolumner]

  const krockar = krockandeKallor(a, b)
  const rest: Malkolumn | null =
    krockar.length === 0
      ? null
      : {
          ...b,
          hamtning: b.hamtning.map((h, i) => (krockar.includes(i) ? h : TOMT)),
          sammanslagna: undefined,
          // Det som blev över är en ny fråga, inte ett gammalt svar.
          med: null,
          fraga: true,
        }

  const ut: Malkolumn[] = []
  kolumner.forEach((k, i) => {
    if (i === behall) ut.push(absorbera(a, b))
    else if (i === slopa) {
      if (rest) ut.push(rest)
    } else ut.push(k)
  })
  return ut
}

/** `a` behåller sitt, `b` fyller luckorna. */
function absorbera(a: Malkolumn, b: Malkolumn): Malkolumn {
  const antal = Math.max(a.hamtning.length, b.hamtning.length)
  const hamtning = Array.from({ length: antal }, (_, i) =>
    a.hamtning[i]?.fran === 'kolumn' ? a.hamtning[i]! : (b.hamtning[i] ?? TOMT),
  )
  return {
    ...a,
    hamtning,
    /*
     * Anteckningen bär den andras *identitet*, inte dess namn. Namnet går att
     * skriva om — döper man den överlevande till den absorberades namn skulle
     * raden annars bli sin egen absorberade och ta bort sig själv.
     *
     * Listan plattas ut vid varje hopslagning, inklusive den andras egna
     * anteckningar. Kedjor kan alltså inte uppstå, och återapplikationen
     * behöver aldrig följa en länk vidare.
     */
    sammanslagna: [...(a.sammanslagna ?? []), b.forslagsnamn, ...(b.sammanslagna ?? [])],
    /*
     * Beslutet räknas om. Att bära över `a.med` rakt av vore fel åt båda
     * hållen: en överhoppad `a` skulle sluka `b`:s data utan att någonting
     * syntes, och två kolumner som var för sig fyllde en fil av tre kan efter
     * hopslagningen fylla alla tre — då är den gamla frågan inte längre den
     * fråga användaren svarade på.
     */
    med: a.med === true || b.med === true ? true : a.med === false && b.med === false ? false : null,
    fraga: a.fraga === true || b.fraga === true,
    standard: a.standard !== undefined && a.standard !== '' ? a.standard : b.standard,
    ledtrad: a.ledtrad !== undefined && a.ledtrad !== '' ? a.ledtrad : b.ledtrad,
  }
}

/**
 * Behåller användarens arbete över en omräkning av förslaget.
 *
 * Förslaget räknas om från grunden när *kolumnuppsättningen* ändras — en fil
 * kryssas till eller bort, mallen byts. Allt användaren svarat skulle då gå
 * förlorat, och det som svarats om tolv kolumner är inte något man gärna gör
 * två gånger.
 *
 * Nyckeln är `forslagsnamn` och aldrig `namn`: det senare skrivs om tecken för
 * tecken medan man håller på, och två rader kan då tillfälligt heta likadant.
 *
 * Ett gammalt `null` får inte skriva över ett nytt beslut: en kolumn som numera
 * finns i alla filer behöver ingen fråga. Och `fraga` kommer alltid ur det
 * *färska* förslaget — bär man över den från det gamla står ↺ och massbesluten
 * kvar på en rad som inte längre är en fråga.
 *
 * Det som bevaras är svaren och handgreppen: beslutet, standardvärdet och
 * hopslagningarna. Namnbyten och egna kopplingar räknas däremot om, eftersom
 * `hamtning` är positionell över `kallor` — tas en fil bort betyder position 2
 * en annan fil, och ett bevarat värde hade pekat på fel ställe.
 */
export function medBevaradeBeslut(
  nya: readonly Malkolumn[],
  gamla: readonly Malkolumn[],
): Malkolumn[] {
  const forr = new Map(gamla.map((k) => [k.forslagsnamn, k]))
  const absorberadAv = new Map<string, string>()
  for (const g of gamla) {
    for (const id of g.sammanslagna ?? []) {
      // En rad kan inte absorbera sig själv, och en överlevare som själv är
      // absorberad vore en kedja. Listan är utplattad så att det inte kan
      // hända; villkoret finns för att en trasig lista aldrig ska kunna sätta
      // återapplikationen i en cykel.
      if (id !== g.forslagsnamn && forr.has(g.forslagsnamn)) absorberadAv.set(id, g.forslagsnamn)
    }
  }

  const bevarad = (k: Malkolumn): Malkolumn => {
    const gammal = forr.get(k.forslagsnamn)
    if (!gammal) return k
    return {
      ...k,
      med: gammal.med === null ? k.med : gammal.med,
      ...(gammal.standard === undefined ? {} : { standard: gammal.standard }),
    }
  }

  // Två svep: den absorberade kan stå före sin överlevare i det nya förslaget.
  const ut = nya.filter((k) => !absorberadAv.has(k.forslagsnamn)).map(bevarad)
  const plats = new Map(ut.map((k, i) => [k.forslagsnamn, i]))
  for (const k of nya) {
    const varden = absorberadAv.get(k.forslagsnamn)
    if (varden === undefined) continue
    const i = plats.get(varden)
    // Överlevaren kan ha försvunnit med sin fil. Då står den absorberade
    // hellre kvar för sig än att tyst falla bort.
    if (i === undefined) ut.push(bevarad(k))
    else ut[i] = absorbera(ut[i]!, k)
  }
  return ut
}

/** Hur många källor som faktiskt fyller en målkolumn. */
export function antalKallor(hamtning: readonly Hamtning[]): number {
  let n = 0
  for (const h of hamtning) if (h.fran === 'kolumn') n += 1
  return n
}

/**
 * Vilka målkolumner som blir tomma i resultatet — svarat *före* körningen.
 *
 * Ett svar per post i `kolumner`, i samma ordning, oberoende av `med`. Namnen
 * duger inte som svar: `uniqueColumnName` döper om krockar, och en kolumn som
 * ännu inte är beslutad har inget namn i resultatet alls. Men frågan gäller
 * även den — att veta att en kolumn blir tom är själva skälet att svara nej.
 *
 * Att upptäcka tomheten efteråt är för sent: fliken är redan skapad, och den
 * tomma spalten ser ut som ett fel i datat i stället för ett val i kartan.
 * Samma fråga som `stapla` besvarar i `ofyllda`, och samma definition — *skrevs
 * någon icke-tom cell?* — så att de två inte kan gå isär.
 */
export function ofylldaFore(
  kallor: readonly Kalla[],
  kolumner: readonly Malkolumn[],
): boolean[] {
  return kolumner.map((k) => !harNagotVarde(k, kallor))
}

/**
 * Ett ifyllt värde ur en källkolumn, bland de rader som tas med.
 *
 * Tom sträng betyder att ingen av raderna har något värde. Det är samma svar
 * som `byggKolumn` kommer fram till, och det är med flit: en cell som skrivs
 * med en kod skild från noll har per definition en icke-tom sträng i ordboken.
 *
 * **Ordbokslängden duger bara som nej.** Har ordboken inget icke-tomt värde
 * alls kan ingen rad peka på ett, och svaret är gratis. Motsatsen gäller inte:
 * `intern` tar aldrig bort, så ett värde kan ligga kvar i ordboken sedan raden
 * som hade det togs bort. Därför sveps raderna, och svepet bryter vid första
 * ifyllda cellen — i det vanliga fallet den första raden.
 */
export function provvarde(kalla: Kalla, kall: Column): string {
  if (kall.dict.length === 1) return ''
  for (let r = 0; r < kalla.rader.length; r++) {
    const kod = kall.codes[kalla.rader[r]!]
    if (kod !== undefined && kod !== 0) return kall.dict[kod] ?? ''
  }
  return ''
}

function harNagotVarde(kol: Malkolumn, kallor: readonly Kalla[]): boolean {
  const standard = kol.standard ?? ''
  for (let i = 0; i < kallor.length; i++) {
    const kalla = kallor[i]!
    // En källa utan rader bidrar ingenting, inte ens sitt standardvärde.
    if (kalla.rader.length === 0) continue
    const h = kol.hamtning[i]
    const kall = h && h.fran === 'kolumn' ? findColumn(kalla.frame, h.colId) : undefined
    if (!kall) {
      if (standard !== '') return true
      continue
    }
    if (provvarde(kalla, kall) !== '') return true
  }
  return false
}

/** Målkolumner som ännu inte fått ett beslut. */
export function obeslutade(kolumner: readonly Malkolumn[]): Malkolumn[] {
  return kolumner.filter((k) => k.med === null)
}

/**
 * Målform ur en mallfils rubriker, i mallens ordning.
 *
 * En mall är ett dokument som bara innehåller rubriker, eventuellt med några
 * exempelrader. Den bestämmer resultatets form: vilka kolumner det har, vad de
 * heter och i vilken ordning de kommer. Därför behöver ingen mallkolumn ett
 * beslut — mallen *är* beslutet.
 *
 * Mallens egna rader följer aldrig med. De är exempel, inte data, och det
 * första ifyllda värdet per kolumn blir i stället en ledtråd i kartan.
 *
 * Källkolumner som mallen *inte* har läggs till sist och obeslutade, så att
 * mallen aldrig blir ett tyst filter.
 *
 * En mallkolumn som ingen fil fyller tas med som tom kolumn och rapporteras i
 * `ofyllda`. Den ska vara med: en saknad kolumn i ett importformat är inte
 * samma sak som ingen kolumn. Men att den blir tom ska stå i klartext före
 * körningen, inte upptäckas i resultatet.
 */
export function malformAvMall(mall: Frame, kallor: readonly Frame[]): Malkolumn[] {
  const tagna = kallor.map(() => new Set<ColumnId>())
  const ut: Malkolumn[] = visibleColumns(mall).map((malkol) => {
    const hamtning: Hamtning[] = kallor.map((kalla, j) => {
      const traff = hittaAlias(kalla, malkol.name, tagna[j]!)
      if (traff === null) return TOMT
      tagna[j]!.add(traff)
      return { fran: 'kolumn', colId: traff }
    })
    return {
      namn: malkol.name,
      // Mallens rubriker är redan unika inom sin ram.
      forslagsnamn: malkol.name,
      hamtning,
      med: true,
      // Mallen *är* beslutet. Ingen fråga ställdes, så massbesluten rör den inte.
      fraga: false,
      ledtrad: forstaVardet(mall, malkol),
    }
  })

  // Källkolumner som mallen inte har läggs till sist, obeslutade. Att tyst
  // utelämna dem vore att kasta data — samma regel som för unionen, och skälet
  // att mallen inte får vara ett tyst filter.
  return laggTillObundna(ut, kallor, tagna, () => null)
}

/** Mallens första ifyllda värde i en kolumn, som ledtråd. */
function forstaVardet(mall: Frame, col: Column): string {
  for (let r = 0; r < mall.rowCount; r++) {
    const kod = col.codes[r]
    if (kod !== undefined && kod !== 0) return col.dict[kod] ?? ''
  }
  return ''
}
