import path from 'node:path'
import { defineConfig } from '@playwright/test'
import { BASE_URL, HOST, PORT } from './tests/e2e/env'

/**
 * Single-session e2e: every worker boots the app once and navigates by deep link.
 *
 *   pnpm e2e:seed     build / verify the fixed test database
 *   pnpm e2e:smoke    @smoke only (seconds)
 *   pnpm e2e          everything (minutes)
 *   pnpm e2e:report   open artifacts/e2e/report.html (self-contained, per-test screenshots, no server)
 *
 * Needs a built app in `dist/` (or E2E_DIST_DIR) and GreptimeDB at http://127.0.0.1:4000 (E2E_DB_HTTP
 * for the seed scripts; `vite preview` proxies /v1 there). A running preview server is reused.
 */
const distDir = path.resolve(process.env.E2E_DIST_DIR || 'dist').replace(/'/g, `'\\''`)

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts/,
  globalSetup: './tests/e2e/global-setup.ts',
  // Tests share one page per worker, so keep a worker sequential; raise E2E_WORKERS for more sessions.
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS || 1),
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // One self-contained file with every screenshot inlined: open artifacts/e2e/report.html straight from disk.
  reporter: [['list'], ['./tests/e2e/reporter.ts']],
  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 1440, height: 900 },
    // Screenshots are attached per test by the shared-page fixture (the page is shared, so Playwright's own
    // screenshot option does not apply).
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: [
      'pnpm exec vite preview',
      '--config ./config/vite.config.base.ts',
      `--outDir '${distDir}'`,
      `--host ${HOST}`,
      `--port ${PORT}`,
      '--strictPort',
    ].join(' '),
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
