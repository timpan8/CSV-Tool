import type { Column, Frame } from '../../core/types.js'

const MIN_BREDD = 56
/**
 * Tak för automatisk bredd.
 *
 * En enda lång anteckning ska inte kunna trycka ut resten av tabellen ur
 * bild. Den som vill se hela värdet drar greppet själv.
 */
const MAX_BREDD = 520

/** Delad canvas: att skapa en per anrop kostar mer än mätningen. */
let matare: CanvasRenderingContext2D | null = null

/**
 * Bredden som rymmer kolumnens bredaste värde bland de synliga raderna.
 *
 * Mätningen görs en gång per *unikt* värde, som allt annat här: en kolumn
 * med 200 000 rader och 300 orter kostar 300 mätningar. Returnerar null när
 * rutnätet inte finns i DOM:en, alltså när det inte går att veta vilket
 * typsnitt värdena ritas med — en gissning där skulle ge en bredd som är
 * synbart fel.
 */
export function anpassadBredd(col: Column, frame: Frame): number | null {
  const rutnat = document.querySelector('.rutnat')
  if (!rutnat) return null
  matare ??= document.createElement('canvas').getContext('2d')
  if (!matare) return null

  const stil = getComputedStyle(rutnat)
  matare.font = `${stil.fontSize} ${stil.fontFamily}`
  // Rubriken ska rymma namnet plus sortpilen och menyknappen.
  let bredd = matare.measureText(col.name).width + 58

  const sedda = new Set<number>()
  for (let i = 0; i < frame.view.length; i++) {
    const kod = col.codes[frame.view[i]!]!
    if (kod === 0 || sedda.has(kod)) continue
    sedda.add(kod)
    const w = matare.measureText(col.dict[kod]!).width + 22
    if (w > bredd) bredd = w
  }
  return Math.round(Math.min(MAX_BREDD, Math.max(MIN_BREDD, bredd)))
}
