import { FARGER, fargpost } from '../core/frame/farg.js'
import { t } from './sprak.js'

/**
 * Palettfärgens namn på gränssnittets språk, med stor bokstav.
 *
 * Kärnan har namnen gemena och svenska — de är data, som Träff-kolumnens
 * värden. Menyerna, paletten och notiserna vill ha dem översatta, och det
 * här är det enda stället som slår upp dem, så ordboken har sju poster och
 * inte tjugoen.
 */
const ETIKETTER: Record<string, () => string> = {
  blå: () => t('Blå'),
  orange: () => t('Orange'),
  grön: () => t('Grön'),
  gul: () => t('Gul'),
  rosa: () => t('Rosa'),
  lila: () => t('Lila'),
  röd: () => t('Röd'),
}

export function fargetikett(farg: number): string {
  const post = fargpost(farg)
  if (!post) return ''
  return ETIKETTER[post.namn]?.() ?? post.namn
}

/** Samma sak gement, för mitt i en mening: ”Färgade 12 celler grön”. */
export function fargetikettGement(farg: number): string {
  return fargetikett(farg).toLocaleLowerCase()
}

export { FARGER }
