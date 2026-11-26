/**
 * Explore / Drilldown, Traces signal, on OpenTelemetry-schema spans (`opentelemetry_traces_v2`).
 *
 * Existing data, absolute window (TRACES_WINDOW_*). Numbers come from `traceFacts()`; the whole
 * file skips when the window holds no spans.
 */
import { expect, test } from '../fixtures'
import { TRACES_LOGS_TABLE, TRACES_QUERY, TRACES_TABLE, TRACES_WINDOW_END, TRACES_WINDOW_START } from '../env'
import { requireTraceFacts } from '../facts'
import { sqlRecords, visit, waitSql } from '../helpers'
import { expectChartDrawn } from '../oracle'

/** GreptimeDB statements are multi-line; treat every space of the source as `\\s+`. */
const sql = (source: string) => new RegExp(source.replace(/ /g, '\\s+'))

const exploreUrl = (extra = '') =>
  `/dashboard/explore?signal=traces&tracesTable=${TRACES_TABLE}&${TRACES_QUERY}${extra}`

/** Statements of the traces overview carry the absolute window as FROM_UNIXTIME bounds. */
const WINDOW = `FROM "${TRACES_TABLE}" WHERE "timestamp" >= FROM_UNIXTIME\\(${TRACES_WINDOW_START}\\) AND "timestamp" <= FROM_UNIXTIME\\(${TRACES_WINDOW_END}\\)`
const ROOT_LIST = sql(`^\\s*SELECT \\* ${WINDOW} AND "parent_span_id" IS NULL`)
const RATE_ROOT = sql(`COUNT\\(\\*\\) \\* 1\\.0 / \\d+ AS metric_value ${WINDOW} AND "parent_span_id" IS NULL`)
const RATE_ANY = sql(`^(?![\\s\\S]*parent_span_id)[\\s\\S]*COUNT\\(\\*\\) \\* 1\\.0 / \\d+ AS metric_value ${WINDOW}`)
const ERRORS = sql(`STATUS_CODE_ERROR[\\s\\S]*AS metric_value ${WINDOW}`)
const DURATION = sql(`CASE WHEN "duration_nano" <[\\s\\S]*${WINDOW}`)

const requireFacts = () => requireTraceFacts(`no spans in ${TRACES_TABLE} for the trace window`)

/** Opens the measured trace through the TID box and waits for its timeline. */
async function openMeasuredTrace(page: Parameters<typeof visit>[0], id: string, spans: number) {
  await visit(page, exploreUrl())
  const input = page.locator('.trace-id-input input')
  await input.fill(id)
  await input.press('Enter')
  await expect(page.locator('.trace-gantt-view .trace-summary')).toContainText(`${spans} spans`)
}

test.describe('explore traces (opentelemetry_traces_v2)', () => {
  test('overview lists root spans, draws the RED charts and selects one', async ({ explore }) => {
    const facts = requireFacts()
    const list = waitSql(explore, ROOT_LIST, 25_000)
    const rate = waitSql(explore, RATE_ROOT, 25_000)
    const errors = waitSql(explore, ERRORS, 25_000)
    const duration = waitSql(explore, DURATION, 25_000)
    await visit(explore, exploreUrl())

    // The overview fetches the newest 100 root spans.
    expect((await sqlRecords(await list)).rows).toHaveLength(Math.min(facts.roots, 100))
    ;(await Promise.all([rate, errors, duration])).forEach((response) => expect(response.status()).toBe(200))

    await expect(explore.locator('.red-chart-panel')).toHaveCount(3)
    await expect(explore.locator('.red-chart-panel-title')).toHaveText(['Rate', 'Errors', 'Duration'])
    await expect(explore.locator('.red-chart-panel.selected .red-chart-panel-title')).toHaveText('Rate')

    // Selecting another chart updates the selection and the URL.
    await explore.locator('.red-chart-panel', { hasText: 'Errors' }).click()
    await expect(explore.locator('.red-chart-panel.selected .red-chart-panel-title')).toHaveText('Errors')
    await expect.poll(() => explore.evaluate(() => window.location.hash)).toContain('redMetric=errors')
  })

  test('span scope toggle widens the queries to all spans', async ({ explore }) => {
    requireFacts()
    const rootRate = waitSql(explore, RATE_ROOT, 25_000)
    await visit(explore, exploreUrl())
    await rootRate
    await expect(explore.locator('.span-scope-toggle .arco-radio-checked')).toHaveText('Root spans')

    const allRate = waitSql(explore, RATE_ANY, 25_000)
    await explore.locator('.span-scope-toggle').getByText('All spans').click()
    expect((await allRate).status()).toBe(200)
    await expect(explore.locator('.span-scope-toggle .arco-radio-checked')).toHaveText('All spans')
    // The widened query must still be drawn: toggling the scope must not blank the charts.
    await expectChartDrawn(explore, '.red-chart-panel')
    await expect.poll(() => explore.evaluate(() => window.location.hash)).toContain('spanScope=all')
  })

  test('Traces tab lists traces and opens one', async ({ explore }) => {
    const facts = requireFacts()
    await visit(explore, exploreUrl('&tracesTab=traces'))
    const links = explore.locator('.trace-id-link')
    await expect(links.first()).toBeVisible({ timeout: 20_000 })
    expect(await links.count()).toBeGreaterThan(0)
    expect(await links.count()).toBeLessThanOrEqual(Math.min(facts.roots, 100))

    const traceId = (await links.first().innerText()).trim()
    await links.first().click()
    await expect(explore.locator('.trace-gantt-view .trace-summary')).toContainText(/[1-9]\d* spans/)
    await expect(explore.locator('.arco-drawer:visible').getByText(traceId).first()).toBeVisible()
    await expect.poll(() => explore.evaluate(() => window.location.hash)).toContain(`focusTraceId=${traceId}`)
  })

  test('view logs on a span opens the logs of the trace', async ({ explore }) => {
    const facts = requireFacts()
    test.skip(facts.logs === 0, `no ${TRACES_LOGS_TABLE} rows carry the measured trace id`)
    await openMeasuredTrace(explore, facts.id, facts.spans)
    await explore.locator('.trace-gantt-view .span-item').first().click()

    const logsSql = sql(`FROM "public"\\."${TRACES_LOGS_TABLE}" WHERE "trace_id" = '${facts.id}'`)
    const response = waitSql(explore, logsSql, 25_000)
    await explore.locator('.panel-view-logs').click()
    expect((await sqlRecords(await response)).rows).toHaveLength(facts.logs)
    await expect(explore.locator('.arco-drawer:visible').getByText(`${facts.logs} logs`)).toBeVisible()
    await expect.poll(() => explore.evaluate(() => window.location.hash)).toContain(`logsTraceId=${facts.id}`)
  })

  test('service map shows the services of the trace', async ({ explore }) => {
    const facts = requireFacts()
    await visit(explore, exploreUrl('&view=service-map'))
    const counts = explore.locator('.service-map-counts')
    await expect(counts).toContainText(/[1-9]\d* nodes/, { timeout: 25_000 })
    await expect(counts).toContainText(/[1-9]\d* calls/)
    const map = explore.locator('.service-map')
    await Promise.all(facts.services.map((service) => expect(map).toContainText(service)))
  })
})
