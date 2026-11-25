/**
 * Single-session fixtures.
 *
 * One browser context + one page per worker, booted once and reused by every test. A test only
 * navigates (deep link) and asserts; it never re-launches the browser or reloads the app.
 *
 *  - `app`     : page configured for the fixed test database (E2E_DB)
 *  - `explore` : page configured for the existing database (EXPLORE_DB), booted lazily
 */
import { test as base, expect, type Browser, type Page, type TestInfo } from '@playwright/test'
import { BASE_URL, E2E_DB, EXPLORE_DB } from './env'

type Collector = { hard: string[]; warn: string[] }

const collectors = new WeakMap<Page, Collector>()

const RUNTIME_ERROR =
  /uncaught|typeerror|referenceerror|syntaxerror|cannot read|failed to fetch dynamically imported module/i

function watch(page: Page): Collector {
  const collector: Collector = { hard: [], warn: [] }
  collectors.set(page, collector)

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    ;(RUNTIME_ERROR.test(text) ? collector.hard : collector.warn).push(`[console.error] ${text}`)
  })
  page.on('pageerror', (error) => {
    const message = error?.message || String(error)
    // Axios rejections surface as a bare "Object"; they are API noise, not a crash.
    ;(message === 'Object' ? collector.warn : collector.hard).push(`[pageerror] ${message}`)
  })
  page.on('requestfailed', (request) => {
    const url = request.url()
    const detail = `${request.method()} ${url} :: ${request.failure()?.errorText || 'unknown'}`
    // Aborted requests happen naturally on navigation; only broken same-origin assets are fatal.
    const failedAsset = url.startsWith(BASE_URL) && !url.includes('/v1/') && !/aborted/i.test(detail)
    ;(failedAsset ? collector.hard : collector.warn).push(`[requestfailed] ${detail}`)
  })
  return collector
}

async function openApp(browser: Browser, database: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 900 } })
  await context.addInitScript((db) => {
    // Empty host => same-origin /v1 (proxied to GreptimeDB by `vite preview`).
    const config = { host: '', database: db, username: '', password: '', authHeader: '', userTimezone: '' }
    localStorage.setItem('config', JSON.stringify(config))
    localStorage.setItem('uiConfig', JSON.stringify({}))
    // Per-signal database preferences (see signal-database.ts).
    ;['logs', 'traces', 'metrics'].forEach((signal) => {
      localStorage.setItem(`signal-db:${signal}`, JSON.stringify({ v: 1, host: '', database: db }))
    })
  }, database)

  const page = await context.newPage()
  watch(page)
  await page.goto('/#/dashboard/query', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => !!(document.querySelector('#app') as any)?.__vue_app__?.config?.globalProperties?.$router,
    undefined,
    { timeout: 20_000 }
  )
  return page
}

/** Hands the shared page to a test, then reports frontend crashes attributed to that test. */
async function lend(page: Page, use: (shared: Page) => Promise<void>, testInfo: TestInfo): Promise<void> {
  const collector = collectors.get(page) as Collector
  collector.hard.length = 0
  collector.warn.length = 0

  await use(page)

  // Every test ends with a screenshot of the page as the test left it (before cleanup below), so the
  // HTML report shows what each case verified — passed or failed.
  // Let in-flight loading indicators clear first, so the picture shows results rather than spinners.
  await page
    .waitForFunction(() => !document.querySelector('.arco-spin-loading, .arco-spin-mask, .arco-spin-icon'), undefined, {
      timeout: 4000,
    })
    .catch(() => undefined)
  const body = await page.screenshot().catch(() => undefined)
  if (body) {
    const failed = testInfo.status !== testInfo.expectedStatus
    await testInfo.attach(failed ? 'failure.png' : 'screenshot.png', { body, contentType: 'image/png' })
  }

  // The page outlives the test: dismiss any popover / drawer / modal the test left open, otherwise
  // it would swallow the next test's clicks.
  await page.keyboard.press('Escape').catch(() => undefined)

  if (collector.warn.length > 0) {
    await testInfo.attach('warnings.txt', { body: collector.warn.join('\n'), contentType: 'text/plain' })
  }
  expect(collector.hard, 'frontend runtime errors').toEqual([])
}

export const test = base.extend<{ app: Page; explore: Page }, { sharedApp: Page; sharedExplore: Page }>({
  sharedApp: [
    async ({ browser }, use) => {
      const page = await openApp(browser, E2E_DB)
      await use(page)
      await page.context().close()
    },
    { scope: 'worker' },
  ],
  sharedExplore: [
    async ({ browser }, use) => {
      const page = await openApp(browser, EXPLORE_DB)
      await use(page)
      await page.context().close()
    },
    { scope: 'worker' },
  ],
  app: async ({ sharedApp }, use, testInfo) => lend(sharedApp, use, testInfo),
  explore: async ({ sharedExplore }, use, testInfo) => lend(sharedExplore, use, testInfo),
})

export { expect }
