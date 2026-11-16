import { expect, test } from '@playwright/test'

/**
 * Rendering-performance guards for `DataGrid` (the unified vxe grid).
 *
 * Two kinds of assertions, deliberately separated:
 *
 * 1. **Deterministic** (always enforced): how many cells actually reach the DOM.
 *    This is the root cause of "wide tables feel slow" — without column
 *    virtualization an 80-column trace table renders 20 × 80 = 1600 cells per
 *    result set.
 * 2. **Timing** (coarse budgets): wide enough to survive CI variance, tight
 *    enough to catch a real regression (the pre-fix numbers were ~680ms at 80
 *    columns and ~1s at 120).
 *
 * Everything is logged so a failing run shows the actual numbers.
 */

type Measure = { mountMs: number; reloadMs: number; cells: number; headerCols: number }

async function measure(page: import('@playwright/test').Page, cols: number): Promise<Measure> {
  await page.goto(`/perf.html?rows=20&cols=${cols}&pageSize=20`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => (window as unknown as { __perfReady?: boolean }).__perfReady === true, null, {
    timeout: 60_000,
  })

  return page.evaluate(() => {
    const perf = (
      window as unknown as {
        __perf: {
          mountMs: number
          reload: (n: number) => Promise<number>
          cells: () => { rows: number; cols: number; cells: number }
        }
      }
    ).__perf
    return (async () => {
      const { mountMs } = perf
      const before = perf.cells()
      const reloadMs = await perf.reload(20)
      const after = perf.cells()
      return { mountMs, reloadMs, cells: after.cells, headerCols: before.cols }
    })()
  })
}

test.describe('DataGrid render performance', () => {
  test('40 columns: stays under budget and virtualizes columns', async ({ page }) => {
    const m = await measure(page, 40)
    test.info().annotations.push({ type: 'perf', description: JSON.stringify(m) })
    console.log('[perf] 40 cols', m)

    // Virtualization must cap the DOM well below rows × columns (20 × 40 = 800).
    expect(m.cells).toBeLessThan(700)
    expect(m.reloadMs).toBeLessThan(500)
  })

  test('120 columns: column virtualization keeps the DOM flat', async ({ page }) => {
    const m = await measure(page, 120)
    test.info().annotations.push({ type: 'perf', description: JSON.stringify(m) })
    console.log('[perf] 120 cols', m)

    // The whole point: 3× the columns must not mean 3× the cells.
    // Without virtual-x this was 2400 cells; with it, the DOM stays ~480.
    expect(m.cells).toBeLessThan(900)
    // Pre-fix reload for this width was ~1s.
    expect(m.reloadMs).toBeLessThan(600)
  })

  test('header and body columns stay pixel-aligned while paging', async ({ page }) => {
    await page.goto('/perf.html?rows=20&cols=40&pageSize=20', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => (window as unknown as { __perfReady?: boolean }).__perfReady === true, null, {
      timeout: 60_000,
    })

    const alignment = () =>
      page.evaluate(() => {
        const leftById = (selector: string) =>
          new Map(
            [...document.querySelectorAll(selector)].map((el) => [
              el.getAttribute('colid'),
              Math.round(el.getBoundingClientRect().left),
            ])
          )
        const header = leftById('.vxe-header--column')
        const bodyRow = document.querySelector('.vxe-body--row')
        const body = new Map(
          [...(bodyRow?.querySelectorAll('.vxe-body--column') ?? [])].map((el) => [
            el.getAttribute('colid'),
            Math.round(el.getBoundingClientRect().left),
          ])
        )
        let maxAbsDiff = 0
        let matched = 0
        body.forEach((left, id) => {
          const headerLeft = header.get(id)
          if (headerLeft === undefined) return
          matched += 1
          maxAbsDiff = Math.max(maxAbsDiff, Math.abs(left - headerLeft))
        })
        return { matched, maxAbsDiff }
      })

    const before = await alignment()
    expect(before.matched).toBeGreaterThan(0)
    expect(before.maxAbsDiff).toBe(0)

    // Scroll horizontally through vxe's virtual x-handle: header must follow exactly.
    await page
      .locator('.vxe-table--scroll-x-handle')
      .first()
      .evaluate((el) => {
        el.scrollLeft = 900
      })
    await page.waitForTimeout(300)

    const after = await alignment()
    expect(after.matched).toBeGreaterThan(0)
    expect(after.maxAbsDiff).toBe(0)
  })

  test('layout is idempotent: identical data yields identical widths', async ({ page }) => {
    await page.goto('/perf.html?rows=20&cols=40&pageSize=20', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => (window as unknown as { __perfReady?: boolean }).__perfReady === true, null, {
      timeout: 60_000,
    })

    const widths = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.vxe-header--column')]
          .map((el) => `${el.getAttribute('colid')}:${Math.round(el.getBoundingClientRect().width)}`)
          .join(',')
      )

    const first = await widths()
    await page.evaluate(() =>
      (window as unknown as { __perf: { reloadSame: () => Promise<number> } }).__perf.reloadSame()
    )
    const second = await widths()

    // Widths are derived from cell text, so the same text must produce the same
    // layout — any drift here means a hidden DOM measurement crept back in.
    expect(second).toBe(first)
  })

  test('content-driven widths + full horizontal scroll range (guards silent width-rule failures)', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('403')) pageErrors.push(msg.text())
    })

    await page.goto('/perf.html?rows=20&cols=20&long=1&fill=0&leftover=proportional', {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForFunction(() => (window as unknown as { __perfReady?: boolean }).__perfReady === true, null, {
      timeout: 60_000,
    })
    await page.waitForTimeout(400)

    const metrics = await page.evaluate(() => {
      const headers = [...document.querySelectorAll('.vxe-header--column')]
      const widths = headers.map((header) => Math.round(header.getBoundingClientRect().width))
      const handle = document.querySelector('.vxe-table--scroll-x-handle')
      return {
        widths,
        sum: widths.reduce((total, width) => total + width, 0),
        range: handle ? handle.scrollWidth - handle.clientWidth : null,
        client: handle?.clientWidth ?? 0,
      }
    })
    console.log('[perf] width rules', metrics)

    // A thrown error inside the width watcher is swallowed by Vue and silently
    // degrades every column to an equal width — exactly what shipped once.
    expect(pageErrors).toEqual([])
    // The oversized first column must stand out from the rest.
    expect(Math.max(...metrics.widths) - Math.min(...metrics.widths)).toBeGreaterThan(100)
    // The table must overflow, and the horizontal scrollbar range must cover every
    // column — otherwise the rightmost column is unreachable (flow page bug).
    expect(metrics.sum).toBeGreaterThan(metrics.client)
    expect(metrics.range).toBeGreaterThan(0)
    expect(metrics.range).toBe(Math.max(0, metrics.sum - metrics.client))
  })

  async function checkBothAxes(page: import('@playwright/test').Page, wrap: boolean) {
    await page.goto(`/perf.html?rows=2000&cols=120&pagination=0&wrap=${wrap ? 1 : 0}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForFunction(() => (window as unknown as { __perfReady?: boolean }).__perfReady === true, null, {
      timeout: 120_000,
    })
    await page.waitForTimeout(400)

    const snapshot = () =>
      page.evaluate(() => {
        const rows = [...document.querySelectorAll('.vxe-body--row')]
        const header = new Map(
          [...document.querySelectorAll('.vxe-header--column')].map((el) => [
            el.getAttribute('colid'),
            Math.round(el.getBoundingClientRect().left),
          ])
        )
        let matched = 0
        let maxAbsDiff = 0
        rows[0]?.querySelectorAll('.vxe-body--column').forEach((el) => {
          const left = header.get(el.getAttribute('colid'))
          if (left === undefined) return
          matched += 1
          maxAbsDiff = Math.max(maxAbsDiff, Math.abs(Math.round(el.getBoundingClientRect().left) - left))
        })
        return {
          bodyRows: rows.length,
          bodyCells: document.querySelectorAll('.vxe-body--column').length,
          heights: [...new Set(rows.map((row) => Math.round(row.getBoundingClientRect().height)))],
          matched,
          maxAbsDiff,
        }
      })

    const label = wrap ? '2000x120 virtual + wrap' : '2000x120 virtual'
    const initial = await snapshot()
    console.log(`[perf] ${label}`, initial)

    // 2000 rows × 120 columns = 240k cells if nothing were virtualized.
    expect(initial.bodyRows).toBeLessThan(60)
    expect(initial.bodyCells).toBeLessThan(1500)
    expect(initial.maxAbsDiff).toBe(0)
    if (wrap) {
      // Variable row height must actually be in play for this case to mean anything.
      expect(initial.heights.length).toBeGreaterThan(1)
    }

    // Scrolling both axes must not desync the header or blow up the DOM.
    await page
      .locator('.vxe-table--scroll-y-handle')
      .first()
      .evaluate((el) => {
        el.scrollTop = 4000
      })
    await page.waitForTimeout(400)
    await page
      .locator('.vxe-table--scroll-x-handle')
      .first()
      .evaluate((el) => {
        el.scrollLeft = 1500
      })
    await page.waitForTimeout(400)

    const scrolled = await snapshot()
    console.log(`[perf] ${label} after scroll`, scrolled)
    expect(scrolled.maxAbsDiff).toBe(0)
    expect(scrolled.bodyCells).toBeLessThan(1500)
  }

  test('row-virtual + many columns: both axes virtualized', async ({ page }) => {
    await checkBothAxes(page, false)
  })

  test('row-virtual + wrap + many columns: horizontal virtualization still applies', async ({ page }) => {
    await checkBothAxes(page, true)
  })
})
