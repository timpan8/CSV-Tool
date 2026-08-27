import type { ViewSpec } from './view.js'
import type { Selection } from './selection.js'
import {
  deserializeFrame,
  serializeFrame,
  type SerializedFrame,
} from '../core/frame/serialize.js'
import type { Frame } from '../core/types.js'

/**
 * Flikarna överlever en omladdning.
 *
 * Allt annat i verktyget bygger på att inget lämnar maskinen, och det gäller
 * här också: filerna sparas i webbläsarens egen IndexedDB, på samma disk som
 * filen du öppnade dem från. Det är en kopia av något du redan har — men den
 * ligger kvar när fliken stängs, och därför går den också att glömma med ett
 * kommando.
 *
 * **Ångra-historiken sparas inte.** Varje steg är två stängningar över just
 * den här filens kolumner (`AppliedStep.apply` och `.revert` i `store.ts`);
 * de går inte att skriva ner. Att spara en halv historik — bara de steg som
 * råkar ha en profilbeskrivning — vore värre än ingen: `Ctrl+Z` skulle backa
 * något annat än det man senast gjorde. Efter en omladdning börjar historiken
 * tom, och gränssnittet säger det.
 *
 * **Två lager, för att skrivningen ska vara billig.** Celldatat är tungt och
 * ändras sällan; markering och filter är lätta och ändras hela tiden. De
 * ligger därför i var sin butik och skrivs var för sig. Att skriva om en
 * ram på tvåhundratusen rader varje gång markören flyttas vore att bygga in
 * en hackighet som inte behöver finnas.
 */

const DB = 'csv-verkstan'
const RAMAR = 'ramar'
const FLIKAR = 'flikar'
/** Höjs när formen ändras. En äldre form kastas hellre än tolkas fel. */
const VERSION = 1

interface Ramrad {
  id: string
  version: number
  frame: SerializedFrame
}

interface Flikrad {
  id: string
  version: number
  ordning: number
  viewSpec: ViewSpec
  activeColumnId: string | null
  markering: Selection | null
  smutsig: boolean
  aktiv: boolean
}

function oppna(): Promise<IDBDatabase | null> {
  return new Promise((klar) => {
    let begaran: IDBOpenDBRequest
    try {
      begaran = indexedDB.open(DB, VERSION)
    } catch {
      // Privat läge eller blockerad lagring. Verktyget fungerar ändå.
      klar(null)
      return
    }
    begaran.onupgradeneeded = () => {
      const db = begaran.result
      for (const namn of [RAMAR, FLIKAR]) {
        if (db.objectStoreNames.contains(namn)) db.deleteObjectStore(namn)
        db.createObjectStore(namn, { keyPath: 'id' })
      }
    }
    begaran.onsuccess = () => klar(begaran.result)
    begaran.onerror = () => klar(null)
    begaran.onblocked = () => klar(null)
  })
}

/** Sant när lagringen sagt ifrån och vi slutat försöka. */
let stangd = false
let felmeddelande: string | null = null

export function lagringsfel(): string | null {
  return felmeddelande
}

export function lagringenAr(): 'på' | 'av' {
  return stangd ? 'av' : 'på'
}

/**
 * Fångar det enda felet som är värt att säga till om.
 *
 * Slut på utrymme betyder att arbetet inte längre sparas, och det ska sägas
 * en gång — inte vid varje tangenttryck. Allt annat som kan gå fel med
 * lagringen är sådant användaren varken orsakat eller kan åtgärda, och det
 * som ligger på skärmen är orört oavsett.
 */
function stang(e: unknown): void {
  stangd = true
  felmeddelande =
    (e as Error)?.name === 'QuotaExceededError'
      ? 'Webbläsarens utrymme tog slut, så filerna sparas inte längre. Det du ser är orört.'
      : 'Filerna gick inte att spara i webbläsaren. Det du ser är orört.'
}

export interface Sparbar {
  id: string
  frame: Frame
  viewSpec: ViewSpec
  activeColumnId: string | null
  markering: Selection | null
  smutsig: boolean
  aktiv: boolean
  /** Sant när celldatat ändrats sedan förra skrivningen. */
  ramenAndrad: boolean
}

/**
 * Skriver flikarna.
 *
 * `serializeFrame` finns sedan Worker-gränssnittet och ger exakt den form som
 * behövs. Buffertarna får **inte** överföras här — de tillhör de levande
 * kolumnerna, och IndexedDB klonar dem ändå.
 */
export async function sparaFlikar(flikar: readonly Sparbar[]): Promise<boolean> {
  if (stangd) return false
  const db = await oppna()
  if (!db) return false
  try {
    await new Promise<void>((klar, fel) => {
      const tx = db.transaction([RAMAR, FLIKAR], 'readwrite')
      const ramar = tx.objectStore(RAMAR)
      const rader = tx.objectStore(FLIKAR)
      const kvar = new Set(flikar.map((f) => f.id))

      // Stängda flikar ska inte ligga kvar och komma tillbaka vid nästa start.
      for (const butik of [ramar, rader]) {
        const nycklar = butik.getAllKeys()
        nycklar.onsuccess = () => {
          for (const nyckel of nycklar.result as string[]) {
            if (!kvar.has(nyckel)) butik.delete(nyckel)
          }
        }
      }

      flikar.forEach((f, i) => {
        if (f.ramenAndrad) {
          const rad: Ramrad = { id: f.id, version: VERSION, frame: serializeFrame(f.frame).frame }
          ramar.put(rad)
        }
        const lat: Flikrad = {
          id: f.id,
          version: VERSION,
          ordning: i,
          viewSpec: f.viewSpec,
          activeColumnId: f.activeColumnId,
          markering: f.markering,
          smutsig: f.smutsig,
          aktiv: f.aktiv,
        }
        rader.put(lat)
      })

      tx.oncomplete = () => klar()
      tx.onabort = () => fel(tx.error ?? new Error('avbruten'))
      tx.onerror = () => fel(tx.error ?? new Error('fel'))
    })
    return true
  } catch (e) {
    stang(e)
    return false
  } finally {
    db.close()
  }
}

export interface LaddadFlik {
  id: string
  frame: Frame
  viewSpec: ViewSpec
  activeColumnId: string | null
  markering: Selection | null
  smutsig: boolean
  aktiv: boolean
}

/** Läser tillbaka flikarna, i den ordning de låg. */
export async function laddaFlikar(): Promise<LaddadFlik[]> {
  const db = await oppna()
  if (!db) return []
  try {
    const [ramar, rader] = await new Promise<[Ramrad[], Flikrad[]]>((klar) => {
      const tx = db.transaction([RAMAR, FLIKAR], 'readonly')
      const a = tx.objectStore(RAMAR).getAll()
      const b = tx.objectStore(FLIKAR).getAll()
      tx.oncomplete = () => klar([(a.result as Ramrad[]) ?? [], (b.result as Flikrad[]) ?? []])
      tx.onerror = () => klar([[], []])
      tx.onabort = () => klar([[], []])
    })

    const ramPerId = new Map(ramar.filter((r) => r.version === VERSION).map((r) => [r.id, r]))
    return rader
      .filter((f) => f.version === VERSION && ramPerId.has(f.id))
      .sort((a, b) => a.ordning - b.ordning)
      .map((f) => ({
        id: f.id,
        frame: deserializeFrame(ramPerId.get(f.id)!.frame),
        viewSpec: f.viewSpec,
        activeColumnId: f.activeColumnId,
        markering: f.markering,
        smutsig: f.smutsig,
        aktiv: f.aktiv,
      }))
  } catch {
    return []
  } finally {
    db.close()
  }
}

/** Glömmer allt som sparats. */
export async function rensaLagring(): Promise<void> {
  const db = await oppna()
  if (!db) return
  try {
    await new Promise<void>((klar) => {
      const tx = db.transaction([RAMAR, FLIKAR], 'readwrite')
      tx.objectStore(RAMAR).clear()
      tx.objectStore(FLIKAR).clear()
      tx.oncomplete = () => klar()
      tx.onabort = () => klar()
      tx.onerror = () => klar()
    })
    stangd = false
    felmeddelande = null
  } finally {
    db.close()
  }
}
