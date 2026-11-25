/**
 * @smoke — one deep link per page, one event-driven assertion each.
 * Goal: the whole file finishes in seconds on a warm session (`pnpm e2e:smoke`).
 */
import { expect, test } from './fixtures'
import { E2E_DASHBOARD, E2E_DB, E2E_FLOW, E2E_PIPELINE, SEED_QUERY, SEED_START } from './env'
import { EXPECT } from './data/dataset'
import { logsUrl, metricsUrl, promSeries, queryUrl, sqlRecords, tracesUrl, visit, waitProm, waitSql } from './helpers'
import { dbHttpBase, runSql, authFromEnv } from './data/sql'

const rows = (page: import('@playwright/test').Page) => page.locator('.vxe-body--row')

test.describe('@smoke', () => {
  test('query: SQL deep link runs and renders', async ({ app }) => {
    const response = waitSql(app, /count\(\*\) AS n FROM opentelemetry_logs/i)
    await visit(app, queryUrl('SELECT count(*) AS n FROM opentelemetry_logs'))
    const { rows: result } = await sqlRecords(await response)
    expect(result).toEqual([[EXPECT.logs.total]])
    // The Query page is keep-alive and accumulates results: locate by content, never by position.
    await expect(
      rows(app)
        .filter({ hasText: new RegExp(`^\\s*${EXPECT.logs.total}\\s*$`) })
        .first()
    ).toBeVisible()
  })

  test('metrics: PromQL deep link draws all series', async ({ app }) => {
    const response = waitProm(app, 'e2e_cpu_usage')
    await visit(app, metricsUrl('e2e_cpu_usage'))
    expect(await promSeries(await response)).toHaveLength(EXPECT.cpu.series)
    await expect(app.locator('canvas').first()).toBeVisible()
  })

  test('logs: builder deep link lists every row', async ({ app }) => {
    const response = waitSql(app, /^\s*SELECT \* FROM .*opentelemetry_logs/i)
    await visit(app, logsUrl())
    expect((await sqlRecords(await response)).rows).toHaveLength(EXPECT.logs.total)
    await expect(rows(app).first()).toBeVisible()
  })

  test('traces: builder deep link lists root spans', async ({ app }) => {
    const response = waitSql(app, /^\s*SELECT \* FROM .*web_trace_demo/i)
    await visit(app, tracesUrl())
    expect((await sqlRecords(await response)).rows).toHaveLength(EXPECT.traces.roots)
    await expect(rows(app).first()).toBeVisible()
  })

  test('pipelines: seeded pipeline is listed', async ({ app }) => {
    await visit(app, '/dashboard/logs-pipelines')
    await expect(app.getByText(E2E_PIPELINE).first()).toBeVisible()
  })

  test('ingest: Influx line written from the UI is readable back', async ({ app }) => {
    await visit(app, '/dashboard/ingest/influxdb-line-protocol/input')
    // Fixed timestamp => the row is overwritten, never duplicated, across runs.
    const line = `e2e_ingest,host=ui usage=9.87 ${SEED_START}000000000`
    const editor = app.locator('.cm-content').first()
    await editor.click()
    await app.keyboard.press('ControlOrMeta+A')
    await app.keyboard.insertText(line)

    const written = app.waitForResponse(
      (r) => r.url().includes('/v1/influxdb/write') && r.request().method() === 'POST'
    )
    await app
      .getByRole('button', { name: /Write|写入/i })
      .first()
      .click()
    expect([200, 204]).toContain((await written).status())

    const result: any = await runSql(`SELECT usage FROM e2e_ingest WHERE host = 'ui'`, {
      baseUrl: dbHttpBase(),
      database: E2E_DB,
      ...authFromEnv(),
    })
    expect(result.output[0].records.rows).toEqual([[9.87]])
  })

  test('flow: seeded flow is listed', async ({ app }) => {
    test.skip(process.env.E2E_FLOW_READY !== '1', 'CREATE FLOW unavailable on this GreptimeDB')
    await visit(app, '/dashboard/flow')
    // the shared DB may hold many flows (paginated) — narrow the list first
    await app.locator('.flow-filter-search input').fill(E2E_FLOW)
    await expect(app.locator('.vxe-body--row', { hasText: E2E_FLOW })).toHaveCount(1)
  })

  test('explore: metric catalog lists the seeded metrics', async ({ app }) => {
    await visit(app, `/dashboard/explore?signal=metrics&${SEED_QUERY}`)
    await expect(app.locator('.metric-catalog-card')).toHaveCount(2)
    await expect(app.locator('.gpt-table-sidebar-header__meta')).toHaveText('2 metrics')
  })

  test('perses: seeded dashboard opens', async ({ app }) => {
    await visit(app, `/dashboard/perses?dashboard=${encodeURIComponent(E2E_DASHBOARD)}`)
    await expect(app.getByText(E2E_DASHBOARD).first()).toBeVisible()
  })
})
