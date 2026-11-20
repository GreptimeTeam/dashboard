import type { Page } from '@playwright/test'

const POLL_MS = 250

/** Hash-history SPA navigate; falls back to hard goto. */
export async function spaPush(page: Page, routePath: string, baseURL: string): Promise<void> {
  const pathOnly = routePath.split('?', 1)[0]
  try {
    await page.evaluate((path) => {
      const app = document.querySelector('#app') as any
      const router = app?.__vue_app__?.config?.globalProperties?.$router
      if (!router) {
        throw new Error('vue-router not ready')
      }
      return router.push(path)
    }, routePath)
  } catch {
    await page.goto(`${baseURL}/#${routePath}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(200)
    return
  }

  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    const hash = await page.evaluate(() => window.location.hash || '')
    const normalized = hash.startsWith('#') ? hash.slice(1) : hash
    if (normalized === routePath || normalized.startsWith(`${pathOnly}?`) || normalized.startsWith(pathOnly)) {
      // Exact leaf match: avoid `/dashboard/query` matching while on `/dashboard/query-foo`
      const after = normalized.slice(pathOnly.length)
      if (after === '' || after.startsWith('?') || after.startsWith('/')) {
        await page.waitForTimeout(50)
        return
      }
    }
    await page.waitForTimeout(POLL_MS)
  }

  // Last resort hard navigation if hash never matched.
  await page.goto(`${baseURL}/#${routePath}`, { waitUntil: 'domcontentloaded' })
}

export async function waitForVueRouter(page: Page, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await page.evaluate(() => {
      const app = document.querySelector('#app') as any
      return !!app?.__vue_app__?.config?.globalProperties?.$router
    })
    if (ok) return
    await page.waitForTimeout(POLL_MS)
  }
  throw new Error('Vue router not available')
}

export async function bootApp(page: Page, baseURL: string): Promise<void> {
  await page.goto(`${baseURL}/#/dashboard/query`, { waitUntil: 'domcontentloaded' })
  await waitForVueRouter(page)
}
