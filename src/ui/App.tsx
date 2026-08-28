import { useCallback, useEffect, useMemo, useState, useRef } from 'preact/hooks'
import type { Column, ColumnId, ColumnType, Frame } from '../core/types.js'
import {
  columnIndex,
  duplicateColumn,
  findColumn,
  insertColumn,
  moveColumn,
  sammaInnehall,
  uniqueColumnName,
} from '../core/frame/frame.js'
import {
  celler,
  formatCount,
  filer as filerText,
  kolumner as kolumnerText,
  rader as raderText,
} from '../core/locale/sv.js'
import { parseDelimitedText } from '../core/csv/parse.js'
import { toDelimited } from '../core/csv/stringify.js'
import { STADNINGAR } from '../core/ops/clean.js'
import { dataWorker } from '../worker/client.js'
import {
  activeTab,
  activeTabId,
  aterstallFlikar,
  applyAppearance,
  canRedo,
  canUndo,
  clearViewSpec,
  closeTab,
  notify,
  openFrame,
  redo,
  revision,
  runStep,
  harFilter,
  harSortering,
  rensaSortering,
  sattDubbletter,
  sattFilter,
  sattSortering,
  setActiveColumn,
  setForhandsvisning,
  sorteraOm,
  sorteringenArInaktuell,
  vaxlaSortering,
  setSelection,
  setViewSpec,
  tabs,
  tathet,
  theme,
  touch,
  undo,
  undoThrough,
  viewIsLimited,
  glomSparat,
  type Tab,
} from '../state/store.js'
import {
  dupliceraRader,
  fyllNedat,
  infogaRader,
  klistraIn,
  planeraInklistring,
  redigeraCell,
  sattMarkering,
  selectableColumns,
  selectedRows,
  stadaKolumner,
  taBortRader,
  taBortTommaKolumner,
  taBortTommaRader,
  tillampaForhandsvisning,
  type PasteRequest,
} from '../state/edits.js'
import { antalCeller, cell, klamp, rect, type Selection } from '../state/selection.js'
import { getCell } from '../core/frame/column.js'
import { VirtualGrid, type Flytt } from './grid/VirtualGrid.jsx'
import { anpassadBredd } from './grid/bredd.js'
import { ColumnPanel } from './ColumnPanel.jsx'
import { Inspector } from './Inspector.jsx'
import { EmptyState } from './EmptyState.jsx'
import { ImportDialog, type ImportSettings } from './ImportDialog.jsx'
import { ExportDialog } from './ExportDialog.jsx'
import { SearchBar } from './SearchBar.jsx'
import { PasteDialog } from './PasteDialog.jsx'
import { Verktyg, ordnaVerktyg, type Verktygsnamn } from './verktyg.jsx'
import { innehallsprofil } from '../core/frame/innehall.js'
import { Statusrad } from './Statusrad.jsx'
import { SortTool } from './SortTool.jsx'
import { FilterTool } from './FilterTool.jsx'
import { DuplicateTool } from './DuplicateTool.jsx'
import { Filterrad } from './Filterrad.jsx'
import { MergeDialog } from './MergeDialog.jsx'
import { Verkstad } from './Verkstad.jsx'
import { Oversikt } from './Oversikt.jsx'
import { oppnaVerkstad, stangVerkstad, verkstad } from '../state/matchning.js'
import type { Profilsteg } from '../core/ops/profil.js'
import { Kombinera } from './Kombinera.jsx'
import { GrupperaDialog } from './GrupperaDialog.jsx'
import { ProfilDialog } from './ProfilDialog.jsx'
import { Kommandopalett } from './Kommandopalett.jsx'
import { byggKommandon } from './kommandon.js'
import { kombineraOppen, mallTabId, oppnaKombinera, vantarPaMall } from '../state/kombinera.js'
import { nyRegelId, TOMT_FILTER, type Filterregel } from '../core/ops/filter.js'
import {
  hittaDubbletter,
  overflodigaRader,
  type Behall,
  type Dubblettnyckel,
} from '../core/ops/duplicates.js'
import { beskrivSortering } from '../core/ops/sort.js'
import type { Riktning } from '../core/ops/sort.js'
import { Meny, Toastar, type MenyPost } from './parts.jsx'
import { EXEMPELFIL, EXEMPELFIL_MALL, EXEMPELFIL_ORDER } from './exempel.js'

const TYPCYKEL: ColumnType[] = ['text', 'number', 'date', 'email', 'bool']

/**
 * Verktyg som kör över hela markeringen.
 *
 * De skriver om kolumnerna på plats. De övriga *skapar* kolumner, och tolv
 * nya kolumner ur en markering är sällan vad någon menade — de arbetar på
 * den kolumn man klickade i.
 */
const FLERKOLUMNSVERKTYG = new Set<Verktygsnamn>(['datum', 'tal', 'telefon', 'ersatt'])

/** Kortar ett värde så att en menypost inte blir bredare än skärmen. */
function kort(value: string): string {
  return value.length > 28 ? `${value.slice(0, 27)}…` : value
}


interface MenyLage {
  x: number
  y: number
  poster: (MenyPost | 'avdelare')[]
}

interface PasteState {
  plan: PasteRequest
  sel: Selection
}

export function App() {
  const [kö, setKö] = useState<File[]>([])
  const [exportOppen, setExportOppen] = useState(false)
  const [slaIhopOppen, setSlaIhopOppen] = useState(false)
  const [profilerOppna, setProfilerOppna] = useState(false)
  const [palettOppen, setPalettOppen] = useState(false)
  const [oversiktOppen, setOversiktOppen] = useState(false)
  /**
   * Grupperingsdialogen, med kolumnen man öppnade den från.
   *
   * `null` betyder stängd; `{ startkolumn: null }` betyder öppnad utan att
   * någon kolumn pekats ut, alltså från verktygsraden eller paletten.
   */
  const [sammanfatta, setSammanfatta] = useState<{ startkolumn: ColumnId | null } | null>(null)
  /**
   * Vilken rad i varje dubblettgrupp som stannar.
   *
   * Valet bor här och inte i dubblettpanelen, eftersom det är rutnätet som
   * ritar och tar emot det — panelen beskriver bara vad som räknas som lika.
   * `egnaBehallna` går på gruppnummer, som gäller så länge grupperingen är
   * densamma; en ny nyckel nollställer den.
   */
  const [behall, setBehall] = useState<Behall>('forsta')
  const [egnaBehallna, setEgnaBehallna] = useState<Map<number, number>>(new Map())
  const palettFil = useRef<HTMLInputElement>(null)
  const [meny, setMeny] = useState<MenyLage | null>(null)
  const [laddar, setLaddar] = useState<string | null>(null)
  const [slappOver, setSlappOver] = useState(false)
  const [sokOppen, setSokOppen] = useState(false)
  const [inklistring, setInklistring] = useState<PasteState | null>(null)
  /**
   * Vilket städverktyg som är öppet, och på vilka kolumner.
   *
   * Kolumnerna fångas när verktyget öppnas och inte löpande ur markeringen:
   * flyttar man markören medan panelen står öppen ska förhandsvisningen ligga
   * kvar på det man valde.
   */
  const [verktyg, setVerktyg] = useState<{ id: Verktygsnamn; colIds: ColumnId[] } | null>(null)
  /**
   * Tabellverktyg i högerpanelen — de som inte hör till en enskild kolumn.
   * Sortering, och i nästa steg filter och dubbletter.
   */
  const [tabellverktyg, setTabellverktyg] = useState<'sortera' | 'filter' | 'dubbletter' | null>(
    null,
  )

  const tab = activeTab.value
  const frame = tab?.frame ?? null
  const rev = revision.value

  useEffect(() => applyAppearance(), [theme.value, tathet.value])

  /* ---------- Filer ---------- */

  const oppnaFiler = useCallback((files: File[]) => {
    const tillatna = files.filter(
      (f) => /\.(csv|txt|tsv|xlsx)$/i.test(f.name) || f.type.startsWith('text/'),
    )
    if (tillatna.length === 0) {
      notify('Verktyget öppnar CSV, TXT, TSV och Excel-filer (.xlsx).', { ton: 'varning' })
      return
    }
    setKö((current) => [...current, ...tillatna])
  }, [])

  const laddaFil = async (file: File, settings: ImportSettings) => {
    setKö((current) => current.slice(1))
    setLaddar(file.name)
    try {
      const parsed = await dataWorker.parse(
        file,
        {
          delimiter: settings.delimiter,
          encoding: settings.encoding,
          trimFields: settings.trimFields,
          skipEmptyRows: settings.skipEmptyRows,
          headerRow: settings.headerRow,
        },
        undefined,
        /\.xlsx$/i.test(file.name)
          ? { sheet: settings.sheet, decimal: settings.decimal }
          : undefined,
      )
      /*
       * Samma fil två gånger är ett vanligt misstag när man hämtar exporter
       * ur flera system. Det sägs som en varning och inte som en fråga —
       * ibland *vill* man ha två kopior att jämföra, och en dialog som står
       * i vägen för det är värre än en mening som går att strunta i.
       * `duplicate-file` fanns redan som varningstyp.
       */
      const dubblett = tabs.value.find((t) => sammaInnehall(t.frame, parsed))
      if (dubblett) {
        parsed.meta.warnings.push({
          kind: 'duplicate-file',
          message: `Innehållet är identiskt med den redan öppna fliken ”${dubblett.frame.name}”.`,
        })
      }
      const flik = openFrame(parsed)
      // Filen öppnades från kombineringsvyns "Öppna mallfil…". Den gick samma
      // väg som alla andra filer, genom importdialogen — en mall som lästs med
      // fel avgränsare blir annars en enda kolumn som heter hela rubrikraden.
      if (vantarPaMall.value) {
        mallTabId.value = flik.id
        vantarPaMall.value = false
      }
      const varningar = parsed.meta.warnings.filter((w) => w.kind !== 'encoding-uncertain')
      notify(
        `${file.name} öppnad — ${formatCount(parsed.rowCount)} rader, ${formatCount(parsed.columns.length)} kolumner.` +
          (dubblett ? ` Identisk med ”${dubblett.frame.name}”.` : '') +
          (varningar.length > (dubblett ? 1 : 0)
            ? ` ${varningar.length} sak${varningar.length === 1 ? '' : 'er'} att titta på.`
            : ''),
        { ton: varningar.length > 0 ? 'varning' : 'info' },
      )
    } catch (error) {
      vantarPaMall.value = false
      notify(`Kunde inte öppna ${file.name}: ${(error as Error).message}`, { ton: 'fara' })
    } finally {
      setLaddar(null)
    }
  }

  const exempelfil = (text: string, namn: string) =>
    new File([new Blob([text], { type: 'text/csv' })], namn, { type: 'text/csv' })

  const oppnaExempel = () => {
    setKö((current) => [...current, exempelfil(EXEMPELFIL, 'exempel-kunder.csv')])
  }

  /** Båda exempelfilerna, så att sammanslagningen går att prova direkt. */
  const oppnaExempelpar = () => {
    setKö((current) => [
      ...current,
      exempelfil(EXEMPELFIL, 'exempel-kunder.csv'),
      exempelfil(EXEMPELFIL_ORDER, 'exempel-order.csv'),
    ])
  }

  /** Exempelmallen, så att mallvägen går att prova utan egen fil. */
  const oppnaExempelmall = () => {
    vantarPaMall.value = true
    setKö((current) => [...current, exempelfil(EXEMPELFIL_MALL, 'exempel-mall.csv')])
  }

  /** Öppnar text från urklipp som en ny flik. */
  const oppnaText = (text: string, namn: string) => {
    const blob = new Blob([text], { type: 'text/csv' })
    setKö((current) => [...current, new File([blob], namn, { type: 'text/csv' })])
  }

  /* ---------- Kolumnåtgärder ---------- */

  /**
   * Kör en kolumnåtgärd som ett ångringsbart steg.
   *
   * `profil` är samma ändring uttryckt som data. Åtgärder utan beskrivning —
   * flytta, infoga och duplicera — går inte att köra om på en annan fil utan
   * att gissa: positionen och namnet ”Ny kolumn” betyder ingenting där.
   */
  const kor = (
    label: string,
    kind: string,
    apply: () => void,
    revert: () => void,
    profil?: Profilsteg,
  ) => {
    if (!tab) return
    runStep(tab, { label, kind, apply, revert, profil })
  }

  const flyttaKolumn = (id: ColumnId, toIndex: number) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col) return
    const from = columnIndex(frame, id)
    if (from === toIndex) return
    kor(
      `Flyttade kolumnen ${col.name}`,
      'move',
      () => moveColumn(frame, id, toIndex),
      () => moveColumn(frame, id, from),
    )
  }

  const vaxlaDold = (id: ColumnId) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col) return
    const nyDold = !col.hidden
    kor(
      `${nyDold ? 'Dolde' : 'Visade'} kolumnen ${col.name}`,
      'hide',
      () => {
        col.hidden = nyDold
      },
      () => {
        col.hidden = !nyDold
      },
      { typ: 'doljKolumn', kolumn: col.name, dold: nyDold },
    )
  }

  const infogaKolumn = (atIndex?: number) => {
    if (!frame) return
    const namn = uniqueColumnName(frame.columns.map((c) => c.name), 'Ny kolumn')
    const index = atIndex ?? frame.columns.length
    let skapad: ColumnId | null = null
    kor(
      `Infogade kolumnen ${namn}`,
      'insert',
      () => {
        const col = insertColumn(frame, namn, index)
        skapad = col.id
        setActiveColumn(col.id)
      },
      () => {
        if (skapad) {
          const at = columnIndex(frame, skapad)
          if (at !== -1) frame.columns.splice(at, 1)
        }
      },
    )
  }

  const taBortKolumn = (id: ColumnId) => {
    if (!frame || !tab) return
    const col = findColumn(frame, id)
    if (!col) return
    const index = columnIndex(frame, id)
    kor(
      `Tog bort kolumnen ${col.name}`,
      'drop',
      () => {
        frame.columns.splice(columnIndex(frame, id), 1)
      },
      () => {
        frame.columns.splice(index, 0, col)
      },
      { typ: 'taBortKolumn', kolumn: col.name },
    )
    notify(`Kolumnen ”${col.name}” togs bort.`, {
      atgard: { etikett: 'Ångra', kor: () => tab && undo(tab) },
    })
  }

  const dopOmKolumn = (id: ColumnId) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col) return
    const svar = window.prompt(`Nytt namn för kolumnen ”${col.name}”`, col.name)
    if (svar === null) return
    const nytt = uniqueColumnName(
      frame.columns.filter((c) => c.id !== id).map((c) => c.name),
      svar,
    )
    const gammalt = col.name
    if (nytt === gammalt) return
    kor(
      `Bytte namn: ${gammalt} → ${nytt}`,
      'rename',
      () => {
        col.name = nytt
      },
      () => {
        col.name = gammalt
      },
      { typ: 'dopOm', kolumn: gammalt, till: nytt },
    )
  }

  const dupliceraKolumn = (id: ColumnId) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col) return
    let skapad: ColumnId | null = null
    kor(
      `Duplicerade kolumnen ${col.name}`,
      'duplicate',
      () => {
        skapad = duplicateColumn(frame, id)?.id ?? null
      },
      () => {
        if (skapad) {
          const at = columnIndex(frame, skapad)
          if (at !== -1) frame.columns.splice(at, 1)
        }
      },
    )
  }

  const sattTyp = (id: ColumnId, typ: ColumnType) => {
    if (!frame) return
    const col = findColumn(frame, id)
    // Att välja den typ kolumnen redan har är inte ett tomt val: det låser
    // den, så att automatisk omtolkning inte gör 01234 till ett tal.
    if (!col || (col.type === typ && col.typeLocked)) return
    const gammal = col.type
    const gammalLast = col.typeLocked
    kor(
      `Satte typ på ${col.name}: ${typ}`,
      'type',
      () => {
        col.type = typ
        // Ett manuellt val ska inte skrivas över av automatisk omtolkning.
        col.typeLocked = true
      },
      () => {
        col.type = gammal
        col.typeLocked = gammalLast
      },
      { typ: 'sattTyp', kolumn: col.name, kolumntyp: typ },
    )
  }

  const cyklaTyp = (id: ColumnId) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col) return
    sattTyp(id, TYPCYKEL[(TYPCYKEL.indexOf(col.type) + 1) % TYPCYKEL.length]!)
  }

  /**
   * Bredd efter innehållet.
   *
   * Går genom `andraBredd` och hamnar därför inte i ångra-historiken —
   * bredd är utseende, inte data.
   */
  const anpassaKolumnbredd = (id: ColumnId) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col) return
    const bredd = anpassadBredd(col, frame)
    if (bredd !== null) andraBredd(id, bredd)
  }

  const andraBredd = (id: ColumnId, bredd: number) => {
    if (!frame) return
    const col = findColumn(frame, id)
    if (!col) return
    // Bredd är utseende, inte data, och hör inte hemma i ångra-historiken —
    // annars känns Ctrl+Z trasigt när den backar en kolumnbredd.
    col.width = bredd
    touch()
  }

  /* ---------- Vy ---------- */

  const visaOgiltiga = (id: ColumnId) => {
    if (!tab || !frame) return
    // "Visa raderna som inte går att tolka" är en filterregel som alla andra
    // sedan etapp 4 — men den *ersätter* filtret i stället för att lägga sig
    // ovanpå, så att knappen betyder samma sak som den alltid gjort.
    sattFilter(tab, {
      koppling: 'alla',
      regler: [{ id: nyRegelId(), colId: id, operator: 'ogiltig', varde: '' }],
    })
    const col = findColumn(frame, id)
    notify(
      `Visar ${formatCount(frame.view.length)} rader där ”${col?.name ?? ''}” inte går att tolka.`,
      { atgard: { etikett: 'Visa alla igen', kor: () => tab && clearViewSpec(tab) } },
    )
  }

  /* ---------- Markering och redigering ---------- */

  const markering = tab?.markering ?? null
  const synligaKolumner = tab ? selectableColumns(tab) : []

  /** Grupperingen rutnätet ritar, eller null när dubblettvyn är av. */
  const dubblettgrupper = tab?.viewSpec.dubbletter ? (tab.ordning?.grupper ?? null) : null

  /**
   * Raderna som stannar, en per grupp.
   *
   * Förvalet är den första raden i filen, alltså precis vad *Behåll den
   * första* gör. Att rita förvalet i stället för tomma ringar gör att man ser
   * vad som händer om man inte rör någonting.
   */
  const behallnaRader = useMemo(() => {
    if (!dubblettgrupper || behall !== 'valda') return null
    const forsta = new Map<number, number>()
    for (let r = 0; r < dubblettgrupper.grupp.length; r++) {
      const g = dubblettgrupper.grupp[r]!
      if (g !== 0 && !forsta.has(g)) forsta.set(g, r)
    }
    const ut = new Set<number>()
    for (const [g, r] of forsta) ut.add(egnaBehallna.get(g) ?? r)
    return ut
  }, [dubblettgrupper, egnaBehallna, behall, rev])

  /**
   * Läser flik och markering ur tillståndet i stället för ur renderingens
   * closure.
   *
   * Tangentbords- och urklippshanterare registreras i en effekt, och den
   * effekten körs *efter* renderingen. Klickar man på en cell och klistrar in
   * innan effekten hunnit registreras om, ser hanteraren fortfarande den
   * gamla markeringen och skriver på fel plats. Det var precis vad som hände
   * i CI, där maskinen klickar och klistrar in inom samma bildruta.
   */
  const nuLage = (): { tab: Tab; frame: Frame; kolumner: Column[]; sel: Selection | null } | null => {
    const t = activeTab.value
    if (!t) return null
    return { tab: t, frame: t.frame, kolumner: selectableColumns(t), sel: t.markering }
  }

  const flyttaMarkering = (dRad: number, dKol: number, utoka: boolean, tillKant: boolean) => {
    const nu = nuLage()
    if (!nu) return
    const { tab, frame, kolumner: synligaKolumner } = nu
    if (frame.view.length === 0 || synligaKolumner.length === 0) return
    const nuvarande = nu.sel ?? cell(0, 0)
    const sistaRad = frame.view.length - 1
    const sistaKol = synligaKolumner.length - 1
    const rad = tillKant
      ? dRad > 0
        ? sistaRad
        : dRad < 0
          ? 0
          : nuvarande.fokusRad
      : nuvarande.fokusRad + dRad
    const kol = tillKant
      ? dKol > 0
        ? sistaKol
        : dKol < 0
          ? 0
          : nuvarande.fokusKol
      : nuvarande.fokusKol + dKol
    const ny: Selection = utoka
      ? { ...nuvarande, fokusRad: rad, fokusKol: kol }
      : { ankareRad: rad, ankareKol: kol, fokusRad: rad, fokusKol: kol }
    setSelection(tab, klamp(ny, frame.view.length, synligaKolumner.length))
  }

  const startaRedigering = (rad?: number, kol?: number) => {
    const nu = nuLage()
    if (!nu || !nu.sel) return
    nu.tab.redigerar = { rad: rad ?? nu.sel.fokusRad, kol: kol ?? nu.sel.fokusKol }
    touch()
  }

  const avslutaRedigering = (rad: number, kol: number, value: string, flytt: Flytt) => {
    if (!tab) return
    tab.redigerar = null
    redigeraCell(tab, rad, kol, value)
    if (flytt === 'ned') flyttaMarkering(1, 0, false, false)
    else if (flytt === 'hoger') flyttaMarkering(0, 1, false, false)
    else touch()
  }

  const kopieraMarkering = async () => {
    const nu = nuLage()
    if (!nu || !nu.sel) return
    const r = rect(nu.sel)
    const kolumner = nu.kolumner.slice(r.k1, r.k2 + 1)
    const rader = selectedRows(nu.tab, nu.sel)
    try {
      await navigator.clipboard.writeText(toDelimited(kolumner, rader, '\t'))
      notify(
        `${celler(rader.length * kolumner.length)} kopierade. Klistra in direkt i Excel.`,
      )
    } catch {
      notify('Webbläsaren tillät inte kopiering till urklipp.', { ton: 'varning' })
    }
  }

  const klippUtMarkering = async () => {
    await kopieraMarkering()
    const nu = nuLage()
    if (!nu || !nu.sel) return
    const andrade = sattMarkering(nu.tab, nu.sel, '')
    if (andrade > 0) {
      notify(`Klippte ut ${celler(andrade)}.`, {
        atgard: { etikett: 'Ångra', kor: () => undo(nu.tab) },
      })
    }
  }

  /**
   * Klistrar in från menyn.
   *
   * Ctrl+V går genom webbläsarens paste-händelse och kräver ingen
   * behörighet. En menypost måste läsa urklippet själv, vilket
   * webbläsaren får neka — och då sägs det rakt ut i stället för att
   * ingenting händer.
   */
  const klistraInFranMeny = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim() !== '') forbereKlistraIn(text)
    } catch {
      notify('Webbläsaren tillät inte att urklippet lästes. Tryck Ctrl+V i stället.', {
        ton: 'varning',
      })
    }
  }

  const tomMarkering = () => {
    const nu = nuLage()
    if (!nu || !nu.sel) return
    const andrade = sattMarkering(nu.tab, nu.sel, '')
    if (andrade > 0) {
      notify(`Tömde ${celler(andrade)}.`, {
        atgard: { etikett: 'Ångra', kor: () => undo(nu.tab) },
      })
    }
  }

  /**
   * Fyller hela markeringen med ett värde.
   *
   * `sattMarkering` fanns redan men nåddes bara av Delete, alltså med tomma
   * strängen. Att skriva samma ortsnamn i fyrtio celler för hand är precis
   * det slit verktyget finns för.
   */
  const fyllMarkering = () => {
    const nu = nuLage()
    if (!nu || !nu.sel) return
    const antal = antalCeller(nu.sel)
    const svar = window.prompt(`Fyll ${celler(antal)} med värdet`, '')
    if (svar === null) return
    const andrade = sattMarkering(nu.tab, nu.sel, svar)
    if (andrade === 0) {
      notify('Cellerna hade redan det värdet.')
      return
    }
    notify(`Fyllde ${celler(andrade)}.`, {
      atgard: { etikett: 'Ångra', kor: () => undo(nu.tab) },
    })
  }

  const forbereKlistraIn = (text: string) => {
    const nu = nuLage()
    if (!nu || !nu.sel) return
    const { tab, sel } = nu
    const { rows } = parseDelimitedText(text)
    if (rows.length === 0) return
    const plan = planeraInklistring(tab, sel, rows)
    if (plan.extraRader === 0 && plan.extraKolumner === 0) {
      const andrade = klistraIn(tab, sel, plan, false)
      notify(`Klistrade in ${celler(andrade)}.`, {
        atgard: { etikett: 'Ångra', kor: () => undo(tab) },
      })
      return
    }
    setInklistring({ plan, sel })
  }

  /* ---------- Rader ---------- */

  const taBortMarkeradeRader = () => {
    const nu = nuLage()
    if (!nu || !nu.sel) return
    const rader = selectedRows(nu.tab, nu.sel)
    if (rader.length === 0) return
    taBortRader(nu.tab, rader)
    notify(`Tog bort ${raderText(rader.length)}.`, {
      atgard: { etikett: 'Ångra', kor: () => undo(nu.tab) },
    })
  }

  const stadaTommaRader = () => {
    if (!tab) return
    const n = taBortTommaRader(tab)
    notify(
      n === 0 ? 'Inga helt tomma rader hittades.' : `Tog bort ${raderText(n)} som var helt tomma.`,
      n > 0 ? { atgard: { etikett: 'Ångra', kor: () => tab && undo(tab) } } : undefined,
    )
  }

  const stadaTommaKolumner = () => {
    if (!tab) return
    const n = taBortTommaKolumner(tab)
    notify(
      n === 0
        ? 'Inga helt tomma kolumner hittades.'
        : `Tog bort ${kolumnerText(n)} som var helt tomma.`,
      n > 0 ? { atgard: { etikett: 'Ångra', kor: () => tab && undo(tab) } } : undefined,
    )
  }

  const stada = (id: string) => {
    const nu = nuLage()
    if (!nu || !nu.sel) return
    const { tab } = nu
    const stadning = STADNINGAR.find((s) => s.id === id)
    if (!stadning) return
    const r = rect(nu.sel)
    const kolumner = nu.kolumner.slice(r.k1, r.k2 + 1)
    const andrade = stadaKolumner(tab, kolumner, stadning)
    if (andrade === 0) {
      notify(`${stadning.etikett}: inget att ändra i markeringen.`)
      return
    }
    notify(
      `${stadning.etikett} — ${celler(andrade)} ändrades i ${
        kolumner.length === 1 ? `”${kolumner[0]!.name}”` : kolumnerText(kolumner.length)
      }.`,
      { atgard: { etikett: 'Ångra', kor: () => undo(tab) } },
    )
  }

  /* ---------- Städverktyg ---------- */

  const oppnaVerktyg = (namn: Verktygsnamn, colIds: ColumnId | ColumnId[]) => {
    const lista = Array.isArray(colIds) ? colIds : [colIds]
    const forsta = lista[0]
    if (forsta === undefined) return
    setActiveColumn(forsta)
    setTabellverktyg(null)
    setOversiktOppen(false)
    setVerktyg({ id: namn, colIds: lista })
  }

  const stangVerktyg = () => {
    const nu = nuLage()
    if (nu) setForhandsvisning(nu.tab, null)
    setVerktyg(null)
  }

  // Högerpanelen rymmer ett verktyg i taget: att öppna sorteringen stänger
  // ett öppet kolumnverktyg, och därmed också dess förhandsvisning.
  const oppnaTabellverktyg = (namn: 'sortera' | 'filter' | 'dubbletter') => {
    const nu = nuLage()
    if (nu) setForhandsvisning(nu.tab, null)
    setVerktyg(null)
    setTabellverktyg(namn)
  }

  /**
   * Tar bort de överflödiga raderna i varje dubblettgrupp.
   *
   * Vyn stängs efteråt: en dubblettvy utan dubbletter kvar ser trasig ut,
   * som om verktyget tappat bort sig.
   */
  /**
   * Lägger till en regel på en kolumn och öppnar filterpanelen.
   *
   * Regeln läggs till i stället för att ersätta filtret — man bygger vidare
   * på det man redan har. `visaOgiltiga` är undantaget, se där.
   */
  const filtreraKolumn = (id: ColumnId, delta: Partial<Filterregel> = {}) => {
    const nu = nuLage()
    if (!nu) return
    const nuvarande = nu.tab.viewSpec.filter ?? TOMT_FILTER
    sattFilter(nu.tab, {
      ...nuvarande,
      regler: [
        ...nuvarande.regler,
        { id: nyRegelId(), colId: id, operator: 'ar', varde: '', ...delta },
      ],
    })
    setActiveColumn(id)
    oppnaTabellverktyg('filter')
  }

  /* ---------- Menyer ---------- */

  /**
   * Verktygen som menyposter, det passande först.
   *
   * Vilka som passar avgörs av innehållet — se `innehallsprofil` — och räknas
   * på den kolumn man klickade i. De övriga göms inte, de hamnar under *Fler
   * verktyg*.
   *
   * `kolumner` är hela markeringen med den klickade först. Datum, tal,
   * telefon och sök & ersätt kör på allihop; de verktyg som skapar nya
   * kolumner tar den första.
   */
  const verktygsposter = (kolumner: Column[], klickad?: Column): (MenyPost | 'avdelare')[] => {
    const col = klickad ?? kolumner[0]!
    const ider = kolumner.map((c) => c.id)
    const flera = kolumner.length > 1
    const ordning = ordnaVerktyg(innehallsprofil(col))
    const post = (namn: Verktygsnamn, etikett: string, skal?: string): MenyPost => {
      // Bara de omskrivande verktygen tar hela markeringen. De som skapar
      // kolumner arbetar på den man klickade i — tolv nya kolumner ur en
      // markering är sällan vad någon menade.
      const manga = flera && FLERKOLUMNSVERKTYG.has(namn)
      return {
        etikett: manga
          ? `${etikett.replace(/…$/, '')} i ${kolumnerText(kolumner.length)}…`
          : etikett,
        skal,
        kor: () => oppnaVerktyg(namn, manga ? ider : [col.id]),
      }
    }
    return [
      ...ordning.passande.map((p) => post(p.post.namn, p.post.etikett, p.skal)),
      {
        etikett: 'Fler verktyg',
        undermeny: ordning.ovriga.map((v) => post(v.namn, v.etikett)),
      },
    ]
  }

  const radmenyposter = (): (MenyPost | 'avdelare')[] =>
    radMeny({
      infogaFore: () => {
        const nu = nuLage()
        if (nu?.sel) infogaRader(nu.tab, nu.sel.fokusRad, 1, false)
      },
      infogaEfter: () => {
        const nu = nuLage()
        if (nu?.sel) infogaRader(nu.tab, nu.sel.fokusRad, 1, true)
      },
      duplicera: () => {
        const nu = nuLage()
        if (nu?.sel) dupliceraRader(nu.tab, selectedRows(nu.tab, nu.sel))
      },
      taBort: taBortMarkeradeRader,
    })

  const kolumnmenyposter = (id: ColumnId): (MenyPost | 'avdelare')[] => {
    if (!frame || !tab) return []
    const col = findColumn(frame, id)
    if (!col) return []
    return kolumnMeny(id, {
      dopOm: dopOmKolumn,
      duplicera: dupliceraKolumn,
      vaxlaDold,
      infogaFore: (i) => infogaKolumn(columnIndex(frame, i)),
      infogaEfter: (i) => infogaKolumn(columnIndex(frame, i) + 1),
      flyttaForst: (i) => flyttaKolumn(i, 0),
      flyttaSist: (i) => flyttaKolumn(i, frame.columns.length - 1),
      anpassaBredd: (i) => anpassaKolumnbredd(i),
      visaOgiltiga,
      verktyg: verktygsposter([col]),
      filtrera: (i) => filtreraKolumn(i),
      namn: col.name,
      sammanfatta: (i) => setSammanfatta({ startkolumn: i }),
      sortera: (i, riktning) => sattSortering(tab, [{ colId: i, riktning }]),
      laggSortering: (i) => vaxlaSortering(tab, i, true),
      sortriktning: tab.viewSpec.sortering?.find((n) => n.colId === id)?.riktning ?? null,
      taBort: taBortKolumn,
      dold: col.hidden,
    })
  }

  /**
   * Cellmenyn.
   *
   * Kortare än kolumnmenyn med flit. Kolumnens sällanåtgärder — flytta
   * först, infoga tom kolumn, byt namn — hör hemma på rubriken. Det är hela
   * skillnaden mellan en meny som hjälper och en som måste läsas.
   */
  const cellmenyposter = (rad: number, kol: number): (MenyPost | 'avdelare')[] => {
    const nu = nuLage()
    if (!nu) return []
    const col = nu.kolumner[kol]
    const fysisk = nu.frame.view[rad]
    if (!col || fysisk === undefined) return []
    const varde = getCell(col, fysisk)
    const flera = nu.sel !== null && antalCeller(nu.sel) > 1
    /*
     * De omskrivande verktygen körs på hela markeringens kolumner, i
     * rutnätets ordning. De kolumnskapande arbetar på den man klickade i.
     */
    const r = nu.sel ? rect(nu.sel) : null
    const verktygskolumner = r ? nu.kolumner.slice(r.k1, r.k2 + 1) : [col]

    return [
      { etikett: 'Klipp ut', genvag: 'Ctrl+X', kor: () => void klippUtMarkering() },
      { etikett: 'Kopiera', genvag: 'Ctrl+C', kor: () => void kopieraMarkering() },
      { etikett: 'Klistra in', genvag: 'Ctrl+V', kor: () => void klistraInFranMeny() },
      'avdelare',
      {
        etikett: flera ? 'Fyll markeringen med ett värde…' : 'Skriv ett värde…',
        kor: fyllMarkering,
      },
      { etikett: 'Fyll nedåt', genvag: 'Ctrl+D', kor: () => {
        const n = nuLage()
        if (!n?.sel) return
        const andrade = fyllNedat(n.tab, n.sel)
        if (andrade > 0) {
          notify(`Fyllde nedåt i ${celler(andrade)}.`, {
            atgard: { etikett: 'Ångra', kor: () => undo(n.tab) },
          })
        }
      } },
      { etikett: 'Töm', genvag: 'Delete', kor: tomMarkering },
      'avdelare',
      {
        etikett: `Filtrera på ”${kort(varde)}”`,
        inaktiv: varde === '' ? 'Cellen är tom. Filtrera på kolumnen i stället.' : undefined,
        kor: () => filtreraKolumn(col.id, { operator: 'iLista', varden: [varde] }),
      },
      { etikett: `Sortera på ${col.name}`, kor: () => vaxlaSortering(nu.tab, col.id, false) },
      {
        etikett: `Gruppera på ${col.name}…`,
        skal: 'en rad per värde, med summa och antal för resten av kolumnerna',
        kor: () => setSammanfatta({ startkolumn: col.id }),
      },
      'avdelare',
      ...verktygsposter(verktygskolumner, col),
      'avdelare',
      { etikett: 'Radens åtgärder', undermeny: radmenyposter() },
    ]
  }

  /**
   * Gör filtrets urval permanent.
   *
   * Filtret rensas efteråt: en vy som inte längre döljer någonting ser
   * trasig ut, precis som dubblettvyn utan dubbletter kvar. Raderna går att
   * ångra; vyn ligger utanför historiken, som all annan vy-inställning.
   */
  const tillampaUrval = (behall: boolean) => {
    const nu = nuLage()
    if (!nu) return
    const synliga = new Set(nu.frame.view)
    const bort: number[] = []
    for (let r = 0; r < nu.frame.rowCount; r++) {
      if (synliga.has(r) !== behall) bort.push(r)
    }
    if (bort.length === 0) {
      notify(behall ? 'Alla rader visas redan.' : 'Det finns inga rader att ta bort.')
      return
    }
    taBortRader(nu.tab, bort)
    sattFilter(nu.tab, TOMT_FILTER)
    setTabellverktyg(null)
    notify(
      behall
        ? `Behöll ${raderText(nu.frame.rowCount)} och tog bort ${raderText(bort.length)}.`
        : `Tog bort ${raderText(bort.length)}.`,
      { atgard: { etikett: 'Ångra', kor: () => undo(nu.tab) } },
    )
  }

  const taBortDubbletter = (nyckel: Dubblettnyckel, hur: Behall) => {
    const nu = nuLage()
    if (!nu || !frame) return
    const grupper = hittaDubbletter(frame, nyckel)
    const bort = overflodigaRader(grupper, hur === 'valda' ? 'forsta' : hur, egnaBehallna)
    if (bort.length === 0) return
    taBortRader(nu.tab, bort)
    sattDubbletter(nu.tab, null)
    setEgnaBehallna(new Map())
    setTabellverktyg(null)
    notify(`Tog bort ${raderText(bort.length)} som var dubbletter.`, {
      atgard: { etikett: 'Ångra', kor: () => undo(nu.tab) },
    })
  }

  // Ett öppet verktyg hör till sin flik. Byter man flik städas både panelen
  // och förhandsvisningen bort från den flik man lämnar — annars skulle den
  // ligga kvar och ritas nästa gång man kom tillbaka, utan panel som
  // förklarar den.
  useEffect(() => {
    const lamnad = activeTab.value
    if (!lamnad) return
    return () => {
      setForhandsvisning(lamnad, null)
      setVerktyg(null)
      setTabellverktyg(null)
    }
  }, [tab?.id])

  /* ---------- Tangentbord ---------- */

  /**
   * Lägen som tangentbordshanteraren måste se *direkt*.
   *
   * Hanteraren registreras i en effekt, och effekter körs efter ritningen.
   * Paletten kan alltså stå på skärmen medan hanteraren fortfarande bär det
   * gamla värdet — och då gick Escape till rutnätet, som inte gör någonting
   * med den, i stället för till paletten. Lokalt hann effekten alltid före;
   * i CI, med två arbetare på en långsammare maskin, gjorde den det inte.
   *
   * Ref:en skrivs under renderingen och är därför sann i samma ögonblick som
   * paletten syns. Samma resonemang gäller översikten och sökraden: de har
   * inte visat felet, men de bygger på samma antagande.
   */
  const lagen = useRef({ palett: false, meny: false, oversikt: false, sok: false })
  lagen.current.palett = palettOppen
  lagen.current.meny = meny !== null
  lagen.current.oversikt = oversiktOppen
  lagen.current.sok = sokOppen

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const iFalt = target !== null && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)
      const mod = e.ctrlKey || e.metaKey

      // Paletten öppnas före allt annat. Den är vägen in för den som vet vad
      // hen vill göra men inte var knappen sitter, och då duger det inte att
      // den kräver en öppen fil eller att man först stängt en egen vy.
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalettOppen((oppen) => !oppen)
        return
      }
      /*
       * Paletten har egna tangenter: pilarna väljer i listan och Escape
       * stänger. Rutnätets genvägar får inte gå igång bakom den.
       *
       * Escape hanteras här och inte bara i palettens fält, eftersom fältet
       * kan sakna fokus: under den korta stunden innan fokus landat, och
       * efteråt om man klickat någon annanstans. En Escape som ibland inte
       * stänger är värre än ingen Escape alls.
       */
      if (lagen.current.palett) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setPalettOppen(false)
        }
        return
      }

      /*
       * En öppen meny äger Escape. Står fokus i menyn tar den hand om
       * tangenten själv och stoppar händelsen; hit kommer den bara när fokus
       * hamnat någon annanstans. Utan det gick Escape vidare till rutnätet,
       * som inte gör någonting med den, och menyn blev omöjlig att stänga
       * med tangentbordet.
       */
      if (lagen.current.meny) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setMeny(null)
        }
        return
      }

      const nu = nuLage()
      if (!nu) return
      // Med en egen vy öppen är rutnätet inte det man tittar på. Ctrl+Z hade
      // annars ångrat i den aktiva fliken medan rättningen gjordes i den
      // andra, och piltangenterna hade flyttat en markering ingen ser.
      if (verkstad.value || kombineraOppen.value || lagen.current.oversikt) return
      const { tab, frame, kolumner: synligaKolumner, sel: markering } = nu

      if (mod) {
        const tangent = e.key.toLowerCase()
        if (tangent === 'z' && !e.shiftKey) {
          e.preventDefault()
          const step = undo(tab)
          if (step) notify(`Ångrade: ${step.label}`)
        } else if (tangent === 'y' || (tangent === 'z' && e.shiftKey)) {
          e.preventDefault()
          const step = redo(tab)
          if (step) notify(`Gjorde om: ${step.label}`)
        } else if (tangent === 's') {
          e.preventDefault()
          setExportOppen(true)
        } else if (tangent === 'f') {
          e.preventDefault()
          setSokOppen(true)
        } else if (tangent === 'a' && !iFalt) {
          e.preventDefault()
          if (frame.view.length > 0 && synligaKolumner.length > 0) {
            setSelection(tab, {
              ankareRad: 0,
              ankareKol: 0,
              fokusRad: frame.view.length - 1,
              fokusKol: synligaKolumner.length - 1,
            })
          }
        } else if (tangent === 'c' && !iFalt) {
          e.preventDefault()
          void kopieraMarkering()
        } else if (tangent === 'd' && !iFalt && markering) {
          e.preventDefault()
          const andrade = fyllNedat(tab, markering)
          if (andrade > 0) {
            notify(`Fyllde nedåt i ${celler(andrade)}.`, {
              atgard: { etikett: 'Ångra', kor: () => tab && undo(tab) },
            })
          }
        }
        return
      }

      if (iFalt) return

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          flyttaMarkering(-1, 0, e.shiftKey, e.altKey)
          break
        case 'ArrowDown':
          e.preventDefault()
          flyttaMarkering(1, 0, e.shiftKey, e.altKey)
          break
        case 'ArrowLeft':
          e.preventDefault()
          flyttaMarkering(0, -1, e.shiftKey, e.altKey)
          break
        case 'ArrowRight':
          e.preventDefault()
          flyttaMarkering(0, 1, e.shiftKey, e.altKey)
          break
        case 'Home':
          e.preventDefault()
          flyttaMarkering(0, -1, e.shiftKey, true)
          break
        case 'End':
          e.preventDefault()
          flyttaMarkering(0, 1, e.shiftKey, true)
          break
        case 'Enter':
        case 'F2':
          e.preventDefault()
          startaRedigering()
          break
        case 'Delete':
        case 'Backspace':
          if (markering) {
            e.preventDefault()
            const andrade = sattMarkering(tab, markering, '')
            if (andrade > 0) {
              notify(`Tömde ${celler(andrade)}.`, {
                atgard: { etikett: 'Ångra', kor: () => tab && undo(tab) },
              })
            }
          }
          break
        case 'ContextMenu':
        case 'F10':
          // Menytangenten, och Skift+F10 för tangentbord som saknar den.
          // Menyn öppnas vid fokuscellen, inte vid pekaren.
          if (markering && (e.key === 'ContextMenu' || e.shiftKey)) {
            e.preventDefault()
            const ruta = document.querySelector('.rutnat__cell--fokus')?.getBoundingClientRect()
            setMeny({
              x: ruta ? ruta.left : 120,
              y: ruta ? ruta.bottom : 120,
              poster: cellmenyposter(markering.fokusRad, markering.fokusKol),
            })
          }
          break
        case 'Escape':
          if (lagen.current.sok) {
            setSokOppen(false)
            clearViewSpec(tab)
          }
          break
        default:
          // Börja skriva direkt i en markerad cell, som i ett kalkylark.
          if (e.key.length === 1 && !e.altKey && markering && !tab.redigerar) {
            startaRedigering()
          }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, frame, markering, synligaKolumner.length, sokOppen, palettOppen, oversiktOppen, rev])

  /* ---------- Urklipp och släpp ---------- */

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (text.trim() === '') return
      e.preventDefault()
      if (!tab) oppnaText(text, 'inklistrat.csv')
      else forbereKlistraIn(text)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [tab, markering, rev])

  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      setSlappOver(true)
    }
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setSlappOver(false)
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setSlappOver(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length > 0) oppnaFiler(files)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [oppnaFiler])

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (tabs.value.some((t) => t.smutsig)) e.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  /*
   * Flikarna från förra besöket läses tillbaka en gång, vid start.
   *
   * Notisen säger två saker och båda behövs: att filerna kom tillbaka, och
   * att ångra-historiken inte gjorde det. Det andra är sådant man annars
   * upptäcker genom att trycka Ctrl+Z och se att ingenting händer.
   */
  useEffect(() => {
    let avbruten = false
    void aterstallFlikar().then((antal) => {
      if (avbruten || antal === 0) return
      notify(
        `${filerText(antal)} från förra besöket är tillbaka. Ångra-historiken börjar om.`,
        { atgard: { etikett: 'Glöm sparade filer', kor: () => void glomSparat() } },
      )
    })
    return () => {
      avbruten = true
    }
  }, [])

  const aktivKolumn =
    frame && tab?.activeColumnId ? (findColumn(frame, tab.activeColumnId) ?? null) : null
  // En kolumn kan ha tagits bort medan verktyget stod öppet; den faller då
  // bort ur listan, och försvinner den sista stängs panelen.
  const verktygKolumner =
    frame && verktyg
      ? verktyg.colIds
          .map((id) => findColumn(frame, id))
          .filter((c): c is Column => c !== undefined)
      : []
  const begransad = viewIsLimited(tab)
  /*
   * Kolumnen palettens kommandon gäller.
   *
   * Markeringen går före den aktiva kolumnen: står markören i Ort ska
   * paletten erbjuda "Dölj Ort", inte den kolumn man senast klickade på i
   * rubrikraden. Den aktiva kolumnen är reserven, för när ingenting är
   * markerat.
   */
  const palettKolumn =
    (markering ? synligaKolumner[markering.fokusKol] : undefined) ?? aktivKolumn
  // Verkstaden och kombineringen lägger sig över arbetsytan. Rutnätets egna
  // kontroller — sök, filterrad, statusrad och tabellverktygen — hör till en
  // tabell man inte längre tittar på, och skulle visa tal som inte gäller.
  const iVerkstaden = verkstad.value !== null
  const iKombinera = kombineraOppen.value
  const egenVy = iVerkstaden || iKombinera || oversiktOppen

  return (
    <div class="app">
      <div class="verktygsrad">
        <span class="verktygsrad__namn">
          <span class="verktygsrad__logga" aria-hidden="true">
            ▤
          </span>
          CSV-verkstan
        </span>
        <FilValjare onFiler={oppnaFiler} />

        {/*
          Raden är grupperad efter vad knapparna gör, inte efter när de
          byggdes. Först vad du ser — sortering, filter och dubbletter ändrar
          bara vyn. Sedan vad som skapar eller ändrar data. Sist vägen ut.
        */}
        <span class="verktygsrad__avdelare" aria-hidden="true" />
        <button
          class={`knapp${harSortering(tab) ? ' knapp--primar' : ''}`}
          disabled={!frame || egenVy}
          title="Flernivåsortering med svensk bokstavsordning. Ändrar bara ordningen, aldrig värdena."
          onClick={() => oppnaTabellverktyg('sortera')}
        >
          Sortera{harSortering(tab) ? ` (${tab!.viewSpec.sortering!.length})` : ''}
        </button>
        <button
          class={`knapp${harFilter(tab) ? ' knapp--primar' : ''}`}
          disabled={!frame || egenVy}
          title="Visa bara de rader som stämmer med dina regler. Raderna finns kvar."
          onClick={() => oppnaTabellverktyg('filter')}
        >
          Filter{harFilter(tab) ? ` (${tab!.viewSpec.filter!.regler.length})` : ''}
        </button>
        <button
          class={`knapp${tab?.viewSpec.dubbletter ? ' knapp--primar' : ''}`}
          disabled={!frame || egenVy}
          title="Hitta rader som är lika i de kolumner du väljer, och visa dem grupperade."
          onClick={() => oppnaTabellverktyg('dubbletter')}
        >
          Dubbletter{dubblettgrupper ? ` (${formatCount(dubblettgrupper.antalGrupper)})` : ''}
        </button>

        <span class="verktygsrad__avdelare" aria-hidden="true" />
        <button
          class="knapp"
          disabled={!frame || egenVy}
          title="Trimma blanksteg, ändra skiftläge och städa bort det osynliga i markeringen."
          onClick={(e) =>
            setMeny({
              x: (e.currentTarget as HTMLElement).getBoundingClientRect().left,
              y: (e.currentTarget as HTMLElement).getBoundingClientRect().bottom + 4,
              poster: stadMeny(stada, { tommaRader: stadaTommaRader, tommaKolumner: stadaTommaKolumner }),
            })
          }
        >
          Städa ▾
        </button>
        <button
          class="knapp"
          disabled={!frame || egenVy}
          title="Sätt ihop data ur flera filer — bredvid varandra, ovanpå varandra, eller in i en mall."
          onClick={(e) =>
            setMeny({
              x: (e.currentTarget as HTMLElement).getBoundingClientRect().left,
              y: (e.currentTarget as HTMLElement).getBoundingClientRect().bottom + 4,
              poster: flerfilsmeny({
                slaIhop: () => setSlaIhopOppen(true),
                kombinera: () => oppnaKombinera(),
                mall: () => oppnaKombinera(true),
              }),
            })
          }
        >
          Flera filer ▾
        </button>
        <button
          class="knapp"
          disabled={!frame || egenVy}
          title="En rad per grupp: summa Belopp per Ort, antal ordrar per kund. Resultatet blir en ny flik."
          onClick={() => setSammanfatta({ startkolumn: null })}
        >
          Sammanfatta…
        </button>

        <span class="verktygsrad__avdelare" aria-hidden="true" />
        <button
          class="knapp"
          disabled={!frame || egenVy}
          title="Spara den här filens arbetsgång och kör om den på nästa fil."
          onClick={() => setProfilerOppna(true)}
        >
          Profiler…
        </button>
        <button
          class="knapp"
          disabled={!frame || egenVy}
          title="Skriv ut filen som Excel eller CSV."
          onClick={() => setExportOppen(true)}
        >
          Exportera
        </button>
        <div class="vaxel">
          <button
            class="knapp knapp--tyst"
            disabled={!canUndo(tab)}
            title="Ångra (Ctrl+Z)"
            onClick={() => tab && undo(tab)}
          >
            ↺ Ångra{tab && tab.cursor > 0 ? ` ${tab.cursor}` : ''}
          </button>
          <button
            class="knapp knapp--tyst"
            disabled={!canRedo(tab)}
            title="Gör om (Ctrl+Y)"
            onClick={() => tab && redo(tab)}
          >
            ↻ Gör om
          </button>
          <button
            class="knapp knapp--tyst"
            title="Ljust eller mörkt läge"
            onClick={() => {
              theme.value = theme.value === 'dark' ? 'light' : 'dark'
            }}
          >
            {theme.value === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </div>

      {tabs.value.length > 0 && (
        <div class="flikrad">
          {tabs.value.map((t) => (
            <FlikKnapp key={t.id} tab={t} aktiv={t.id === tab?.id} />
          ))}
        </div>
      )}

      {sokOppen && tab && frame && !egenVy && (
        <SearchBar
          varde={tab.viewSpec.search ?? ''}
          traffar={frame.view.length}
          totalt={frame.rowCount}
          kolumnerMedTraff={tab.kolumnerMedTraff}
          onSok={(fraga) => setViewSpec(tab, { search: fraga })}
          onStang={() => {
            setSokOppen(false)
            clearViewSpec(tab)
          }}
          onNasta={() => flyttaMarkering(1, 0, false, false)}
        />
      )}

      {tab && frame && !egenVy && (
        <Filterrad
          frame={frame}
          filter={tab.viewSpec.filter ?? TOMT_FILTER}
          traffar={frame.view.length}
          totalt={frame.rowCount}
          onOppna={() => oppnaTabellverktyg('filter')}
          onVaxla={(id) =>
            sattFilter(tab, {
              ...(tab.viewSpec.filter ?? TOMT_FILTER),
              regler: (tab.viewSpec.filter?.regler ?? []).map((r) =>
                r.id === id ? { ...r, av: r.av !== true } : r,
              ),
            })
          }
          onTaBort={(id) =>
            sattFilter(tab, {
              ...(tab.viewSpec.filter ?? TOMT_FILTER),
              regler: (tab.viewSpec.filter?.regler ?? []).filter((r) => r.id !== id),
            })
          }
          onRensa={() => sattFilter(tab, TOMT_FILTER)}
        />
      )}

      {laddar && (
        <div class="forlopp" role="progressbar" aria-label={`Läser ${laddar}`}>
          <div class="forlopp__stapel" />
        </div>
      )}

      {iKombinera ? (
        <Kombinera
          onKlar={(resultat, text) => {
            openFrame(resultat)
            notify(text)
          }}
          onFiler={oppnaFiler}
          onExempelmall={oppnaExempelmall}
        />
      ) : oversiktOppen && frame && tab ? (
        <Oversikt
          frame={frame}
          revision={rev}
          onValjKolumn={setActiveColumn}
          onSetType={sattTyp}
          onVisaOgiltiga={visaOgiltiga}
          onVerktyg={oppnaVerktyg}
          onStang={() => setOversiktOppen(false)}
        />
      ) : iVerkstaden ? (
        <Verkstad
          onSlaIhop={(resultat, text) => {
            openFrame(resultat)
            notify(text)
          }}
          onStang={stangVerkstad}
        />
      ) : frame && tab ? (
        <div
          class={`arbetsyta arbetsyta--med-inspektor${
            verktygKolumner.length > 0 ? ' arbetsyta--med-verktyg' : ''
          }`}
        >
          <ColumnPanel
            frame={frame}
            tab={tab}
            activeColumnId={tab.activeColumnId}
            onSelect={setActiveColumn}
            onToggleHidden={vaxlaDold}
            onMove={flyttaKolumn}
            onInsert={() => infogaKolumn()}
            onUndoThrough={(i) => undoThrough(tab, i)}
            onOversikt={() => setOversiktOppen(true)}
          />
          <VirtualGrid
            frame={frame}
            revision={rev}
            activeColumnId={tab.activeColumnId}
            viewSpec={tab.viewSpec}
            forhandsvisning={tab.forhandsvisning}
            sortering={tab.viewSpec.sortering ?? []}
            grupper={dubblettgrupper}
            behallnaRader={behallnaRader}
            onBehall={
              behall === 'valda' && dubblettgrupper
                ? (fysisk) => {
                    const g = dubblettgrupper.grupp[fysisk] ?? 0
                    if (g === 0) return
                    setEgnaBehallna((nu) => new Map(nu).set(g, fysisk))
                  }
                : null
            }
            markering={markering}
            redigerar={tab.redigerar}
            onSelectColumn={setActiveColumn}
            onOpenColumnMenu={(id, x, y) => setMeny({ x, y, poster: kolumnmenyposter(id) })}
            onOpenCellMenu={(rad, kol, x, y) =>
              setMeny({ x, y, poster: cellmenyposter(rad, kol) })
            }
            onOpenRowMenu={(x, y) => setMeny({ x, y, poster: radmenyposter() })}
            onMoveColumn={flyttaKolumn}
            onResizeColumn={andraBredd}
            onAutofit={anpassaKolumnbredd}
            onCycleType={cyklaTyp}
            onSortera={(id, lagg) => vaxlaSortering(tab, id, lagg)}
            onSelect={(sel) => setSelection(tab, sel)}
            onStartEdit={startaRedigering}
            onCommitEdit={avslutaRedigering}
            onCancelEdit={() => {
              tab.redigerar = null
              touch()
            }}
          />
          {tabellverktyg === 'filter' ? (
            <FilterTool
              frame={frame}
              revision={rev}
              filter={tab.viewSpec.filter ?? TOMT_FILTER}
              startkolumn={tab.activeColumnId}
              onFilter={(f) => sattFilter(tab, f)}
              onTaBortSynliga={() => tillampaUrval(false)}
              onBehallSynliga={() => tillampaUrval(true)}
              onStang={() => setTabellverktyg(null)}
            />
          ) : tabellverktyg === 'dubbletter' ? (
            <DuplicateTool
              frame={frame}
              revision={rev}
              nyckel={tab.viewSpec.dubbletter ?? null}
              onNyckel={(n) => {
                setEgnaBehallna(new Map())
                sattDubbletter(tab, n)
              }}
              behall={behall}
              onBehall={setBehall}
              egnaVal={egnaBehallna.size}
              onTaBort={taBortDubbletter}
              onStang={() => setTabellverktyg(null)}
            />
          ) : tabellverktyg === 'sortera' ? (
            <SortTool
              frame={frame}
              nivaer={tab.viewSpec.sortering ?? []}
              inaktuell={sorteringenArInaktuell(tab)}
              onNivaer={(nivaer) => sattSortering(tab, nivaer)}
              onSorteraOm={() => sorteraOm(tab)}
              onStang={() => setTabellverktyg(null)}
            />
          ) : verktygKolumner.length > 0 && verktyg ? (
            <Verktyg
              namn={verktyg.id}
              kolumner={verktygKolumner}
              frame={frame}
              dataRevision={tab.dataRevision}
              visaBara={tab.viewSpec.visaBara}
              onVisaBara={(v) => setViewSpec(tab, { visaBara: v })}
              onForhandsvisning={(f) => setForhandsvisning(tab, f)}
              onTillampa={(f) => {
                const antal = tillampaForhandsvisning(tab, f)
                stangVerktyg()
                const forsta = f[0]
                if (!forsta) return
                const nya = f.reduce((n, x) => n + x.nyaKolumner.length, 0)
                notify(
                  nya === 0
                    ? `${forsta.etikett}${f.length > 1 ? ` i ${kolumnerText(f.length)}` : ''} — ${celler(antal)} skrevs om.`
                    : `${forsta.etikett} — ${kolumnerText(nya)} med ${celler(antal)} ifyllda.`,
                  { atgard: { etikett: 'Ångra', kor: () => undo(tab) } },
                )
              }}
              onStang={stangVerktyg}
            />
          ) : (
            <Inspector
              frame={frame}
              column={aktivKolumn}
              revision={rev}
              onSetType={(t) => aktivKolumn && sattTyp(aktivKolumn.id, t)}
              onFilterInvalid={() => aktivKolumn && visaOgiltiga(aktivKolumn.id)}
              onRename={() => aktivKolumn && dopOmKolumn(aktivKolumn.id)}
              onDuplicate={() => aktivKolumn && dupliceraKolumn(aktivKolumn.id)}
              onDelete={() => aktivKolumn && taBortKolumn(aktivKolumn.id)}
              onFiltreraVarde={(varde) =>
                aktivKolumn &&
                filtreraKolumn(aktivKolumn.id, { operator: 'iLista', varden: [varde] })
              }
              onVerktyg={(namn) => aktivKolumn && oppnaVerktyg(namn, aktivKolumn.id)}
            />
          )}
        </div>
      ) : (
        <EmptyState
          onFiler={oppnaFiler}
          onExempel={oppnaExempel}
          onExempelpar={oppnaExempelpar}
        />
      )}

      {!egenVy && (
      <Statusrad
        tab={tab}
        begransad={begransad}
        sorterat={tab && frame ? beskrivSortering(frame, tab.viewSpec.sortering ?? []) : ''}
        sorteringInaktuell={sorteringenArInaktuell(tab)}
        onSorteraOm={() => tab && sorteraOm(tab)}
        onRensaSortering={() => tab && rensaSortering(tab)}
        onRensaVy={() => {
          if (!tab) return
          setSokOppen(false)
          clearViewSpec(tab)
        }}
        onRadmeny={(x, y) => setMeny({ x, y, poster: radmenyposter() })}
      />
      )}

      {kö.length > 0 && (
        <ImportDialog
          file={kö[0]!}
          onAvbryt={() => {
            vantarPaMall.value = false
            setKö((current) => current.slice(1))
          }}
          onOppna={(settings) => void laddaFil(kö[0]!, settings)}
        />
      )}

      {palettOppen && (
        <Kommandopalett
          kommandon={byggKommandon(
            {
              harFil: frame !== null,
              kolumn: palettKolumn?.name ?? null,
              kolumnDold: palettKolumn?.hidden ?? false,
              harMarkering: markering !== null,
              kanAngra: canUndo(tab),
              kanGoraOm: canRedo(tab),
              begransadVy: begransad,
            },
            {
              oppnaFil: () => palettFil.current?.click(),
              glomSparat: () => {
                void glomSparat().then(() =>
                  notify('Det sparade är borta. Flikarna du har öppna står kvar.'),
                )
              },
              exportera: () => setExportOppen(true),
              profiler: () => setProfilerOppna(true),
              sok: () => setSokOppen(true),
              sortera: () => oppnaTabellverktyg('sortera'),
              filter: () => oppnaTabellverktyg('filter'),
              dubbletter: () => oppnaTabellverktyg('dubbletter'),
              slaIhop: () => setSlaIhopOppen(true),
              kombinera: () => oppnaKombinera(),
              mall: () => oppnaKombinera(true),
              sammanfatta: () => setSammanfatta({ startkolumn: palettKolumn?.id ?? null }),
              oversikt: () => setOversiktOppen(true),
              visaAllaRader: () => {
                if (!tab) return
                setSokOppen(false)
                clearViewSpec(tab)
              },
              stada,
              verktyg: (namn) => palettKolumn && oppnaVerktyg(namn, palettKolumn.id),
              dopOm: () => palettKolumn && dopOmKolumn(palettKolumn.id),
              duplicera: () => palettKolumn && dupliceraKolumn(palettKolumn.id),
              vaxlaDold: () => palettKolumn && vaxlaDold(palettKolumn.id),
              taBortKolumn: () => palettKolumn && taBortKolumn(palettKolumn.id),
              infogaKolumn: () => infogaKolumn(),
              filtreraKolumn: () => palettKolumn && filtreraKolumn(palettKolumn.id),
              visaOgiltiga: () => palettKolumn && visaOgiltiga(palettKolumn.id),
              infogaRadOvan: () =>
                tab && markering && infogaRader(tab, markering.fokusRad, 1, false),
              infogaRadUnder: () =>
                tab && markering && infogaRader(tab, markering.fokusRad, 1, true),
              dupliceraRader: () =>
                tab && markering && dupliceraRader(tab, selectedRows(tab, markering)),
              taBortRader: taBortMarkeradeRader,
              tommaRader: stadaTommaRader,
              tommaKolumner: stadaTommaKolumner,
              angra: () => {
                if (!tab) return
                const step = undo(tab)
                if (step) notify(`Ångrade: ${step.label}`)
              },
              goraOm: () => {
                if (!tab) return
                const step = redo(tab)
                if (step) notify(`Gjorde om: ${step.label}`)
              },
              vaxlaTema: () => {
                theme.value = theme.value === 'dark' ? 'light' : 'dark'
              },
            },
          )}
          onStang={() => setPalettOppen(false)}
        />
      )}

      {profilerOppna && tab && (
        <ProfilDialog tab={tab} onStang={() => setProfilerOppna(false)} />
      )}

      {sammanfatta && frame && (
        <GrupperaDialog
          frame={frame}
          startkolumn={sammanfatta.startkolumn}
          onStang={() => setSammanfatta(null)}
          onSkapa={(resultat, text) => {
            setSammanfatta(null)
            openFrame(resultat)
            notify(text)
          }}
        />
      )}

      {exportOppen && frame && (
        <ExportDialog
          frame={frame}
          harFilter={begransad}
          ordning={tab?.ordning?.rader}
          onStang={() => setExportOppen(false)}
          onExporterad={() => {
            setExportOppen(false)
            if (tab) tab.smutsig = false
            notify('Filen laddades ner.')
          }}
        />
      )}

      {inklistring && tab && (
        <PasteDialog
          plan={inklistring.plan}
          markeradeRader={rect(inklistring.sel).r2 - rect(inklistring.sel).r1 + 1}
          markeradeKolumner={rect(inklistring.sel).k2 - rect(inklistring.sel).k1 + 1}
          onAvbryt={() => setInklistring(null)}
          onKlistraIn={(utoka) => {
            const andrade = klistraIn(tab, inklistring.sel, inklistring.plan, utoka)
            setInklistring(null)
            notify(`Klistrade in ${celler(andrade)}.`, {
              atgard: { etikett: 'Ångra', kor: () => tab && undo(tab) },
            })
          }}
        />
      )}

      {slaIhopOppen && tab && frame && (
        <MergeDialog
          vanster={frame}
          andraFlikar={tabs.value
            .filter((t) => t.id !== tab.id)
            .map((t) => ({ id: t.id, frame: t.frame }))}
          onStang={() => setSlaIhopOppen(false)}
          onSlaIhop={(resultat, text) => {
            setSlaIhopOppen(false)
            openFrame(resultat)
            notify(text)
          }}
          onVerkstad={(hogerTabId, par, val) => {
            const hogerTab = tabs.value.find((t) => t.id === hogerTabId)
            if (!hogerTab) return
            setSlaIhopOppen(false)
            oppnaVerkstad(tab, hogerTab, par, val)
          }}
        />
      )}

      {meny && (
        <Meny x={meny.x} y={meny.y} poster={meny.poster} onStang={() => setMeny(null)} />
      )}

      <input
        ref={palettFil}
        type="file"
        accept=".csv,.txt,.tsv,.xlsx,text/csv,text/plain"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const filer = Array.from((e.currentTarget as HTMLInputElement).files ?? [])
          if (filer.length > 0) oppnaFiler(filer)
          ;(e.currentTarget as HTMLInputElement).value = ''
        }}
      />

      {slappOver && <div class="slappoverlagg">Släpp för att öppna som ny flik</div>}
      <Toastar />
    </div>
  )
}

function stadMeny(
  stada: (id: string) => void,
  rader: { tommaRader: () => void; tommaKolumner: () => void },
): (MenyPost | 'avdelare')[] {
  return [
    ...STADNINGAR.map((s): MenyPost => ({
      etikett: s.etikett,
      kor: () => stada(s.id),
    })),
    'avdelare',
    { etikett: 'Ta bort helt tomma rader', kor: rader.tommaRader },
    { etikett: 'Ta bort helt tomma kolumner', kor: rader.tommaKolumner },
  ]
}

/**
 * De tre sätten att sätta ihop flera filer.
 *
 * De låg tidigare som två knappar i verktygsraden — *Slå ihop* och
 * *Kombinera* — två ord för nästan samma sak och omöjliga att skilja åt utan
 * att prova. Här står de under varandra med en rad som säger vad som händer
 * med raderna, och mallen får en egen ingång i stället för att gömma sig i en
 * väljare inne i kombineringsvyn.
 */
function flerfilsmeny(handlers: {
  slaIhop: () => void
  kombinera: () => void
  mall: () => void
}): (MenyPost | 'avdelare')[] {
  return [
    {
      etikett: 'Slå ihop…',
      skal: 'rader som hör ihop läggs sida vid sida, matchat på en nyckel',
      kor: handlers.slaIhop,
    },
    {
      etikett: 'Kombinera…',
      skal: 'filerna läggs på varandra, kolumner som betyder samma sak i samma spalt',
      kor: handlers.kombinera,
    },
    {
      etikett: 'Fyll en mall med data…',
      skal: 'en fil med bara rubriker bestämmer formen, data hämtas ur de filer du väljer',
      kor: handlers.mall,
    },
  ]
}

function radMeny(handlers: {
  infogaFore: () => void
  infogaEfter: () => void
  duplicera: () => void
  taBort: () => void
}): (MenyPost | 'avdelare')[] {
  return [
    { etikett: 'Infoga rad ovanför', kor: handlers.infogaFore },
    { etikett: 'Infoga rad nedanför', kor: handlers.infogaEfter },
    { etikett: 'Dubblera markerade rader', kor: handlers.duplicera },
    'avdelare',
    { etikett: 'Ta bort markerade rader', fara: true, kor: handlers.taBort },
  ]
}

function kolumnMeny(
  id: ColumnId,
  handlers: {
    dopOm: (id: ColumnId) => void
    duplicera: (id: ColumnId) => void
    vaxlaDold: (id: ColumnId) => void
    infogaFore: (id: ColumnId) => void
    infogaEfter: (id: ColumnId) => void
    flyttaForst: (id: ColumnId) => void
    flyttaSist: (id: ColumnId) => void
    anpassaBredd: (id: ColumnId) => void
    visaOgiltiga: (id: ColumnId) => void
    /** Verktygen, färdigsorterade efter vad kolumnen innehåller. */
    verktyg: (MenyPost | 'avdelare')[]
    filtrera: (id: ColumnId) => void
    /** Kolumnens namn, för de poster som nämner den. */
    namn: string
    sammanfatta: (id: ColumnId) => void
    sortera: (id: ColumnId, riktning: Riktning) => void
    laggSortering: (id: ColumnId) => void
    sortriktning: Riktning | null
    taBort: (id: ColumnId) => void
    dold: boolean
  },
): (MenyPost | 'avdelare')[] {
  return [
    { etikett: 'Byt namn…', genvag: 'F2', kor: () => handlers.dopOm(id) },
    { etikett: 'Duplicera kolumnen', kor: () => handlers.duplicera(id) },
    {
      etikett: handlers.dold ? 'Visa kolumnen' : 'Dölj kolumnen',
      kor: () => handlers.vaxlaDold(id),
    },
    'avdelare',
    { etikett: 'Infoga tom kolumn till vänster', kor: () => handlers.infogaFore(id) },
    { etikett: 'Infoga tom kolumn till höger', kor: () => handlers.infogaEfter(id) },
    'avdelare',
    { etikett: 'Flytta först', kor: () => handlers.flyttaForst(id) },
    { etikett: 'Flytta sist', kor: () => handlers.flyttaSist(id) },
    { etikett: 'Anpassa bredden efter innehållet', kor: () => handlers.anpassaBredd(id) },
    'avdelare',
    {
      etikett: 'Sortera A→Ö',
      aktiv: handlers.sortriktning === 'stigande',
      kor: () => handlers.sortera(id, 'stigande'),
    },
    {
      etikett: 'Sortera Ö→A',
      aktiv: handlers.sortriktning === 'fallande',
      kor: () => handlers.sortera(id, 'fallande'),
    },
    { etikett: 'Lägg till som sorteringsnivå', kor: () => handlers.laggSortering(id) },
    'avdelare',
    { etikett: 'Filtrera på kolumnen…', kor: () => handlers.filtrera(id) },
    {
      etikett: `Gruppera på ${handlers.namn}…`,
      skal: 'en rad per värde, med summa och antal för resten av kolumnerna',
      kor: () => handlers.sammanfatta(id),
    },
    { etikett: 'Visa rader som inte går att tolka', kor: () => handlers.visaOgiltiga(id) },
    'avdelare',
    ...handlers.verktyg,
    'avdelare',
    { etikett: 'Ta bort kolumnen', fara: true, kor: () => handlers.taBort(id) },
  ]
}

function FilValjare({ onFiler }: { onFiler: (files: File[]) => void }) {
  return (
    <label class="knapp">
      Öppna
      <input
        type="file"
        accept=".csv,.txt,.tsv,.xlsx,text/csv,text/plain"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from((e.currentTarget as HTMLInputElement).files ?? [])
          if (files.length > 0) onFiler(files)
          ;(e.currentTarget as HTMLInputElement).value = ''
        }}
      />
    </label>
  )
}

function FlikKnapp({ tab, aktiv }: { tab: Tab; aktiv: boolean }) {
  return (
    <span class={`flik${aktiv ? ' flik--aktiv' : ''}`}>
      <button
        class="flik__namn"
        style={{
          border: 0,
          background: 'transparent',
          padding: 0,
          color: 'inherit',
          font: 'inherit',
        }}
        onClick={() => {
          activeTabId.value = tab.id
        }}
      >
        {tab.smutsig && '● '}
        {tab.frame.name || 'Namnlös'}
      </button>
      <span class="flik__antal">{formatCount(tab.frame.rowCount)}</span>
      <button
        class="flik__stang"
        aria-label={`Stäng ${tab.frame.name}`}
        onClick={() => {
          if (
            tab.smutsig &&
            !window.confirm(`${tab.frame.name} har ändringar som inte exporterats. Stänga ändå?`)
          ) {
            return
          }
          closeTab(tab.id)
        }}
      >
        ✕
      </button>
    </span>
  )
}

