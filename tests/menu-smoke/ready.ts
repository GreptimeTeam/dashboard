import type { Page } from '@playwright/test'

const POLL_MS = 250
export const SETTLE_MS = 700
export const PAGE_TIMEOUT_MS = 30_000

const LOADING_SELECTORS = [
  '.arco-spin-loading',
  '.arco-spin-dot',
  '.arco-icon-loading',
  '.arco-spin-icon',
  "[class*='MuiSkeleton']",
  "[class*='Skeleton-root']",
]

async function frameTexts(page: Page): Promise<string> {
  const chunks: string[] = []
  for (const frame of page.frames()) {
    try {
      chunks.push(await frame.locator('body').innerText({ timeout: 800 }))
    } catch {
      /* ignore */
    }
  }
  return chunks.join('\n')
}

export async function isConnected(page: Page): Promise<boolean> {
  try {
    const text = await page.mainFrame().locator('body').innerText({ timeout: 1000 })
    return text.includes('Connected') || text.includes('已连接')
  } catch {
    return false
  }
}

export async function bodyHas(page: Page, ...needles: string[]): Promise<boolean> {
  const text = await frameTexts(page)
  return needles.some((n) => text.includes(n))
}

async function visibleCount(locator: ReturnType<Page['locator']>): Promise<number> {
  try {
    const n = await locator.count()
    let visible = 0
    for (let i = 0; i < Math.min(n, 20); i += 1) {
      try {
        if (await locator.nth(i).isVisible()) visible += 1
      } catch {
        /* ignore */
      }
    }
    return visible
  } catch {
    return 0
  }
}

export async function isLoading(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    for (const sel of LOADING_SELECTORS) {
      try {
        if ((await visibleCount(frame.locator(sel))) > 0) return true
      } catch {
        /* ignore */
      }
    }
  }
  return false
}

export async function hasVxeRows(page: Page, minRows = 1): Promise<boolean> {
  try {
    let rows = page.locator('.vxe-table--body-wrapper .vxe-body--row')
    if ((await rows.count()) < minRows) {
      rows = page.locator('.vxe-body--row')
    }
    if ((await rows.count()) < minRows) return false
    const sample = (await rows.first().innerText({ timeout: 500 })).trim()
    return Boolean(sample)
  } catch {
    return false
  }
}

export async function metricsCountVisible(page: Page): Promise<boolean> {
  const text = await frameTexts(page)
  return /[1-9]\d*\s*(个指标|metrics?)/i.test(text)
}

/** Table Query left rail finished listing tables (not stuck on spinner / 0 tables). */
export async function tablesSidebarReady(page: Page, ...tableNames: string[]): Promise<boolean> {
  const text = await frameTexts(page)
  if (/\b0\s+tables?\b/i.test(text) && !tableNames.some((n) => text.includes(n))) {
    return false
  }
  if (tableNames.length > 0 && !tableNames.some((n) => text.includes(n))) {
    return false
  }
  // Prefer concrete table names over generic "N tables" which can appear while still loading.
  return tableNames.length === 0 ? /[1-9]\d*\s+tables?\b/i.test(text) : true
}

/** Explore metric cards finished loading sparklines (no spin inside cards). */
export async function exploreCardsSettled(page: Page): Promise<boolean> {
  const cards = page.locator('.metric-catalog-card')
  const n = await cards.count()
  if (n < 1) return false
  const loadingInCards = page.locator(
    '.metric-catalog-card .arco-spin-loading, .metric-catalog-card .arco-spin-dot, .metric-catalog-card .arco-icon-loading, .metric-catalog-card .arco-spin-icon'
  )
  if ((await visibleCount(loadingInCards)) > 0) return false
  // Chart canvas, empty/error copy, or legend — any post-load state.
  const settled = page.locator(
    '.metric-catalog-card canvas, .metric-catalog-card .drilldown-query-legend, .metric-catalog-card [class*="empty"], .metric-catalog-card [class*="error"]'
  )
  return (await settled.count()) > 0 || (await bodyHas(page, 'No data', '暂无数据', 'smoke_ready_metric'))
}

/** Metrics query result pane has series (graph or table), not empty placeholder. */
export async function metricsResultReady(page: Page): Promise<boolean> {
  if (await isLoading(page)) return false
  const text = await frameTexts(page)
  const hasCanvas = (await page.locator('.metrics-result-content canvas, .result-container canvas, canvas').count()) > 0
  const hasSeriesMeta = /[1-9]\d*\s*(series|条|结果)/i.test(text)
  const hasTableRows = await hasVxeRows(page)
  if (hasCanvas || hasSeriesMeta || hasTableRows) return true
  // Still showing the empty placeholder only.
  if (/No data/i.test(text)) return false
  return false
}

export async function resultBadgeGtZero(page: Page): Promise<boolean> {
  const text = await frameTexts(page)
  return /查询结果\s*\(\s*[1-9]\d*/.test(text) || /共\s*[1-9]\d*\s*条/.test(text) || /\(\s*[1-9]\d*\s*\)/.test(text)
}

export async function waitUntil(
  page: Page,
  check: () => Promise<boolean>,
  timeoutMs = PAGE_TIMEOUT_MS
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  let stableSince: number | null = null
  while (Date.now() < deadline) {
    if (await check()) {
      const now = Date.now()
      if (stableSince == null) stableSince = now
      else if (now - stableSince >= SETTLE_MS) return true
    } else {
      stableSince = null
    }
    await page.waitForTimeout(POLL_MS)
  }
  return check()
}
