/**
 * Användarguiden som sida.
 *
 * Sidan bygger sig själv ur `guide-sv.js` och `guide-en.js`. Skälet att den är
 * skriven och inte statisk HTML är sökrutan: den ska filtrera menyn och
 * innehållet samtidigt, och språkbytet ska inte vara en egen fil som hinner
 * glida isär från den andra.
 *
 * Inget ramverk och inget byggsteg. Sidan ligger i `docs/` och ska gå att
 * öppna genom att dubbelklicka på filen, utan npm och utan server — vilket
 * också är varför den läses som ett vanligt skript och inte som en modul.
 *
 * Ingenting här rör nätet. Sidan har samma `connect-src 'none'` som appen, av
 * samma skäl: löftet ska gå att kontrollera, inte läsas.
 */

/** Rubrikens avstånd från fönsterkanten innan avsnittet räknas som det man läser. */
const LAS_GRANS = 120

/** Under den här bredden ligger menyn ovanför texten i stället för bredvid. */
const SMAL_SKARM = window.matchMedia('(max-width: 900px)')

const state = {
  sprak: 'sv',
  q: '',
  aktiv: '',
}

/* ---------------------------------------------------------------- element */

/**
 * Kortfattad `document.createElement`.
 *
 * Barn får vara strängar, noder eller null — det sista för att ett avsnitt
 * som saknar steg ska kunna skriva `el('div', {}, stegen(s))` utan att först
 * fråga om det finns några.
 */
function el(taggnamn, attribut, ...barn) {
  const nod = document.createElement(taggnamn)
  for (const [namn, varde] of Object.entries(attribut || {})) {
    if (varde == null || varde === false) continue
    if (namn === 'class') nod.className = varde
    else if (namn.startsWith('on')) nod.addEventListener(namn.slice(2), varde)
    else nod.setAttribute(namn, varde)
  }
  for (const b of barn.flat()) {
    if (b == null || b === false) continue
    nod.append(b)
  }
  return nod
}

/**
 * `**fet**`, `` `kod` `` och `*kursiv*` ur guidens text.
 *
 * Texten skrivs som markdown i datafilerna så att den går att flytta mellan
 * `.md`-guiden och den här sidan utan att skrivas om. Ingen HTML tolkas —
 * allt annat blir textnoder, så en `<` i en formel kan aldrig bli ett element.
 */
function text(strang) {
  const bitar = String(strang).split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g)
  return bitar.filter(Boolean).map((bit) => {
    if (bit.startsWith('**') && bit.endsWith('**')) return el('strong', {}, bit.slice(2, -2))
    if (bit.startsWith('`') && bit.endsWith('`')) return el('code', {}, bit.slice(1, -1))
    if (bit.startsWith('*') && bit.endsWith('*')) return el('em', {}, bit.slice(1, -1))
    return document.createTextNode(bit)
  })
}

/** Områdets nummer, som det står i menyn och i rubriken: 01, 02, … */
function nummer(index) {
  return String(index + 1).padStart(2, '0')
}

/* ------------------------------------------------------------------- data */

const guide = () => (state.sprak === 'en' ? window.GUIDE_EN : window.GUIDE_SV)

/**
 * Områdena som de ska visas, med sökningen tillämpad.
 *
 * En träff på områdets namn behåller hela området — söker man på "Städa" vill
 * man se vad som finns där, inte bara de avsnitt som råkar upprepa ordet.
 */
function omraden() {
  const q = state.q.trim().toLowerCase()
  return guide()
    .groups.map((omrade, i) => {
      const traffOmrade = omrade.t.toLowerCase().includes(q)
      const avsnitt = omrade.sections.filter((s) => !q || traffOmrade || matchar(s, q))
      return { ...omrade, nr: nummer(i), sections: avsnitt }
    })
    .filter((omrade) => omrade.sections.length > 0)
}

/** Söker i allt som är text i ett avsnitt — inte bara i rubriken. */
function matchar(avsnitt, q) {
  const hoStack = [
    avsnitt.t,
    avsnitt.lead,
    avsnitt.cap,
    (avsnitt.steps || []).join(' '),
    (avsnitt.notes || []).join(' '),
    (avsnitt.legend || []).map((l) => `${l.t} ${l.d}`).join(' '),
    (avsnitt.kbd || []).flat().join(' '),
    (avsnitt.table ? avsnitt.table.rows.flat() : []).join(' '),
  ]
  return hoStack.join(' ').toLowerCase().includes(q)
}

/* -------------------------------------------------------------------- meny */

function ritaMeny() {
  const ui = guide().ui
  const meny = document.querySelector('#meny')
  meny.replaceChildren(
    ...omraden().map((omrade) =>
      el(
        'div',
        { class: 'meny-omrade' },
        el(
          'a',
          { href: `#${omrade.id}`, class: 'meny-rubrik' },
          el('span', { class: 'nr' }, omrade.nr),
          el('span', {}, omrade.t),
        ),
        ...omrade.sections.map((s) =>
          el(
            'a',
            {
              href: `#${s.id}`,
              class: state.aktiv === s.id ? 'meny-lank ar-aktiv' : 'meny-lank',
              'aria-current': state.aktiv === s.id ? 'true' : null,
              // På en smal skärm står menyn ovanför texten. Fälls den inte
              // ihop efter klicket ligger avsnittet man valde kvar under en
              // skärm meny.
              onclick: () => {
                if (SMAL_SKARM.matches) document.querySelector('#meny-lada').open = false
              },
            },
            s.t,
          ),
        ),
      ),
    ),
  )
  const tomt = document.querySelector('#inga-traffar')
  tomt.textContent = ui.noHits
  tomt.hidden = omraden().length > 0
}

/* ----------------------------------------------------------------- avsnitt */

/** Bilden med sin bildtext, klickbar för att förstoras. */
function bild(avsnitt) {
  if (!avsnitt.img) return null
  const kalla = `bilder/${state.sprak}/${avsnitt.img}`
  const bildnod = el('img', {
    src: kalla,
    alt: avsnitt.cap || avsnitt.t,
    loading: 'lazy',
    decoding: 'async',
  })
  return el(
    'figure',
    {},
    el(
      'button',
      {
        type: 'button',
        class: 'bildram',
        title: guide().ui.zoom,
        // Bilden är en knapp och inte en div: förstoringen ska gå att nå med
        // tangentbordet, och skärmläsaren ska säga att det går att klicka.
        style: avsnitt.imgWidth ? `max-width: ${avsnitt.imgWidth + 18}px` : null,
        onclick: () => forstora(kalla, avsnitt.cap || avsnitt.t),
      },
      bildnod,
    ),
    avsnitt.cap ? el('figcaption', {}, avsnitt.cap) : null,
  )
}

/** Numrerad förklaring till en bild vars delar är numrerade. */
function forklaring(avsnitt) {
  if (!avsnitt.legend) return null
  return el(
    'ol',
    { class: 'forklaring' },
    ...avsnitt.legend.map((rad, i) =>
      el(
        'li',
        {},
        el('span', { class: 'siffra' }, String(i + 1)),
        el('span', {}, el('strong', {}, rad.t), ' — ', ...text(rad.d)),
      ),
    ),
  )
}

/** En rubriksatt lista: "Så gör du" numrerad, "Värt att veta" som punkter. */
function lista(rubrik, rader, klass) {
  if (!rader || rader.length === 0) return null
  const numrerad = klass === 'steg'
  return el(
    'div',
    { class: klass },
    el('h4', {}, rubrik),
    el(
      numrerad ? 'ol' : 'ul',
      {},
      ...rader.map((rad, i) =>
        el(
          'li',
          {},
          numrerad ? el('span', { class: 'siffra' }, String(i + 1)) : el('span', { class: 'streck' }, '—'),
          el('span', {}, ...text(rad)),
        ),
      ),
    ),
  )
}

/**
 * Två rutor med samma rader före och efter.
 *
 * Det är den enda formen som svarar på frågan man faktiskt har om datum-, tal-
 * och telefonverktyget: *vad blir det av det jag har?* En mening som beskriver
 * omskrivningen kräver att läsaren utför den i huvudet.
 */
function foreEfter(avsnitt) {
  if (!avsnitt.before || !avsnitt.after) return null
  const ruta = (data, klass) =>
    el(
      'div',
      { class: `ruta ${klass}` },
      el('h4', {}, data.label),
      el('ul', {}, ...data.items.map((v) => el('li', {}, v))),
    )
  return el('div', { class: 'fore-efter' }, ruta(avsnitt.before, 'fore'), ruta(avsnitt.after, 'efter'))
}

function tabell(avsnitt) {
  if (!avsnitt.table) return null
  return el(
    'div',
    { class: 'tabellram' },
    el(
      'table',
      {},
      el('thead', {}, el('tr', {}, ...avsnitt.table.head.map((h) => el('th', {}, h)))),
      el(
        'tbody',
        {},
        ...avsnitt.table.rows.map((rad) => el('tr', {}, ...rad.map((cell) => el('td', {}, ...text(cell))))),
      ),
    ),
  )
}

function tangenter(avsnitt) {
  if (!avsnitt.kbd) return null
  return el(
    'div',
    { class: 'tangenter' },
    ...avsnitt.kbd.map(([tangent, vad]) =>
      el('div', {}, el('kbd', {}, tangent), el('span', {}, vad)),
    ),
  )
}

function ritaAvsnitt(avsnitt) {
  const ui = guide().ui
  return el(
    'article',
    { id: avsnitt.id, 'data-avsnitt': avsnitt.id },
    el('h3', {}, avsnitt.t),
    avsnitt.lead ? el('p', { class: 'ingress' }, ...text(avsnitt.lead)) : null,
    bild(avsnitt),
    forklaring(avsnitt),
    lista(ui.steps, avsnitt.steps, 'steg'),
    foreEfter(avsnitt),
    tabell(avsnitt),
    tangenter(avsnitt),
    lista(ui.notes, avsnitt.notes, 'noteringar'),
    avsnitt.warn ? el('p', { class: 'varning' }, ...text(avsnitt.warn)) : null,
  )
}

function ritaOmrade(omrade) {
  return el(
    'section',
    { id: omrade.id, 'data-avsnitt': omrade.id },
    el(
      'div',
      { class: 'omrade-rubrik' },
      el('span', { class: 'nr' }, omrade.nr),
      el('h2', {}, omrade.t),
      omrade.sub ? el('span', { class: 'underrubrik' }, omrade.sub) : null,
    ),
    omrade.intro
      ? el(
          'div',
          { class: 'omrade-intro' },
          el('p', {}, ...text(omrade.intro)),
          omrade.introNotes
            ? el(
                'ul',
                {},
                ...omrade.introNotes.map((n) =>
                  el('li', {}, el('span', { class: 'streck' }, '—'), el('span', {}, ...text(n))),
                ),
              )
            : null,
        )
      : null,
    ...omrade.sections.map(ritaAvsnitt),
  )
}

/* -------------------------------------------------------------------- sidan */

function ritaHuvud() {
  const g = guide()
  document.title = `${g.title} — CSV-verkstan`
  document.documentElement.lang = state.sprak
  document.querySelector('#titel').textContent = g.title
  document.querySelector('#meny-titel').textContent = g.title
  document.querySelector('#ingress').textContent = g.tagline
  document.querySelector('#sok').placeholder = g.ui.search
  document.querySelector('#sok').setAttribute('aria-label', g.ui.search)
  document.querySelector('#till-toppen').textContent = g.ui.top
  document.querySelector('#meny-lock').textContent = g.ui.contents
  document.querySelector('#meny').setAttribute('aria-label', g.ui.contents)
  document.querySelector('#sidfot-titel').textContent = `CSV-verkstan · ${g.title}`
  document
    .querySelector('#fakta')
    .replaceChildren(
      ...g.facts.map((f) => el('div', {}, el('strong', {}, f.k), el('span', {}, ...text(f.v)))),
    )
}

function rita() {
  ritaHuvud()
  document.querySelector('#innehall').replaceChildren(...omraden().map(ritaOmrade))
  ritaMeny()
}

/* --------------------------------------------------------------- förstoring */

/**
 * Skärmbilderna är täta och skalas ner i spalten. Utan förstoring är
 * etiketterna i dem oläsbara, och en bild vars text inte går att läsa svarar
 * inte på frågan den är där för att svara på.
 */
function forstora(kalla, bildtext) {
  const lada = document.querySelector('#forstoring')
  lada.querySelector('img').src = kalla
  lada.querySelector('img').alt = bildtext
  lada.querySelector('figcaption').textContent = bildtext
  lada.hidden = false
  lada.querySelector('button').focus()
}

function stangForstoring() {
  const lada = document.querySelector('#forstoring')
  if (lada.hidden) return
  lada.hidden = true
  lada.querySelector('img').removeAttribute('src')
}

/* ------------------------------------------------------------- läsläget */

/**
 * Vilket avsnitt man läser just nu.
 *
 * Det sista avsnittet vars rubrik passerat läsgränsen — inte det som täcker
 * mest av fönstret. Ett kort avsnitt mellan två långa skulle annars aldrig
 * markeras i menyn, trots att det är det man står i.
 */
function uppdateraAktiv() {
  let aktiv = ''
  for (const nod of document.querySelectorAll('[data-avsnitt]')) {
    if (nod.getBoundingClientRect().top <= LAS_GRANS) aktiv = nod.dataset.avsnitt
  }
  if (aktiv === state.aktiv) return
  state.aktiv = aktiv
  ritaMeny()
}

/* ---------------------------------------------------------------- språket */

function byteSprak(sprak) {
  if (state.sprak === sprak) return
  state.sprak = sprak
  // Ankaret behålls: avsnitts-id:n är desamma på båda språken, så den som
  // läser om pivoten på svenska får den engelska pivoten och inte toppen.
  for (const knapp of document.querySelectorAll('#sprak button')) {
    knapp.setAttribute('aria-pressed', String(knapp.dataset.sprak === sprak))
  }
  rita()
  const mal = location.hash && document.querySelector(location.hash)
  if (mal) mal.scrollIntoView()
  uppdateraAktiv()
}

/* ------------------------------------------------------------------- start */

function start() {
  for (const knapp of document.querySelectorAll('#sprak button')) {
    knapp.addEventListener('click', () => byteSprak(knapp.dataset.sprak))
  }

  document.querySelector('#sok').addEventListener('input', (e) => {
    state.q = e.target.value
    // Söker man på en smal skärm är det menyn man vill se svaret i. Att fälla
    // ut den när något skrivits sparar ett klick man annars inte förstår att
    // man behöver ta.
    if (SMAL_SKARM.matches && state.q.trim()) document.querySelector('#meny-lada').open = true
    rita()
  })

  // Bredvid texten står menyn alltid öppen, och locket är dolt. Ovanför texten
  // börjar den hopfälld. Ändras bredden — en telefon som vänds — ställs den om.
  const stallInMeny = () => {
    document.querySelector('#meny-lada').open = !SMAL_SKARM.matches
  }
  SMAL_SKARM.addEventListener('change', stallInMeny)
  stallInMeny()

  document.querySelector('#forstoring').addEventListener('click', stangForstoring)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') stangForstoring()
  })

  // requestAnimationFrame i stället för att räkna om vid varje skrollhändelse:
  // uträkningen läser layouten för trettiotre element och skulle annars köras
  // långt oftare än skärmen ritas om.
  let vantar = false
  window.addEventListener(
    'scroll',
    () => {
      if (vantar) return
      vantar = true
      requestAnimationFrame(() => {
        vantar = false
        uppdateraAktiv()
      })
    },
    { passive: true },
  )

  // `?sprak=en` gör det möjligt att länka till den engelska sidan. Utan den
  // finns bara ett sätt att komma dit, och det är att klicka.
  const onskat = new URLSearchParams(location.search).get('sprak')
  state.sprak = onskat === 'en' ? 'en' : 'sv'
  for (const knapp of document.querySelectorAll('#sprak button')) {
    knapp.setAttribute('aria-pressed', String(knapp.dataset.sprak === state.sprak))
  }

  rita()
  if (location.hash) {
    const mal = document.querySelector(location.hash)
    if (mal) mal.scrollIntoView()
  }
  uppdateraAktiv()
}

start()
