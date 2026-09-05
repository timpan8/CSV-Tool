import { defineConfig } from '@playwright/test'
import bas from './playwright.config.js'

/**
 * Konfigurationen för skärmbilderna till användarguiden.
 *
 * Den ligger i en **egen fil** i stället för som ett andra projekt i
 * `playwright.config.ts`. Skälet är CI: workflowen kör `npx playwright test`
 * utan argument, och ett andra projekt hade då kommit med i varje pull request
 * — en bildgenerering som ingen bett om, i en körning som ska svara på om
 * koden fungerar. Sviten ligger dessutom i `tests/bilder/`, utanför den
 * vanliga konfigurationens `testDir`, så den är osynlig för `npm run test:e2e`
 * även om någon skulle peka om den här filen.
 *
 * Webbserver, webbläsare och baseURL ärvs från den vanliga konfigurationen, så
 * att bilderna tas av exakt samma bygge som testerna körs mot.
 */
export default defineConfig({
  ...bas,
  testDir: './tests/bilder',
  outputDir: './test-results/bilder',
  // Bilderna skrivs till en gemensam katalog. Med flera arbetare skulle två
  // körningar kunna stå och skriva samma fil samtidigt, och den som förlorar
  // lämnar en halv PNG efter sig.
  workers: 1,
  // En bild som inte gick att ta ska falla, inte tas om tills den råkar
  // lyckas — ett omtag hade dolt att en etikett bytt namn.
  retries: 0,
})
