import type { ComponentChildren, VNode } from 'preact'

/**
 * Ikonerna.
 *
 * Handritade som inline-SVG, inte ett bibliotek. Ett ikonpaket hade varit ett
 * sjätte beroende och dessutom laddat hundratals ikoner för de femton som
 * används. Alla ritas på samma 16 × 16-rutnät med samma linjetjocklek och
 * runda ändar, så att de ser ut som en uppsättning och inte som en samling.
 *
 * `aria-hidden` på allihop: ikonen förtydligar, den namnger inte. Knappens
 * text är dess namn — det är den skärmläsare läser upp och tester letar efter.
 */
function Ikon(props: { children: ComponentChildren }): VNode {
  return (
    <svg
      class="ikon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  )
}

export const IkonAngra = () => (
  <Ikon>
    <path d="M3.5 6.5h6a3 3 0 0 1 0 6H7" />
    <path d="M6 3.5 3 6.5l3 3" />
  </Ikon>
)

export const IkonGorOm = () => (
  <Ikon>
    <path d="M12.5 6.5h-6a3 3 0 0 0 0 6H9" />
    <path d="m10 3.5 3 3-3 3" />
  </Ikon>
)

export const IkonSortera = () => (
  <Ikon>
    <path d="M5 13V3" />
    <path d="M2.5 5.5 5 3l2.5 2.5" />
    <path d="M11 3v10" />
    <path d="M8.5 10.5 11 13l2.5-2.5" />
  </Ikon>
)

export const IkonFilter = () => (
  <Ikon>
    <path d="M2 3h12l-4.5 5.5V13l-3-1.5V8.5Z" />
  </Ikon>
)

export const IkonDubbletter = () => (
  <Ikon>
    <rect x="2" y="2" width="8" height="8" rx="1.5" />
    <path d="M6 10v2.5A1.5 1.5 0 0 0 7.5 14h5a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12.5 6H10" />
  </Ikon>
)

export const IkonStada = () => (
  <Ikon>
    <path d="M7 2.5 8.3 6.2 12 7.5 8.3 8.8 7 12.5 5.7 8.8 2 7.5l3.7-1.3Z" />
    <path d="M12.5 10.5v3M11 12h3" />
  </Ikon>
)

export const IkonSammanfatta = () => (
  <Ikon>
    <path d="M12 3.5H4.5L8.5 8 4.5 12.5H12" />
  </Ikon>
)

export const IkonPivot = () => (
  <Ikon>
    <path d="M2.5 2.5h11v11h-11Z" />
    <path d="M2.5 6h11" />
    <path d="M6 2.5v11" />
  </Ikon>
)

export const IkonFleraFiler = () => (
  <Ikon>
    <path d="m8 2.5 6 3-6 3-6-3Z" />
    <path d="m2 9.5 6 3 6-3" />
  </Ikon>
)

export const IkonOppna = () => (
  <Ikon>
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3L8 4.5h4.5A1.5 1.5 0 0 1 14 6v6.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5Z" />
  </Ikon>
)

export const IkonProfiler = () => (
  <Ikon>
    <path d="M3 8V6.5A2.5 2.5 0 0 1 5.5 4H12" />
    <path d="m10 2 2 2-2 2" />
    <path d="M13 8v1.5a2.5 2.5 0 0 1-2.5 2.5H4" />
    <path d="m6 14-2-2 2-2" />
  </Ikon>
)

export const IkonExportera = () => (
  <Ikon>
    <path d="M8 2v8" />
    <path d="m5 7 3 3 3-3" />
    <path d="M2.5 11v1.5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V11" />
  </Ikon>
)

export const IkonSol = () => (
  <Ikon>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" />
  </Ikon>
)

export const IkonMane = () => (
  <Ikon>
    <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />
  </Ikon>
)

export const IkonKugghjul = () => (
  <Ikon>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" />
    <circle cx="8" cy="8" r="5" />
  </Ikon>
)

export const IkonPlus = () => (
  <Ikon>
    <path d="M8 3v10M3 8h10" />
  </Ikon>
)

export const IkonPil = () => (
  <Ikon>
    <path d="m4 6.5 4 4 4-4" />
  </Ikon>
)
