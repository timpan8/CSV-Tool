import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Lokalt finns Chromium förinstallerad på en känd plats. I CI installerar
    // Playwright sin egen och ska då få välja den själv.
    launchOptions: process.env.CI ? {} : { executablePath: '/opt/pw-browsers/chromium' },
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
