import { normalizeAlways, stripDiacritics } from '../core/locale/sv.js'
import { STADNINGAR } from '../core/ops/clean.js'
import { VERKTYG, type Verktygsnamn } from './verktyg.js'
import { t, tf } from './sprak.js'

/**
 * Kommandolistan bakom paletten.
 *
 * Verktygsraden, kolumnmenyn, radmenyn och inspektören har var sin kopia av
 * ungefär samma åtgärder. Paletten blir en femte kopia om den byggs för hand,
 * så den byggs i stället här — ur samma `STADNINGAR` och `VERKTYG` som
 * menyerna redan delar, plus de åtgärder som bara finns som knappar.
 *
 * Sökningen är bokstavlig, precis som sök & ersätt: alla ord i frågan måste
 * finnas i kommandots text. Ingen luddig matchning, eftersom en palett som
 * gissar fel kör fel kommando — och till skillnad från ett förslag i en lista
 * går det inte att granska först.
 */

export interface Kommando {
  id: string
  etikett: string
  /** Rubrik i listan: Fil, Tabell, Kolumn, Städa, Verktyg, Rader, Visa. */
  grupp: string
  /** Extra sökord — engelska namn och synonymer som inte står i etiketten. */
  ord?: string
  genvag?: string
  beskrivning?: string
  kor: () => void
}

export interface Kommandolage {
  harFil: boolean
  /** Namnet på kolumnen kommandona gäller, eller null. */
  kolumn: string | null
  kolumnDold: boolean
  harMarkering: boolean
  kanAngra: boolean
  kanGoraOm: boolean
  begransadVy: boolean
  /** Den parkerade verkstadens filnamn, eller null när ingen finns att ta upp. */
  parkerad: string | null
}

export interface Kommandohandlare {
  oppnaFil: () => void
  klistraSomFil: () => void
  exportera: () => void
  profiler: () => void
  sok: () => void
  sortera: () => void
  filter: () => void
  dubbletter: () => void
  slaIhop: () => void
  lopnummer: () => void
  fortsattVerkstad: () => void
  kombinera: () => void
  mall: () => void
  sammanfatta: () => void
  pivot: () => void
  oversikt: () => void
  visaAllaRader: () => void
  stada: (id: string) => void
  verktyg: (namn: Verktygsnamn) => void
  dopOm: () => void
  duplicera: () => void
  vaxlaDold: () => void
  taBortKolumn: () => void
  infogaKolumn: () => void
  filtreraKolumn: () => void
  visaOgiltiga: () => void
  infogaRadOvan: () => void
  infogaRadUnder: () => void
  dupliceraRader: () => void
  taBortRader: () => void
  tommaRader: () => void
  tommaKolumner: () => void
  angra: () => void
  goraOm: () => void
  vaxlaTema: () => void
  vaxlaSprak: () => void
  vaxlaVerktygsfalt: () => void
  glomSparat: () => void
  borjaOm: () => void
}

export function byggKommandon(lage: Kommandolage, h: Kommandohandlare): Kommando[] {
  const ut: Kommando[] = []
  const lagg = (k: Kommando) => ut.push(k)
  const kol = lage.kolumn

  lagg({ id: 'oppna', grupp: t('Fil'), etikett: t('Öppna fil…'), ord: 'open csv excel', kor: h.oppnaFil })
  lagg({
    id: 'klistrasomfil',
    grupp: t('Fil'),
    etikett: t('Klistra in som ny fil'),
    genvag: 'Ctrl+Skift+V',
    ord: 'paste urklipp klippbord ny flik dokument',
    beskrivning: t(
      'Öppnar det du kopierat som en egen flik i stället för att skriva in det i tabellen du står i.',
    ),
    kor: h.klistraSomFil,
  })
  lagg({
    id: 'glomsparat',
    grupp: t('Fil'),
    etikett: t('Glöm sparade filer'),
    ord: 'rensa radera lagring återställ privat clear storage',
    beskrivning: t(
      'Tömmer det verktyget sparat i webbläsaren. Flikarna du har öppna står kvar.',
    ),
    kor: h.glomSparat,
  })
  lagg({
    id: 'borjaom',
    grupp: t('Fil'),
    etikett: t('Börja om…'),
    ord: 'rensa allt stäng nollställ minne töm reset start om',
    beskrivning: t(
      'Stänger alla filer, kastar en påbörjad sammanslagning och tömmer webbläsarens lagring. Sidan laddas om.',
    ),
    kor: h.borjaOm,
  })
  if (lage.harFil) {
    lagg({
      id: 'exportera',
      grupp: t('Fil'),
      etikett: t('Exportera…'),
      genvag: 'Ctrl+S',
      ord: 'spara ladda ner xlsx csv export save',
      kor: h.exportera,
    })
    lagg({
      id: 'profiler',
      grupp: t('Fil'),
      etikett: t('Profiler…'),
      ord: 'spara arbetsgång kör om upprepa makro',
      beskrivning: t('Spara den här filens arbetsgång och kör om den på nästa fil.'),
      kor: h.profiler,
    })

    lagg({ id: 'sok', grupp: t('Tabell'), etikett: t('Sök…'), genvag: 'Ctrl+F', ord: 'find', kor: h.sok })
    lagg({ id: 'sortera', grupp: t('Tabell'), etikett: t('Sortera…'), ord: 'ordning sort', kor: h.sortera })
    lagg({ id: 'filter', grupp: t('Tabell'), etikett: t('Filter…'), ord: 'urval regler', kor: h.filter })
    lagg({
      id: 'dubbletter',
      grupp: t('Tabell'),
      etikett: t('Dubbletter…'),
      ord: 'dubletter duplicates upprepade',
      kor: h.dubbletter,
    })
    lagg({
      id: 'lopnummer',
      grupp: t('Tabell'),
      etikett: t('Lägg till kolumn med löpnummer'),
      ord: 'radnummer id index numrera nummer ordning nr row number',
      beskrivning: t(
        'En ny kolumn först i filen med 1, 2, 3 … i radernas nuvarande ordning. Numret följer med vid export, så det går att sortera tillbaka.',
      ),
      kor: h.lopnummer,
    })
    lagg({
      id: 'slaihop',
      grupp: t('Tabell'),
      etikett: t('Slå ihop med en annan fil…'),
      ord: 'matcha merge join koppla',
      beskrivning: t('Rader som hör ihop läggs sida vid sida, matchat på en nyckel.'),
      kor: h.slaIhop,
    })
    if (lage.parkerad !== null) {
      // Bara när det finns något att gå tillbaka till. En post som nästan
      // alltid är avstängd lär sig man att hoppa över, och då hittar man den
      // inte den gången den betyder något.
      lagg({
        id: 'fortsatt-verkstad',
        grupp: t('Tabell'),
        etikett: t('Fortsätt beta av resten…'),
        ord: 'verkstad rest kvar matcha beta omatchade',
        beskrivning: tf('Tar upp den påbörjade sammanslagningen {0} igen.', lage.parkerad),
        kor: h.fortsattVerkstad,
      })
    }
    lagg({
      id: 'sammanfatta',
      grupp: t('Tabell'),
      etikett: t('Gruppera och summera…'),
      ord: 'summa summera antal snitt medel grupp group by aggregera sammanfatta total',
      beskrivning: t('En rad per grupp: summa Belopp per Ort, antal ordrar per kund.'),
      kor: h.sammanfatta,
    })
    lagg({
      id: 'pivot',
      grupp: t('Tabell'),
      etikett: t('Pivot…'),
      ord: 'pivot korstabell crosstab matris nivåer träd överblick två ledder',
      beskrivning: t('Gruppera åt två håll i en egen vy. Datat rörs inte.'),
      kor: h.pivot,
    })
    lagg({
      id: 'oversikt',
      grupp: t('Tabell'),
      etikett: t('Kolumnöversikt…'),
      ord: 'översikt sammanfattning profil vad innehåller filen overview',
      beskrivning: t('Alla kolumner med ifyllnad, unika värden, problem och förslag.'),
      kor: h.oversikt,
    })
    lagg({
      id: 'kombinera',
      grupp: t('Tabell'),
      etikett: t('Kombinera filer…'),
      ord: 'stapla lägg på varandra append',
      beskrivning: t('Filerna läggs på varandra, kolumner som betyder samma sak i samma spalt.'),
      kor: h.kombinera,
    })
    lagg({
      id: 'mall',
      grupp: t('Tabell'),
      etikett: t('Fyll en mall med data…'),
      ord: 'mall rubriker form template mapping',
      beskrivning: t(
        'En fil med bara rubriker bestämmer formen, data hämtas ur de filer du väljer.',
      ),
      kor: h.mall,
    })
    if (lage.begransadVy) {
      lagg({
        id: 'visaalla',
        grupp: t('Tabell'),
        etikett: t('Visa alla rader'),
        ord: 'rensa filter sökning',
        kor: h.visaAllaRader,
      })
    }

    if (lage.harMarkering) {
      for (const s of STADNINGAR) {
        lagg({
          id: `stada:${s.id}`,
          grupp: t('Städa'),
          etikett: t(s.etikett),
          beskrivning: t(s.beskrivning),
          ord: 'text trimma blanksteg versaler gemener',
          kor: () => h.stada(s.id),
        })
      }
    }

    if (kol !== null) {
      for (const v of VERKTYG) {
        lagg({
          id: `verktyg:${v.namn}`,
          grupp: t('Verktyg'),
          etikett: tf('{0} i {1}…', t(v.etikett).replace(/…$/, ''), kol),
          ord: v.namn,
          kor: () => h.verktyg(v.namn),
        })
      }

      lagg({ id: 'dopom', grupp: t('Kolumn'), etikett: tf('Byt namn på {0}…', kol), genvag: 'F2', ord: 'rename döp', kor: h.dopOm })
      lagg({ id: 'dupl', grupp: t('Kolumn'), etikett: tf('Duplicera {0}', kol), ord: 'kopiera', kor: h.duplicera })
      lagg({
        id: 'dolj',
        grupp: t('Kolumn'),
        etikett: tf(lage.kolumnDold ? 'Visa {0}' : 'Dölj {0}', kol),
        ord: 'hide show',
        kor: h.vaxlaDold,
      })
      lagg({ id: 'tabortkol', grupp: t('Kolumn'), etikett: tf('Ta bort {0}', kol), ord: 'radera delete', kor: h.taBortKolumn })
      lagg({ id: 'infogakol', grupp: t('Kolumn'), etikett: t('Infoga en ny kolumn'), ord: 'lägg till', kor: h.infogaKolumn })
      lagg({ id: 'filtrerakol', grupp: t('Kolumn'), etikett: tf('Filtrera på {0}…', kol), kor: h.filtreraKolumn })
      lagg({
        id: 'ogiltiga',
        grupp: t('Kolumn'),
        etikett: tf('Visa ogiltiga värden i {0}', kol),
        ord: 'problem fel',
        kor: h.visaOgiltiga,
      })
    }

    if (lage.harMarkering) {
      lagg({ id: 'radovan', grupp: t('Rader'), etikett: t('Infoga rad ovanför'), kor: h.infogaRadOvan })
      lagg({ id: 'radunder', grupp: t('Rader'), etikett: t('Infoga rad nedanför'), kor: h.infogaRadUnder })
      lagg({ id: 'dupllrad', grupp: t('Rader'), etikett: t('Dubblera markerade rader'), kor: h.dupliceraRader })
      lagg({ id: 'tabortrad', grupp: t('Rader'), etikett: t('Ta bort markerade rader'), kor: h.taBortRader })
    }
    lagg({ id: 'tommarader', grupp: t('Rader'), etikett: t('Ta bort helt tomma rader'), ord: 'städa', kor: h.tommaRader })
    lagg({
      id: 'tommakolumner',
      grupp: t('Rader'),
      etikett: t('Ta bort helt tomma kolumner'),
      ord: 'städa',
      kor: h.tommaKolumner,
    })

    if (lage.kanAngra) {
      lagg({ id: 'angra', grupp: t('Visa'), etikett: t('Ångra'), genvag: 'Ctrl+Z', ord: 'undo', kor: h.angra })
    }
    if (lage.kanGoraOm) {
      lagg({ id: 'goraom', grupp: t('Visa'), etikett: t('Gör om'), genvag: 'Ctrl+Y', ord: 'redo', kor: h.goraOm })
    }
  }

  lagg({ id: 'tema', grupp: t('Visa'), etikett: t('Byt ljust eller mörkt läge'), ord: 'dark light tema', kor: h.vaxlaTema })
  lagg({
    id: 'sprak',
    grupp: t('Visa'),
    // Etiketten säger vad klicket *gör*, inte var man är. Den svenska texten
    // är därför "byt till engelska", och dess engelska motsvarighet är "switch
    // to Swedish" — samma knapp, sett från två håll.
    etikett: t('Byt språk till engelska'),
    ord: 'language english svenska sprak byt',
    beskrivning: t(
      'Gränssnittets text byter språk. Sortering, tal och datum följer alltid svenska regler.',
    ),
    kor: h.vaxlaSprak,
  })
  lagg({
    id: 'verktygsfalt',
    grupp: t('Visa'),
    etikett: t('Byt verktygsfältets placering'),
    ord: 'toolbar lodrätt rad vertikal horisontell',
    beskrivning: t('Som rad under flikarna, eller lodrätt till vänster om kolumnerna.'),
    kor: h.vaxlaVerktygsfalt,
  })
  return ut
}

/** Text utan skiftläge och prickar, för sökning. */
function nyckel(text: string): string {
  return stripDiacritics(normalizeAlways(text)).toLocaleLowerCase('sv')
}

/**
 * Filtrerar kommandon på en fråga.
 *
 * Alla ord i frågan måste finnas någonstans i kommandots text. `ta bort kol`
 * hittar alltså "Ta bort kolumnen Ort" utan att man behöver träffa ordningen.
 */
export function sokKommandon(kommandon: readonly Kommando[], fraga: string): Kommando[] {
  const ord = nyckel(fraga).split(/\s+/).filter((o) => o !== '')
  if (ord.length === 0) return [...kommandon]
  return kommandon.filter((k) => {
    const text = nyckel(`${k.grupp} ${k.etikett} ${k.ord ?? ''}`)
    return ord.every((o) => text.includes(o))
  })
}
