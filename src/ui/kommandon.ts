import { normalizeAlways, stripDiacritics } from '../core/locale/sv.js'
import { STADNINGAR } from '../core/ops/clean.js'
import { VERKTYG, type Verktygsnamn } from './verktyg.js'

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
}

export interface Kommandohandlare {
  oppnaFil: () => void
  exportera: () => void
  profiler: () => void
  sok: () => void
  sortera: () => void
  filter: () => void
  dubbletter: () => void
  slaIhop: () => void
  kombinera: () => void
  mall: () => void
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
}

export function byggKommandon(lage: Kommandolage, h: Kommandohandlare): Kommando[] {
  const ut: Kommando[] = []
  const lagg = (k: Kommando) => ut.push(k)
  const kol = lage.kolumn

  lagg({ id: 'oppna', grupp: 'Fil', etikett: 'Öppna fil…', ord: 'open csv excel', kor: h.oppnaFil })
  if (lage.harFil) {
    lagg({
      id: 'exportera',
      grupp: 'Fil',
      etikett: 'Exportera…',
      genvag: 'Ctrl+S',
      ord: 'spara ladda ner xlsx csv export save',
      kor: h.exportera,
    })
    lagg({
      id: 'profiler',
      grupp: 'Fil',
      etikett: 'Profiler…',
      ord: 'spara arbetsgång kör om upprepa makro',
      beskrivning: 'Spara den här filens arbetsgång och kör om den på nästa fil.',
      kor: h.profiler,
    })

    lagg({ id: 'sok', grupp: 'Tabell', etikett: 'Sök…', genvag: 'Ctrl+F', ord: 'find', kor: h.sok })
    lagg({ id: 'sortera', grupp: 'Tabell', etikett: 'Sortera…', ord: 'ordning sort', kor: h.sortera })
    lagg({ id: 'filter', grupp: 'Tabell', etikett: 'Filter…', ord: 'urval regler', kor: h.filter })
    lagg({
      id: 'dubbletter',
      grupp: 'Tabell',
      etikett: 'Dubbletter…',
      ord: 'dubletter duplicates upprepade',
      kor: h.dubbletter,
    })
    lagg({
      id: 'slaihop',
      grupp: 'Tabell',
      etikett: 'Slå ihop med en annan fil…',
      ord: 'matcha merge join koppla',
      beskrivning: 'Rader som hör ihop läggs sida vid sida, matchat på en nyckel.',
      kor: h.slaIhop,
    })
    lagg({
      id: 'oversikt',
      grupp: 'Tabell',
      etikett: 'Kolumnöversikt…',
      ord: 'översikt sammanfattning profil vad innehåller filen overview',
      beskrivning: 'Alla kolumner med ifyllnad, unika värden, problem och förslag.',
      kor: h.oversikt,
    })
    lagg({
      id: 'kombinera',
      grupp: 'Tabell',
      etikett: 'Kombinera filer…',
      ord: 'stapla lägg på varandra append',
      beskrivning: 'Filerna läggs på varandra, kolumner som betyder samma sak i samma spalt.',
      kor: h.kombinera,
    })
    lagg({
      id: 'mall',
      grupp: 'Tabell',
      etikett: 'Fyll en mall med data…',
      ord: 'mall rubriker form template mapping',
      beskrivning:
        'En fil med bara rubriker bestämmer formen, data hämtas ur de filer du väljer.',
      kor: h.mall,
    })
    if (lage.begransadVy) {
      lagg({
        id: 'visaalla',
        grupp: 'Tabell',
        etikett: 'Visa alla rader',
        ord: 'rensa filter sökning',
        kor: h.visaAllaRader,
      })
    }

    if (lage.harMarkering) {
      for (const s of STADNINGAR) {
        lagg({
          id: `stada:${s.id}`,
          grupp: 'Städa',
          etikett: s.etikett,
          beskrivning: s.beskrivning,
          ord: 'text trimma blanksteg versaler gemener',
          kor: () => h.stada(s.id),
        })
      }
    }

    if (kol !== null) {
      for (const v of VERKTYG) {
        lagg({
          id: `verktyg:${v.namn}`,
          grupp: 'Verktyg',
          etikett: `${v.etikett.replace(/…$/, '')} i ${kol}…`,
          ord: v.namn,
          kor: () => h.verktyg(v.namn),
        })
      }

      lagg({ id: 'dopom', grupp: 'Kolumn', etikett: `Byt namn på ${kol}…`, genvag: 'F2', ord: 'rename döp', kor: h.dopOm })
      lagg({ id: 'dupl', grupp: 'Kolumn', etikett: `Duplicera ${kol}`, ord: 'kopiera', kor: h.duplicera })
      lagg({
        id: 'dolj',
        grupp: 'Kolumn',
        etikett: `${lage.kolumnDold ? 'Visa' : 'Dölj'} ${kol}`,
        ord: 'hide show',
        kor: h.vaxlaDold,
      })
      lagg({ id: 'tabortkol', grupp: 'Kolumn', etikett: `Ta bort ${kol}`, ord: 'radera delete', kor: h.taBortKolumn })
      lagg({ id: 'infogakol', grupp: 'Kolumn', etikett: 'Infoga en ny kolumn', ord: 'lägg till', kor: h.infogaKolumn })
      lagg({ id: 'filtrerakol', grupp: 'Kolumn', etikett: `Filtrera på ${kol}…`, kor: h.filtreraKolumn })
      lagg({
        id: 'ogiltiga',
        grupp: 'Kolumn',
        etikett: `Visa ogiltiga värden i ${kol}`,
        ord: 'problem fel',
        kor: h.visaOgiltiga,
      })
    }

    if (lage.harMarkering) {
      lagg({ id: 'radovan', grupp: 'Rader', etikett: 'Infoga rad ovanför', kor: h.infogaRadOvan })
      lagg({ id: 'radunder', grupp: 'Rader', etikett: 'Infoga rad nedanför', kor: h.infogaRadUnder })
      lagg({ id: 'dupllrad', grupp: 'Rader', etikett: 'Dubblera markerade rader', kor: h.dupliceraRader })
      lagg({ id: 'tabortrad', grupp: 'Rader', etikett: 'Ta bort markerade rader', kor: h.taBortRader })
    }
    lagg({ id: 'tommarader', grupp: 'Rader', etikett: 'Ta bort helt tomma rader', ord: 'städa', kor: h.tommaRader })
    lagg({
      id: 'tommakolumner',
      grupp: 'Rader',
      etikett: 'Ta bort helt tomma kolumner',
      ord: 'städa',
      kor: h.tommaKolumner,
    })

    if (lage.kanAngra) {
      lagg({ id: 'angra', grupp: 'Visa', etikett: 'Ångra', genvag: 'Ctrl+Z', ord: 'undo', kor: h.angra })
    }
    if (lage.kanGoraOm) {
      lagg({ id: 'goraom', grupp: 'Visa', etikett: 'Gör om', genvag: 'Ctrl+Y', ord: 'redo', kor: h.goraOm })
    }
  }

  lagg({ id: 'tema', grupp: 'Visa', etikett: 'Byt ljust eller mörkt läge', ord: 'dark light tema', kor: h.vaxlaTema })
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
