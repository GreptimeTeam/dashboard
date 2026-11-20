import path from 'node:path'
import { defineConfig } from '@playwright/test'

const port = Number(process.env.SMOKE_PORT || 4173)
const host = process.env.SMOKE_HOST || '127.0.0.1'
const distDir = path.resolve(process.env.SMOKE_DIST_DIR || path.join(process.cwd(), 'dist'))
const distDirArg = distDir.replace(/'/g, `'\\''`)

const serveCommand = [
  'pnpm exec vite preview',
  '--config ./config/vite.config.base.ts',
  `--outDir '${distDirArg}'`,
  `--host ${host}`,
  `--port ${port}`,
  '--strictPort',
].join(' ')

export default defineConfig({
  testDir: './tests/menu-smoke',
  testMatch: /menu-smoke\.spec\.ts/,
  timeout: 360_000,
  expect: {
    timeout: 20_000,
  },
  fullyParallel: false,
  workers: 1,
  globalSetup: './tests/menu-smoke/fixtures/global-setup.ts',
  globalTeardown: './tests/menu-smoke/fixtures/global-teardown.ts',
  reporter: [
    ['list'],
    [
      'html',
      {
        open: process.env.CI || process.env.SMOKE_NO_OPEN ? 'never' : 'on-failure',
        outputFolder: 'artifacts/menu-smoke/playwright-report',
      },
    ],
  ],
  use: {
    headless: true,
    baseURL: process.env.SMOKE_BASE_URL || `http://${host}:${port}`,
    viewport: { width: 1440, height: 900 },
    screenshot: 'off',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: serveCommand,
    url: `http://${host}:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
