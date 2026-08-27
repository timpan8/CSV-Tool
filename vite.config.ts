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
  "frame-ancestors 'none'",
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

export default defineConfig({
  plugins: [contentSecurityPolicy()],
  // Relativ bas gör bygget sökvägsoberoende: fungerar på GitHub Pages under
  // /CSV-Tool/, på ett eget domännamn, och när dist/ öppnas direkt från disk.
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
