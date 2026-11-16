import { defineConfig } from '@playwright/test'

/**
 * DataGrid rendering-performance suite.
 *
 * Runs against the dedicated harness config (`config/vite.config.perf.ts`), which
 * serves `perf.html` without the app shell — no GreptimeDB connection, no auth,
 * deterministic fixture data, so timings are comparable between runs.
 *
 *   pnpm perf            # run + print numbers
 *   pnpm perf:update     # (no snapshots today; timings are logged, not stored)
 */
const port = Number(process.env.PERF_PORT || 5180)
const host = process.env.PERF_HOST || '127.0.0.1'
const url = `http://${host}:${port}/perf.html`

export default defineConfig({
  testDir: './tests/perf',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    headless: true,
    baseURL: `http://${host}:${port}`,
    viewport: { width: 1680, height: 900 },
    screenshot: 'off',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec vite --config ./config/vite.config.perf.ts`,
    url,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
