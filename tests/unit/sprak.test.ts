import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EN } from '../../src/ui/sprak/en.js'
import { DIALOGER } from '../../src/ui/sprak/en/dialoger.js'
import { FLERFIL } from '../../src/ui/sprak/en/flerfil.js'
import { SKAL } from '../../src/ui/sprak/en/skal.js'
import { VERKTYG } from '../../src/ui/sprak/en/verktyg.js'

/**
 * Vakten över ordboken.
 *
 * Etapp 23 översatte skalet och lämnade panelerna på svenska. Det var ett
 * medvetet val, men det gick bara att se genom att klicka runt — ingenting i
 * bygget visste vad som var kvar. Det här testet gör "klar" mätbart: varje
 * mening som skickas genom `t()` måste finnas i ordboken, och varje post i
 * ordboken måste höra till en mening som faktiskt finns i koden.
 *
 * Det är också det som gör det säkert att skriva om en mening: ändrar man
 * texten i koden utan att flytta med posten faller testet på båda ändarna —
 * den nya nyckeln saknas, och den gamla har blivit övergiven.
 */

const ROT = new URL('../../src/', import.meta.url).pathname

function kallfiler(katalog: string): string[] {
  const ut: string[] = []
  for (const post of readdirSync(katalog, { withFileTypes: true })) {
    const vag = join(katalog, post.name)
    if (post.isDirectory()) {
      // Ordboken själv räknas inte som användning — annars vore varje post
      // använd av sig själv och testet skulle aldrig hitta en övergiven.
      if (vag.endsWith('/sprak/en')) continue
      ut.push(...kallfiler(vag))
    } else if (post.name.endsWith('.ts') || post.name.endsWith('.tsx')) {
      if (post.name === 'en.ts' && katalog.endsWith('/sprak')) continue
      ut.push(vag)
    }
  }
  return ut
}

/**
 * Kommentarerna räknas inte.
 *
 * `sprak.ts` förklarar sitt eget val med `t('toolbar.sort')` som avskräckande
 * exempel. Utan strykningen hade testet krävt en översättning av den.
 */
function utanKommentarer(kod: string): string {
  return kod.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const filer = kallfiler(ROT).map((vag) => ({
  vag,
  kod: utanKommentarer(readFileSync(vag, 'utf8')),
}))
const allKod = filer.map((f) => f.kod).join('\n')

/**
 * Meningarna som skickas genom `t()`, `tf()` och `tj()` som strängliteral.
 *
 * Uppslag på en variabel — `t(post.etikett)` — syns inte här. De hämtar sin
 * text ur kärnans tabeller, och de fångas i stället av kontrollen mot
 * övergivna poster längre ned: en tabelltext som saknas i ordboken märks
 * genom att gränssnittet står kvar på svenska, medan en ordbokspost utan
 * text i koden fälls direkt.
 */
function meningar(kod: string): string[] {
  const ut: string[] = []
  const re = /(?<![.\w$])(?:t|tf|tj)\(\s*'((?:[^'\\]|\\.)*)'/g
  for (const m of kod.matchAll(re)) ut.push(m[1]!.replace(/\\'/g, "'").replace(/\\\\/g, '\\'))
  return ut
}

describe('ordboken', () => {
  it('har en engelsk motsvarighet till varje mening som översätts', () => {
    const saknade = new Map<string, string>()
    for (const { vag, kod } of filer) {
      for (const mening of meningar(kod)) {
        if (!(mening in EN)) saknade.set(mening, vag.slice(ROT.length))
      }
    }
    expect(Object.fromEntries(saknade)).toEqual({})
  })

  it('har inga övergivna poster', () => {
    const overgivna = Object.keys(EN).filter((nyckel) => !allKod.includes(nyckel))
    expect(overgivna).toEqual([])
  })

  it('säger inte samma sak på två ställen', () => {
    const sett = new Map<string, string>()
    const dubbletter: string[] = []
    for (const [modul, poster] of [
      ['skal', SKAL],
      ['verktyg', VERKTYG],
      ['flerfil', FLERFIL],
      ['dialoger', DIALOGER],
    ] as const) {
      for (const nyckel of Object.keys(poster)) {
        const forra = sett.get(nyckel)
        if (forra !== undefined) dubbletter.push(`”${nyckel}” står i både ${forra} och ${modul}`)
        else sett.set(nyckel, modul)
      }
    }
    expect(dubbletter).toEqual([])
  })

  it('översätter ingen mening till sig själv utan att säga det', () => {
    /*
     * En post som är identisk med sin nyckel är nästan alltid ett misstag —
     * en rad man klistrat in och glömt skriva om. De få som stämmer står
     * uppräknade här, så att de är ett beslut och inte ett förbiseende.
     */
    const LIKA_PÅ_BÅDA = new Set(['Filter', 'Filter…', 'Format', '{0} — {1}'])
    const likadana = Object.entries(EN)
      .filter(([sv, en]) => sv === en && !LIKA_PÅ_BÅDA.has(sv))
      .map(([sv]) => sv)
    expect(likadana).toEqual([])
  })
})
