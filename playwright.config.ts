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
    // --host 127.0.0.1 är avgörande. Utan den binder Vite till namnet
    // "localhost", som på en del maskiner slås upp till ::1. Servern lyssnar
    // då bara på IPv6 medan Playwright pollar 127.0.0.1, och väntan går ut
    // efter 60 s utan att ett enda test har körts.
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    // I CI ska servern alltid startas färsk; lokalt är återanvändning bekvämt.
    reuseExistingServer: !process.env.CI,
    // Kall npm-cache på en byggagent kan behöva mer än en minut.
    timeout: 120_000,
    // Serverns utskrift följer med i byggloggen, så nästa fel syns direkt.
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
