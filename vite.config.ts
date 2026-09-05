import { cp, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/**
 * Innehållssäkerhetspolicy.
 *
 * `connect-src 'none'` är kärnan i integritetslöftet: den gör det maskinellt
 * kontrollerbart att appen inte kan skicka data någonstans. Vem som helst kan
 * öppna utvecklarverktygen och se det själv. I utvecklingsläge behöver Vite
 * sin egen kanal för omladdning, så policyn skärps först i bygget.
 */
const CSP_PRODUCTION = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  // frame-ancestors kan bara levereras som HTTP-header och ignoreras i en
  // meta-tagg — den skulle bara ge en konsolvarning för varje besökare.
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'csv-verkstan-csp',
    transformIndexHtml(html, ctx) {
      if (!ctx.server) {
        return html.replace(
          '<!--CSP-->',
          `<meta http-equiv="Content-Security-Policy" content="${CSP_PRODUCTION}" />`,
        )
      }
      return html.replace('<!--CSP-->', '<!-- CSP läggs på vid bygge -->')
    },
  }
}

/**
 * Användarguiden med i publiceringen.
 *
 * Guiden ligger i `docs/` därför att det är där repots dokumentation hör
 * hemma, och `docs/guide.html` går att öppna direkt från disk. GitHub renderar
 * däremot inte HTML ur ett repo — den som inte klonat ser bara källkoden. Så
 * sidan följer med bygget och blir läsbar på `…/guide/` bredvid appen.
 *
 * Filen döps om till `index.html` på vägen: adressen ska vara `/guide/`, inte
 * `/guide/guide.html`. Namnet i repot är `guide.html` av motsatt skäl — en
 * `index.html` i `docs/` säger ingenting om vad den innehåller.
 *
 * Kopieringen sker i `closeBundle` och inte via `public/`: bilderna är fyra
 * megabyte som Vite annars skulle läsa in i minnet som tillgångar, och de
 * finns redan på rätt plats under `docs/`.
 */
function anvandarguiden(): Plugin {
  let utkatalog = 'dist'
  return {
    name: 'csv-verkstan-guide',
    apply: 'build',
    configResolved(config) {
      utkatalog = config.build.outDir
    },
    async closeBundle() {
      const mal = join(utkatalog, 'guide')
      for (const fil of ['guide.html', 'guide.js', 'guide-sv.js', 'guide-en.js']) {
        await cp(join('docs', fil), join(mal, fil), { recursive: true })
      }
      await cp('docs/bilder', join(mal, 'bilder'), { recursive: true })
      await rename(join(mal, 'guide.html'), join(mal, 'index.html'))
    },
  }
}

export default defineConfig({
  plugins: [contentSecurityPolicy(), anvandarguiden()],
  // Relativ bas gör bygget sökvägsoberoende: det fungerar på GitHub Pages
  // under /CSV-Tool/ lika väl som på ett eget domännamn, utan att sökvägen
  // behöver byggas in.
  //
  // Det räcker däremot inte för att öppna dist/index.html direkt från disk.
  // Bygget laddar sin kod som ES-moduler, och från file:// är sidans ursprung
  // opakt — webbläsaren blockerar då både modulskriptet, modul-workern och de
  // dynamiska importerna som korsursprung. Ett bygge som startar från disk
  // kräver att allt inlineas i en enda fil, vilket är en egen sak.
  base: './',
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
})
