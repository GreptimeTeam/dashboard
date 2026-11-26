/**
 * Oracles: what the assertions are allowed to look at.
 *
 * Rule of thumb for this suite — an assertion may only use:
 *   1. what the user can see (a count the page reports, a cell's text, a chart's ink), and
 *   2. what the database really holds (`dbTotal`), computed independently of the page.
 *
 * The SQL the page sends is a *synchronisation point* (`waitSql`/`waitProm`), not evidence: a
 * refactor of the query builder must not fail these tests, while a page that renders the wrong
 * rows must.
 */
import { expect, type Page } from '@playwright/test'
import { E2E_DB } from './env'
import { queryRows } from './data/sql'

/**
 * Counts reported by a results header. Handles both shapes used in the app:
 *   logs query     " (60/60 rows )"   -> shown / total
 *   drilldown logs " ( 6 rows )"      -> total only (shown = total)
 */
export async function resultCounts(page: Page, scope?: string): Promise<{ shown: number; total: number }> {
  const locator = scope ? page.locator(`${scope} .results-count`) : page.locator('.results-count')
  const text = await locator.last().innerText()
  const match = /\(\s*(\d+)(?:\s*\/\s*(\d+))?/.exec(text)
  if (!match) throw new Error(`results-count does not look like a count: ${JSON.stringify(text)}`)
  const shown = Number(match[1])
  return { shown, total: Number(match[2] ?? match[1]) }
}

/** The page must report exactly `total` rows. Polls, because the query resolves after navigation. */
export async function expectPageTotal(page: Page, total: number, scope?: string): Promise<void> {
  await expect
    .poll(() =>
      resultCounts(page, scope)
        .then((counts) => counts.total)
        .catch(() => Number.NaN)
    )
    .toBe(total)
}

/** The page must list exactly `shown` rows (useful when a LIMIT is smaller than the table). */
export async function expectPageShown(page: Page, shown: number, scope?: string): Promise<void> {
  await expect
    .poll(() =>
      resultCounts(page, scope)
        .then((counts) => counts.shown)
        .catch(() => Number.NaN)
    )
    .toBe(shown)
}

/** Rows the database really holds — the oracle the page has to agree with. */
export async function dbTotal(where = 'TRUE', table = 'opentelemetry_logs'): Promise<number> {
  const rows = await queryRows(`SELECT count(*) FROM ${table} WHERE ${where}`, E2E_DB)
  return Number((rows[0] as unknown[])[0])
}

/**
 * Pixels actually painted inside the canvases of `scope`.
 *
 * ECharts draws on a transparent canvas, so the alpha channel is a dependable "did it draw
 * anything" signal: a chart that lost its series (or never rendered) leaves only axes and grid,
 * far below `minDrawnPixels`. It does **not** count series — use the returned data for that.
 */
export async function drawnPixels(page: Page, scope: string): Promise<number> {
  return page
    .locator(`${scope} canvas`)
    .evaluateAll((canvases) =>
      canvases.reduce((sum, canvas) => {
        const element = canvas as HTMLCanvasElement
        const context = element.getContext('2d')
        if (!context || element.width === 0 || element.height === 0) return sum
        const { data } = context.getImageData(0, 0, element.width, element.height)
        let drawn = 0
        for (let index = 3; index < data.length; index += 4) if (data[index] > 0) drawn += 1
        return sum + drawn
      }, 0)
    )
    .catch(() => 0)
}

/** Fraction of the canvas area that must carry ink before we accept "the chart rendered the data". */
const MIN_INK_RATIO = 0.006

/**
 * Asserts the chart(s) inside `scope` drew more than axes and grid.
 *
 * Measured on this suite: 3 series over 60 points ≈ 33k painted pixels on a 979×496 canvas (6.9%);
 * axes + grid alone stay well under the 0.6% threshold.
 */
export async function expectChartDrawn(page: Page, scope: string, timeout = 10_000): Promise<void> {
  const area = await page
    .locator(`${scope} canvas`)
    .evaluateAll((canvases) =>
      canvases.reduce(
        (sum, canvas) => sum + (canvas as HTMLCanvasElement).width * (canvas as HTMLCanvasElement).height,
        0
      )
    )
    .catch(() => 0)
  const minimum = Math.max(1_000, Math.round(area * MIN_INK_RATIO))
  await expect
    .poll(() => drawnPixels(page, scope), { timeout, message: `${scope} canvas has no chart content` })
    .toBeGreaterThan(minimum)
}
