import { defineConfig } from '@playwright/test'

const port = Number(process.env.SMOKE_PORT || 4173)
const host = process.env.SMOKE_HOST || '127.0.0.1'

export default defineConfig({
  testDir: './tests/release-smoke',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'always', outputFolder: 'artifacts/release-smoke/report' }]],
  use: {
    headless: true,
    baseURL: process.env.SMOKE_BASE_URL || `http://${host}:${port}`,
    viewport: { width: 1720, height: 980 },
    screenshot: 'off',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec vite preview --config ./config/vite.config.base.ts --host ${host} --port ${port} --strictPort`,
    url: `http://${host}:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
