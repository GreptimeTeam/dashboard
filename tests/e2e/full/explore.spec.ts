/**
 * Explore / Drilldown on the seeded database (deterministic) plus the existing database inside the
 * absolute 9.18–9.20 window (structure only). Traces live in `explore-traces.spec.ts`.
 */
import { expect, test } from '../fixtures'
import { EXPLORE_DB, SEED_QUERY, WINDOW_END, WINDOW_QUERY, WINDOW_START } from '../env'
import { EXPECT } from '../data/dataset'
import { promSeries, sqlRecords, visit, waitProm, waitSql } from '../helpers'

/** Statements are multi-line; treat every space of the source as `\s+`. */
const sql = (source: string) => new RegExp(source.replace(/ /g, '\\s+'))

const metricsUrl = (extra = '') => `/dashboard/explore?signal=metrics&${SEED_QUERY}${extra}`
const logsUrl = (extra = '') => `/dashboard/explore?signal=logs&logsTable=opentelemetry_logs&${SEED_QUERY}${extra}`
const filtersParam = (filters: { key: string; op: string; value: string }[]) =>
  `&filters=${encodeURIComponent(JSON.stringify(filters))}`
const hash = (page: Parameters<typeof visit>[0]) => page.evaluate(() => window.location.hash)

test.describe('explore metrics (seeded)', () => {
  test('catalog lists the seeded metrics with their kinds and default queries', async ({ app }) => {
    const gauge = waitProm(app, 'avg(e2e_cpu_usage)')
    const counter = waitProm(app, 'sum(rate(e2e_http_requests_total')
    await visit(app, metricsUrl())

    const cards = app.locator('.metric-catalog-card')
    await expect(cards).toHaveCount(2)
    await expect(cards.nth(0)).toContainText('e2e_cpu_usage')
    await expect(cards.nth(0)).toContainText('Gauge')
    await expect(cards.nth(1)).toContainText('e2e_http_requests_total')
    await expect(cards.nth(1)).toContainText('Counter')
    await expect(app.locator('.gpt-table-sidebar-header__meta')).toHaveText('2 metrics')

    // Each sparkline aggregates the metric into a single series over the absolute window.
    expect(await promSeries(await gauge)).toHaveLength(1)
    expect(await promSeries(await counter)).toHaveLength(1)
  })

  test('name search narrows the catalog and clearing restores it', async ({ app }) => {
    await visit(app, metricsUrl())
    await expect(app.locator('.metric-catalog-card')).toHaveCount(2)

    const search = app.locator('.search-input input')
    await search.fill('cpu')
    await expect(app.locator('.metric-catalog-card')).toHaveCount(1)
    await expect(app.locator('.metric-catalog-card')).toContainText('e2e_cpu_usage')
    await expect(app.locator('.gpt-table-sidebar-header__meta')).toHaveText('1/2')

    await search.fill('')
    await expect(app.locator('.metric-catalog-card')).toHaveCount(2)
  })

  test('suffix filter from the URL keeps only matching metrics', async ({ app }) => {
    await visit(app, metricsUrl('&suffixes=total'))
    await expect(app.locator('.metric-catalog-card')).toHaveCount(1)
    await expect(app.locator('.metric-catalog-card')).toContainText('e2e_http_requests_total')
    await expect(app.locator('.gpt-table-sidebar-header__meta')).toHaveText('1/2')
  })

  test('prefix tree shows the shared prefix and its metric count', async ({ app }) => {
    await visit(app, metricsUrl())
    await expect(app.locator('.sidebar-tree')).toContainText('e2e(2)')
  })

  test('selecting a metric opens its detail with a breakdown per label value', async ({ app }) => {
    await visit(app, metricsUrl())
    const card = app.locator('.metric-catalog-card', { hasText: 'e2e_http_requests_total' })
    await expect(card).toBeVisible()

    const byInstance = waitProm(app, 'by (instance)')
    await card.getByRole('button', { name: 'Select' }).click()
    expect(await promSeries(await byInstance)).toHaveLength(EXPECT.requests.series)

    await expect.poll(() => hash(app)).toContain('metric=e2e_http_requests_total')
    await expect(app.locator('.metric-detail')).toContainText('instance')
    await expect(app.locator('.metric-detail')).toContainText(`${EXPECT.requests.series} values`)
    await expect(app.locator('.drilldown-drawer__breadcrumb').first()).toContainText('e2e_http_requests_total')
  })

  test('metric deep link breaks the gauge down by instance', async ({ app }) => {
    const byInstance = waitProm(app, 'avg(e2e_cpu_usage) by (instance)')
    await visit(app, metricsUrl('&metric=e2e_cpu_usage'))
    expect(await promSeries(await byInstance)).toHaveLength(EXPECT.cpu.series)
    await expect(app.locator('.metric-detail')).toContainText(`${EXPECT.cpu.series} values`)
    await Promise.all(
      ['e2e-host-0', 'e2e-host-1', 'e2e-host-2'].map((host) =>
        expect(app.locator('.metric-detail')).toContainText(host)
      )
    )
  })

  test('query results tab lists the aggregated points', async ({ app }) => {
    await visit(app, metricsUrl('&metric=e2e_cpu_usage'))
    await app.locator('.metric-detail-tabs .arco-tabs-tab', { hasText: 'Query results' }).click()
    await expect(app.locator('.metric-detail .vxe-body--row').first()).toBeVisible()
  })

  test('breadcrumb returns from the detail to the catalog', async ({ app }) => {
    await visit(app, metricsUrl('&metric=e2e_cpu_usage'))
    await expect(app.locator('.metric-detail')).toBeVisible()
    await app.locator('.drilldown-drawer__crumb-link', { hasText: 'Overview' }).click()
    await expect(app.locator('.metric-catalog-card')).toHaveCount(2)
    await expect.poll(() => hash(app)).not.toContain('metric=')
  })
})

test.describe('explore logs (seeded)', () => {
  test('overview groups logs by service with exact counts', async ({ app }) => {
    const grouped = waitSql(app, sql('"service_name" AS value, COUNT\\(\\*\\) AS cnt'))
    await visit(app, logsUrl())
    // Both services have the same count, so the server order is not defined: compare sorted.
    const groupedRows = (await sqlRecords(await grouped)).rows
    expect([...groupedRows].sort((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual([
      ['svc-a', EXPECT.logs.svcA],
      ['svc-b', EXPECT.logs.svcB],
    ])

    const panels = app.locator('.label-value-panel')
    await expect(panels).toHaveCount(2)
    await expect(panels.filter({ hasText: 'service_name="svc-a"' })).toContainText(`${EXPECT.logs.svcA} logs`)
    await expect(panels.filter({ hasText: 'service_name="svc-b"' })).toContainText(`${EXPECT.logs.svcB} logs`)
  })

  test('"Query logs" on a label value opens the filtered detail', async ({ app }) => {
    await visit(app, logsUrl())
    const panel = app.locator('.label-value-panel', { hasText: 'service_name="svc-b"' })
    await expect(panel).toBeVisible()

    const detail = waitSql(
      app,
      sql('^\\s*SELECT [\\s\\S]*FROM "opentelemetry_logs" WHERE [\\s\\S]*"service_name" = \'svc-b\'')
    )
    await panel.getByRole('button', { name: 'Query logs' }).click()
    expect((await sqlRecords(await detail)).rows).toHaveLength(EXPECT.logs.svcB)
    await expect.poll(() => hash(app)).toContain('logsView=detail')
    await expect(app.locator('.logs-main-view .results-count')).toContainText(`${EXPECT.logs.svcB}`)
  })

  test('detail lists every row and the volume chart splits them by level', async ({ app }) => {
    const rows = waitSql(
      app,
      sql('^\\s*SELECT [\\s\\S]*FROM "opentelemetry_logs" WHERE [\\s\\S]*ORDER BY "timestamp" DESC LIMIT 1000')
    )
    const volume = waitSql(app, sql('"severity_text" AS log_level, COUNT\\(\\*\\) AS event_count'))
    await visit(app, logsUrl('&logsView=detail'))

    expect((await sqlRecords(await rows)).rows).toHaveLength(EXPECT.logs.total)
    const { columns, rows: buckets } = await sqlRecords(await volume)
    const level = columns.indexOf('log_level')
    const count = columns.indexOf('event_count')
    const perLevel: Record<string, number> = {}
    buckets.forEach((row) => {
      perLevel[String(row[level])] = (perLevel[String(row[level])] ?? 0) + Number(row[count])
    })
    expect(perLevel).toEqual({ INFO: EXPECT.logs.info, WARN: EXPECT.logs.warn, ERROR: EXPECT.logs.error })
  })

  test('service filter from the URL narrows the detail', async ({ app }) => {
    const rows = waitSql(
      app,
      sql('^\\s*SELECT [\\s\\S]*FROM "opentelemetry_logs" WHERE [\\s\\S]*"service_name" = \'svc-a\'')
    )
    await visit(app, logsUrl(`&logsView=detail${filtersParam([{ key: 'service_name', op: '=', value: 'svc-a' }])}`))
    expect((await sqlRecords(await rows)).rows).toHaveLength(EXPECT.logs.svcA)
    await expect(app.locator('.logs-main-view .results-count')).toContainText(`${EXPECT.logs.svcA}`)
  })

  test('level filter keeps only the chosen severity', async ({ app }) => {
    await visit(app, logsUrl('&logsView=detail'))
    await expect(app.locator('.logs-main-view .results-count')).toContainText(`${EXPECT.logs.total}`)

    // Picking a level re-runs the detail query immediately (no "Query" click needed).
    const narrowed = waitSql(app, sql('^\\s*SELECT [\\s\\S]*"severity_text" = \'ERROR\''))
    await app.locator('.level-filter-select').click()
    await app.locator('.arco-select-option', { hasText: /^ERROR$/ }).click()
    expect((await sqlRecords(await narrowed)).rows).toHaveLength(EXPECT.logs.error)
    await expect(app.locator('.logs-main-view .results-count')).toContainText(`${EXPECT.logs.error}`)
  })

  test('labels tab shows a volume card per label', async ({ app }) => {
    await visit(app, logsUrl('&logsView=detail&logsTab=labels'))
    const titles = app.locator('.detail-labels .column-card .drilldown-card__title')
    await expect(titles.first()).toBeVisible()
    await expect(app.locator('.detail-labels')).toContainText('service_name')
    await expect(app.locator('.detail-labels')).toContainText('severity_text')
  })
})

test.describe('explore logs (existing data, absolute 9.18–9.20 window)', () => {
  test.skip(process.env.E2E_EXPLORE_READY !== '1', 'no logs in the explore window of EXPLORE_DB')

  const existingUrl = (extra = '') =>
    `/dashboard/explore?signal=logs&logsTable=opentelemetry_logs&${WINDOW_QUERY}${extra}`
  const inWindow = `FROM "opentelemetry_logs" WHERE [\\s\\S]*FROM_UNIXTIME\\(${WINDOW_START}\\)[\\s\\S]*FROM_UNIXTIME\\(${WINDOW_END}\\)`

  test('overview groups the window by a label', async ({ explore }) => {
    const grouped = waitSql(explore, sql(`COUNT\\(\\*\\) AS cnt ${inWindow}`), 30_000)
    await visit(explore, existingUrl())
    const { rows } = await sqlRecords(await grouped)
    expect(rows.length).toBeGreaterThan(0)
    await expect(explore.locator('.label-value-panel').first()).toBeVisible({ timeout: 30_000 })
  })

  test('detail lists rows and carries the window', async ({ explore }) => {
    const detail = waitSql(explore, sql(`^\\s*SELECT [\\s\\S]*${inWindow}[\\s\\S]*LIMIT 1000`), 30_000)
    await visit(explore, existingUrl('&logsView=detail'))
    const { rows } = await sqlRecords(await detail)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(1000)
    await expect(explore.locator('.logs-main-view .vxe-body--row').first()).toBeVisible()
    expect(EXPLORE_DB).toBe('public')
  })
})
