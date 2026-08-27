import { useEffect, useMemo, useState } from 'preact/hooks'
import { Verktygspanel } from './Verktygspanel.js'
import { Notis, Val } from './parts.js'
import type { Column } from '../core/types.js'
import { codeCounts } from '../core/frame/column.js'
import {
  EPOSTFALT,
  epostTransform,
  inventeraEpost,
  type Epostfalt,
} from '../core/ops/email.js'
import { beraknaForhandsvisning, type Forhandsvisning } from '../state/preview.js'
import { celler, formatCount } from '../core/locale/sv.js'

/**
 * E-post → namn och domän.
 *
 * Till skillnad från datumverktyget skriver det här inte om kolumnen utan
 * skapar en ny bredvid den. Adressen är fortfarande sanningen; det utlästa
 * namnet är en tolkning, och att skriva över adressen med den vore att kasta
 * originalet för en gissning.
 */
export function EmailTool(props: {
  col: Column
  dataRevision: number
  visaBara: 'andrade' | 'problem' | undefined
  onVisaBara: (v: 'andrade' | 'problem' | undefined) => void
  onForhandsvisning: (forh: Forhandsvisning | null) => void
  onTillampa: (forh: Forhandsvisning) => void
  onStang: () => void
}) {
  const { col } = props
  const [falt, setFalt] = useState<Epostfalt>('fornamn')
  const [efternamnForst, setEfternamnForst] = useState(false)
  const [namn, setNamn] = useState('Förnamn')
  // Sant tills användaren själv skrivit i namnfältet; då slutar det följa med.
  const [namnFoljer, setNamnFoljer] = useState(true)

  const antal = useMemo(() => codeCounts(col), [col, props.dataRevision])
  const inv = useMemo(
    () => inventeraEpost(col.dict, { efternamnForst }, Array.from(antal)),
    [col, props.dataRevision, antal, efternamnForst],
  )

  const valjFalt = (v: Epostfalt) => {
    setFalt(v)
    if (namnFoljer) setNamn(EPOSTFALT.find((f) => f.varde === v)!.etikett)
  }

  const forh = useMemo(
    () =>
      beraknaForhandsvisning(col, {
        etikett: `${EPOSTFALT.find((f) => f.varde === falt)!.etikett} ur ”${col.name}”`,
        kind: 'email',
        fn: epostTransform(falt, { efternamnForst }),
        // Ett problem är en cell som inte ger något värde alls: adressen går
        // inte att tolka, eller saknar den del man bett om.
        arProblem: (v) => epostTransform(falt, { efternamnForst })(v) === '',
        nyaKolumner: [namn.trim() === '' ? 'Ny kolumn' : namn.trim()],
      }),
    [col, props.dataRevision, falt, efternamnForst, namn],
  )

  useEffect(() => {
    props.onForhandsvisning(forh)
  }, [forh])

  useEffect(() => {
    return () => props.onForhandsvisning(null)
  }, [])

  const namnfalt = falt === 'fornamn' || falt === 'efternamn' || falt === 'helt-namn'
  const exempel = inv.exempelNamn

  return (
    <Verktygspanel
      titel="E-post"
      underrubrik={col.name}
      onStang={props.onStang}
      fot={
        <>
          <button class="knapp" onClick={props.onStang}>
            Avbryt
          </button>
          <button
            class="knapp knapp--primar"
            disabled={forh.andrade === 0}
            title={forh.andrade === 0 ? 'Kolumnen skulle bli tom.' : undefined}
            onClick={() => props.onTillampa(forh)}
          >
            Skapa kolumnen
          </button>
        </>
      }
    >
      <div class="falt">
        <span class="falt__etikett">Det här finns i kolumnen</span>
        <table class="inventering">
          <tbody>
            <tr>
              <td class="inventering__antal">{formatCount(inv.adresser)}</td>
              <td>e-postadresser</td>
              <td class="inventering__exempel">{exempel?.adress ?? ''}</td>
            </tr>
            {inv.ejAdress > 0 && (
              <tr class="inventering--okant">
                <td class="inventering__antal">{formatCount(inv.ejAdress)}</td>
                <td>är inte adresser</td>
                <td class="inventering__exempel" />
              </tr>
            )}
            {inv.rollkonton > 0 && (
              <tr>
                <td class="inventering__antal">{formatCount(inv.rollkonton)}</td>
                <td>funktionsadresser</td>
                <td class="inventering__exempel">{inv.exempelUtanNamn ?? ''}</td>
              </tr>
            )}
            {inv.privata > 0 && (
              <tr>
                <td class="inventering__antal">{formatCount(inv.privata)}</td>
                <td>privatadresser</td>
                <td class="inventering__exempel" />
              </tr>
            )}
            <tr>
              <td class="inventering__antal">{formatCount(inv.domaner.length)}</td>
              <td>domäner</td>
              <td class="inventering__exempel">
                {inv.domaner
                  .slice(0, 3)
                  .map((d) => `${d.doman} ${formatCount(d.antal)}`)
                  .join('  ')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="falt">
        <span class="falt__etikett">Hämta</span>
        <Val
          varden={EPOSTFALT.map((f) => ({ varde: f.varde, etikett: f.etikett, titel: f.exempel }))}
          valt={falt}
          onValj={valjFalt}
        />
      </div>

      {namnfalt && (
        <div class="falt">
          <span class="falt__etikett">Vilken del står först i adressen?</span>
          <Val
            varden={[
              { varde: 'fornamn' as const, etikett: 'Förnamnet', titel: 'anna.karlsson@' },
              { varde: 'efternamn' as const, etikett: 'Efternamnet', titel: 'karlsson.anna@' },
            ]}
            valt={efternamnForst ? 'efternamn' : 'fornamn'}
            onValj={(v) => setEfternamnForst(v === 'efternamn')}
          />
          {exempel && (
            <p class="verktyg__sammanfattning">
              <code>{exempel.adress}</code> läses som{' '}
              <strong>{[exempel.fornamn, exempel.efternamn].filter(Boolean).join(' ')}</strong>.
            </p>
          )}
        </div>
      )}

      <div class="falt">
        <span class="falt__etikett">Namn på den nya kolumnen</span>
        <input
          value={namn}
          onInput={(e) => {
            setNamnFoljer(false)
            setNamn((e.currentTarget as HTMLInputElement).value)
          }}
        />
      </div>

      <div class="falt">
        <span class="falt__etikett">Vad som händer</span>
        <p class="verktyg__sammanfattning verktyg__resultat">
          <strong>{formatCount(forh.andrade)}</strong> av {celler(forh.ifyllda)} ger ett värde
          {forh.problem > 0 && (
            <>
              {' · '}
              <strong class="verktyg__problem">{formatCount(forh.problem)}</strong> blir tomma
            </>
          )}
          .
        </p>
        <div class="val" role="radiogroup">
          <button
            class={`val__knapp${props.visaBara === undefined ? ' val__knapp--vald' : ''}`}
            role="radio"
            aria-checked={props.visaBara === undefined}
            onClick={() => props.onVisaBara(undefined)}
          >
            Alla rader
          </button>
          <button
            class={`val__knapp${props.visaBara === 'problem' ? ' val__knapp--vald' : ''}`}
            role="radio"
            aria-checked={props.visaBara === 'problem'}
            disabled={forh.problem === 0}
            onClick={() => props.onVisaBara('problem')}
          >
            Bara tomma
          </button>
        </div>
      </div>

      {namnfalt && (
        <Notis ton="varning">
          <strong>Å, ä och ö finns inte i adresser.</strong> <code>erik.oberg@</code> ger{' '}
          <strong>Erik Oberg</strong>, aldrig <strong>Erik Öberg</strong> — informationen finns
          inte i adressen, och verktyget kan inte se vilka av namnen det gäller. Har du en
          namnkolumn i filen är den mer tillförlitlig än den här.
        </Notis>
      )}
    </Verktygspanel>
  )
}
