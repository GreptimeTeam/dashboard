import path from 'node:path'
import { defineConfig } from '@playwright/test'

const port = Number(process.env.SMOKE_PORT || 4173)
const host = process.env.SMOKE_HOST || '127.0.0.1'
const distDir = path.resolve(process.env.SMOKE_DIST_DIR || path.join(process.cwd(), 'dist'))
const distDirArg = distDir.replace(/'/g, `'\\''`)

// Serve release (or local) dist via vite preview so /v1 is proxied to GreptimeDB
// (see config/vite.config.base.ts preview.proxy → http://127.0.0.1:4000).
const serveCommand = [
  'pnpm exec vite preview',
  '--config ./config/vite.config.base.ts',
  `--outDir '${distDirArg}'`,
  `--host ${host}`,
  `--port ${port}`,
  '--strictPort',
].join(' ')

export default defineConfig({
  testDir: './tests/release-smoke',
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    [
      'html',
      {
        open: process.env.CI || process.env.SMOKE_NO_OPEN ? 'never' : 'on-failure',
        outputFolder: 'artifacts/release-smoke/report',
      },
    ],
  ],
  use: {
    headless: true,
    baseURL: process.env.SMOKE_BASE_URL || `http://${host}:${port}`,
    viewport: { width: 1720, height: 980 },
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
