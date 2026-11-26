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
  // Tests share one page per worker, so each worker stays sequential; the *files* run in parallel.
  // Every file owns its write targets (`e2e_<file>_*`) and the page is reset between files, so
  // `E2E_WORKERS=2` is safe — it measured ~2x on an idle machine but flaked at load average 11
  // (a loaded CI box turns parallel workers into 20s timeouts), so it stays opt-in.
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
    // Kept only when a test fails: a failed run is otherwise just one screenshot, which is not
    // enough to tell a product bug from a test artefact. Passing runs pay nothing.
    trace: 'retain-on-failure',
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
    // Reusing a warm preview server is a big local speed-up, but in CI it can only mean that
    // something else is already on the port — there the suite must own the server.
    // globalSetup additionally verifies the served bundle matches `dist/`.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
