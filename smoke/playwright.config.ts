import { defineConfig, devices } from '@playwright/test'

const DEV = 'http://localhost:5180'
const PREVIEW = 'http://localhost:4180'

export default defineConfig({
  testDir: 'tests',
  forbidOnly: !!process.env.CI,
  // Both servers: the dev server resolves the `development` condition and a
  // build does not. CONTRIBUTING.md, **What `@annetaan/leko` ships**. The ports
  // are not Vite's defaults, which the sandbox holds while `pnpm dev` runs.
  webServer: [
    {
      command: 'npm run dev -- --port 5180 --strictPort',
      url: DEV,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run preview -- --port 4180 --strictPort',
      url: PREVIEW,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: 'dev', use: { ...devices['Desktop Chrome'], baseURL: DEV } },
    { name: 'preview', use: { ...devices['Desktop Chrome'], baseURL: PREVIEW } },
  ],
})
