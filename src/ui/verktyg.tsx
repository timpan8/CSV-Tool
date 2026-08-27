import type { Column, Frame } from '../core/types.js'
import type { Innehallsprofil, Verktygsnamn } from '../core/frame/innehall.js'
import type { Forhandsvisning } from '../state/preview.js'
import { DateTool } from './DateTool.jsx'
import { EmailTool } from './EmailTool.jsx'
import { NumberTool } from './NumberTool.jsx'
import { PhoneTool } from './PhoneTool.jsx'
import { ReplaceTool } from './ReplaceTool.jsx'
import { SplitTool } from './SplitTool.jsx'
import { MergeTool } from './MergeTool.jsx'

/**
 * Städverktygen.
 *
 * Listan finns på ett ställe och används av både kolumnmenyn, inspektören och
 * panelvalet. Ett verktyg som läggs till här dyker upp överallt det hör
 * hemma, i stället för att glömmas på ett av ställena.
 */
export type { Verktygsnamn }

export interface Verktygspost {
  namn: Verktygsnamn
  etikett: string
}

export const VERKTYG: Verktygspost[] = [
  { namn: 'datum', etikett: 'Datum…' },
  { namn: 'tal', etikett: 'Tal…' },
  { namn: 'telefon', etikett: 'Telefon…' },
  { namn: 'epost', etikett: 'E-post → namn…' },
  { namn: 'dela', etikett: 'Dela kolumnen…' },
  { namn: 'slaihop', etikett: 'Slå ihop kolumner…' },
  { namn: 'ersatt', etikett: 'Sök och ersätt…' },
]

/**
 * Panelrubriken för de kolumner ett verktyg körs på.
 *
 * En kolumn nämns vid namn; flera räknas och radas upp, så att man ser vad
 * ett Tillämpa faktiskt kommer att röra.
 */
export function kolumnrubrik(kolumner: readonly Column[]): string {
  if (kolumner.length === 1) return kolumner[0]!.name
  return `${kolumner.length} kolumner: ${kolumner.map((c) => c.name).join(', ')}`
}

export interface Verktygsordning {
  /** Verktyg innehållet talar för, starkast först, med sitt skäl. */
  passande: { post: Verktygspost; skal: string }[]
  /** Resten, i listans ordning. Aldrig gömda — typen är trots allt en gissning. */
  ovriga: Verktygspost[]
}

/**
 * Delar verktygslistan i två efter vad kolumnen innehåller.
 *
 * Ett verktyg som inte kan göra någonting med värdena göms inte — det
 * hamnar under *Fler verktyg*. Ett gömt verktyg man vet att man behöver är
 * en återvändsgränd, och innehållet är trots allt bara en indikation.
 */
export function ordnaVerktyg(profil: Innehallsprofil): Verktygsordning {
  const passande: Verktygsordning['passande'] = []
  const tagna = new Set<Verktygsnamn>()
  for (const forslag of profil.forslag) {
    const post = VERKTYG.find((v) => v.namn === forslag.verktyg)
    if (!post || tagna.has(post.namn)) continue
    passande.push({ post, skal: forslag.skal })
    tagna.add(post.namn)
  }
  return { passande, ovriga: VERKTYG.filter((v) => !tagna.has(v.namn)) }
}

export interface VerktygProps {
  namn: Verktygsnamn
  /**
   * Kolumnerna verktyget körs på, alltid minst en.
   *
   * Datum, tal, telefon och sök & ersätt skriver om varje kolumn i listan;
   * tolv månadskolumner med datum är ett vanligt fall och att köra verktyget
   * tolv gånger är precis det slit ett verktyg ska ta bort. De verktyg som
   * *skapar* kolumner arbetar på den första — tolv nya kolumner ur en
   * markering är sällan vad någon menade.
   */
  kolumner: Column[]
  frame: Frame
  dataRevision: number
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  onForhandsvisning: (forh: Forhandsvisning[] | null) => void
  onTillampa: (forh: Forhandsvisning[]) => void
  onStang: () => void
}

/**
 * Väljer panel.
 *
 * Alla verktyg har samma gränssnitt mot appen — en kolumn in, en
 * förhandsvisning ut — så valet är en rad och inte en förgrening genom resten
 * av koden.
 */
export function Verktyg({ namn, frame, kolumner, ...rest }: VerktygProps) {
  // Verktyg som skapar nya kolumner arbetar på den första i markeringen.
  const col = kolumner[0]!
  switch (namn) {
    case 'datum':
      return <DateTool {...rest} kolumner={kolumner} />
    case 'tal':
      return <NumberTool {...rest} kolumner={kolumner} />
    case 'telefon':
      return <PhoneTool {...rest} kolumner={kolumner} />
    case 'epost':
      return <EmailTool {...rest} col={col} />
    case 'dela':
      return <SplitTool {...rest} col={col} />
    case 'slaihop':
      return <MergeTool {...rest} col={col} frame={frame} />
    case 'ersatt':
      return <ReplaceTool {...rest} kolumner={kolumner} />
  }
}
