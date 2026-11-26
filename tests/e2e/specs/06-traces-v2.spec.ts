/**
 * Traces Query page on OpenTelemetry-schema spans (`opentelemetry_traces_v2`, existing data).
 *
 * The data is not seeded, so every number comes from `traceFacts()` (measured in global-setup).
 * When the window holds no spans the whole file skips.
 */
import { expect, test } from '../fixtures'
import { TRACES_LOGS_TABLE, TRACES_QUERY, TRACES_TABLE } from '../env'
import { requireTraceFacts } from '../facts'
import { logsUrl, sqlRecords, tracesUrl, visit, waitSql } from '../helpers'

const spansSql = new RegExp(`^\\s*SELECT \\* FROM .*${TRACES_TABLE}`, 'i')

const requireFacts = () => requireTraceFacts(`no spans in ${TRACES_TABLE} for the trace window`)

/** Builder link listing the spans of the measured trace (all of them, not only the root). */
const traceSpansUrl = (id: string) =>
  tracesUrl({
    table: TRACES_TABLE,
    timeQuery: TRACES_QUERY,
    conditions: [{ field: 'trace_id', operator: '=', value: id }],
  })

test.describe('traces query (opentelemetry_traces_v2)', () => {
  test('lists root spans of the window', async ({ explore }) => {
    const facts = requireFacts()
    const response = waitSql(explore, spansSql, 20_000)
    await visit(explore, tracesUrl({ table: TRACES_TABLE, timeQuery: TRACES_QUERY }))
    const { columns, rows } = await sqlRecords(await response)

    expect(columns).toEqual(expect.arrayContaining(['timestamp', 'trace_id', 'span_id', 'parent_span_id', 'span_name']))
    expect(rows).toHaveLength(Math.min(facts.roots, 1000))
    const parent = columns.indexOf('parent_span_id')
    expect(rows.every((row) => row[parent] === null)).toBe(true)
    await expect(explore.locator('.trace-id-link').first()).toBeVisible()
  })

  test('opens the trace timeline and shows span attributes', async ({ explore }) => {
    const facts = requireFacts()
    await visit(explore, traceSpansUrl(facts.id))
    await explore.locator('.trace-id-link').first().click()

    await expect(explore.locator('.trace-gantt-view .trace-summary')).toContainText(`${facts.spans} spans`)
    await expect(explore.locator('.trace-gantt-view .span-item')).toHaveCount(facts.spans)
    await expect(explore.locator('.arco-drawer:visible').getByText(facts.id).first()).toBeVisible()

    await explore.locator('.trace-gantt-view .span-item').nth(1).click()
    const panel = explore.locator('.span-attributes-panel')
    await expect(panel).toContainText('Span Attributes')
    // The panel header names the span's service, which must be one the trace actually has.
    const header = (await panel.locator('.summary-container').innerText()).replace(/\s+/g, ' ')
    expect(facts.services.some((service) => header.includes(`Service ${service}`))).toBe(true)
    await expect(panel).toContainText(facts.id)
  })

  test('view logs opens the logs of the trace', async ({ explore }) => {
    const facts = requireFacts()
    test.skip(facts.logs === 0, `no ${TRACES_LOGS_TABLE} rows carry the measured trace id`)
    // "View logs" needs a bound logs table, which the Logs Query page establishes.
    const bound = waitSql(explore, new RegExp(`^\\s*SELECT \\* FROM .*${TRACES_LOGS_TABLE}`, 'i'), 30_000)
    await visit(explore, logsUrl({ table: TRACES_LOGS_TABLE, timeQuery: TRACES_QUERY }))
    await bound

    await visit(explore, traceSpansUrl(facts.id))
    await explore.locator('.trace-id-link').first().click()
    await expect(explore.locator('.trace-gantt-view .span-item')).toHaveCount(facts.spans)
    await explore.locator('.trace-gantt-view .span-item').first().click()

    const logsSql = new RegExp(`FROM .*${TRACES_LOGS_TABLE}"? WHERE .*"?trace_id"? = '${facts.id}'`, 'i')
    const response = waitSql(explore, logsSql, 20_000)
    await explore.locator('.panel-view-logs').click()
    expect((await sqlRecords(await response)).rows).toHaveLength(facts.logs)
    await expect(explore.locator('.arco-drawer:visible').getByText(`${facts.logs} logs`)).toBeVisible()
  })
})
