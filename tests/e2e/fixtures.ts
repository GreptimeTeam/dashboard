/**
 * Single-session fixtures.
 *
 * One browser context + one page per worker, booted once and reused by every test. A test only
 * navigates (deep link) and asserts; it never re-launches the browser or reloads the app.
 *
 *  - `app`     : page configured for the fixed test database (E2E_DB)
 *  - `explore` : page configured for the existing database (EXPLORE_DB), booted lazily
 */
import { test as base, expect, type Browser, type Page, type Request, type TestInfo } from '@playwright/test'
import { BASE_URL, E2E_DB, EXPLORE_DB } from './env'

type Collector = { hard: string[]; warn: string[] }

const collectors = new WeakMap<Page, Collector>()
/** Requests currently in flight per page — a screenshot is only taken once these have drained. */
const inflight = new WeakMap<Page, Set<Request>>()

const RUNTIME_ERROR =
  /uncaught|typeerror|referenceerror|syntaxerror|cannot read|failed to fetch dynamically imported module/i

function watch(page: Page): Collector {
  const collector: Collector = { hard: [], warn: [] }
  collectors.set(page, collector)

  const pending = new Set<Request>()
  inflight.set(page, pending)
  page.on('request', (request) => pending.add(request))
  page.on('requestfinished', (request) => pending.delete(request))
  page.on('requestfailed', (request) => pending.delete(request))

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

/** Visible loading indicators: arco spinners, grid/chart loading masks, skeletons. */
const LOADING =
  '.arco-spin-loading, .arco-spin-mask, .arco-spin-icon, .arco-icon-loading, .vxe-loading.is--visible, .arco-skeleton, [class*="loading-tip"]'

/**
 * How long the page must stay quiet before a screenshot is taken (charts animate in during it) and
 * how long we are willing to wait. Fixed on purpose: `pnpm e2e` needs no tuning, and the screenshot
 * is the reason the report is worth looking at.
 */
const SETTLE_QUIET_MS = 200
const SETTLE_CAP_MS = 5000

/**
 * Resolves once the page looks finished: no request in flight and no visible loading indicator for a
 * quiet period (charts animate in during it). Capped, so a long-poll can never hang a test.
 */
export async function settle(page: Page, cap = SETTLE_CAP_MS): Promise<void> {
  const pending = inflight.get(page)
  const deadline = Date.now() + cap
  let quietSince = Date.now()
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const spinning = await page
      .evaluate(
        (selector) =>
          [...document.querySelectorAll(selector)].some((el) => {
            const box = el.getBoundingClientRect()
            const style = getComputedStyle(el)
            // Only what is on screen counts: charts below the fold load lazily and spin until scrolled to.
            const onScreen = box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight
            return onScreen && style.visibility !== 'hidden' && style.opacity !== '0'
          }),
        LOADING
      )
      .catch(() => false)
    if (spinning || (pending && pending.size > 0)) quietSince = Date.now()
    else if (Date.now() - quietSince >= SETTLE_QUIET_MS) return
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(100)
  }
}

/** Attaches a screenshot of the (settled) page to the report; use it for intermediate steps of a flow. */
export async function snap(page: Page, name: string): Promise<void> {
  await settle(page)
  const body = await page.screenshot().catch(() => undefined)
  if (body) await base.info().attach(name, { body, contentType: 'image/png' })
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

/** The spec file the shared page currently belongs to (worker-scoped page, file-scoped state). */
const pageFile = new WeakMap<Page, string>()

/**
 * Resets the shared page when a new spec file starts on this worker.
 *
 * The page lives for the whole worker, so without this every file inherits the previous file's
 * keep-alive pages, timers, charts and overlays. That is invisible with one worker and shows up as
 * multi-second stalls (or lost navigations) as soon as files run in parallel. A reload costs ~1s
 * per file and is the same reset a user gets from F5.
 */
async function resetForFile(page: Page, file: string): Promise<void> {
  const previous = pageFile.get(page)
  pageFile.set(page, file)
  // Only needed once files run in parallel (see playwright.e2e.config.ts); with one worker the
  // page is reused for the whole run on purpose, and a reload would cost ~1s per file.
  if (previous === file || Number(process.env.E2E_WORKERS || 1) <= 1) return
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined)
  await page
    .waitForFunction(
      () => !!(document.querySelector('#app') as any)?.__vue_app__?.config?.globalProperties?.$router,
      undefined,
      { timeout: 20_000 }
    )
    .catch(() => undefined)
}

/** Hands the shared page to a test, then reports frontend crashes attributed to that test. */
async function lend(page: Page, use: (shared: Page) => Promise<void>, testInfo: TestInfo): Promise<void> {
  const collector = collectors.get(page) as Collector
  collector.hard.length = 0
  collector.warn.length = 0

  await use(page)

  // Every test ends with a screenshot of the page as the test left it (before cleanup below), so the
  // HTML report shows what each case verified — passed or failed.
  // The caption names the state it shows: a bare "screenshot.png" left readers guessing which page
  // (and which step) they were looking at.
  const failed = testInfo.status !== testInfo.expectedStatus
  const skipped = testInfo.status === 'skipped'
  if (!skipped) {
    await settle(page)
    const route = await page
      .evaluate(() => (window.location.hash.split('?')[0] || '/').replace(/^#/, ''))
      .catch(() => '')
    const body = await page.screenshot().catch(() => undefined)
    if (body) {
      await testInfo.attach(`${failed ? 'failure' : 'final state'} — ${route || 'unknown route'}`, {
        body,
        contentType: 'image/png',
      })
    }
  }

  // The page outlives the test: dismiss any popover / drawer / modal the test left open, otherwise
  // it would swallow the next test's clicks. A drawer that ignores Escape is handled with a reload
  // (same context, so the configured database survives) — cheaper than an hour of cascading flakes.
  await page.keyboard.press('Escape').catch(() => undefined)
  if (await page.locator('.arco-modal:visible, .arco-drawer:visible').count()) {
    await page.keyboard.press('Escape').catch(() => undefined)
    if (await page.locator('.arco-modal:visible, .arco-drawer:visible').count()) {
      await page.goto('/#/dashboard/query', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
    }
  }

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
  app: async ({ sharedApp }, use, testInfo) => {
    await resetForFile(sharedApp, testInfo.file)
    await lend(sharedApp, use, testInfo)
  },
  explore: async ({ sharedExplore }, use, testInfo) => {
    await resetForFile(sharedExplore, testInfo.file)
    await lend(sharedExplore, use, testInfo)
  },
})

export { expect }
