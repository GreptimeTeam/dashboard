import { expect, test } from '../fixtures'
import { EXPECT } from '../data/dataset'
import { SEED_START, timeRangeQuery } from '../env'
import { sqlRecords, tracesUrl, visit, waitSql } from '../helpers'

const SPANS_SELECT = /^\s*SELECT \* FROM .*web_trace_demo/i

async function spanRows(app: Parameters<typeof waitSql>[0], url: string) {
  const response = waitSql(app, SPANS_SELECT)
  await visit(app, url)
  return (await sqlRecords(await response)).rows
}

test.describe('traces query', () => {
  test('root spans only (default)', async ({ app }) => {
    expect(await spanRows(app, tracesUrl())).toHaveLength(EXPECT.traces.roots)
  })

  test('all spans when the root condition is removed', async ({ app }) => {
    expect(await spanRows(app, tracesUrl({ conditions: [] }))).toHaveLength(EXPECT.traces.spans)
  })

  test('service filter', async ({ app }) => {
    const rows = await spanRows(
      app,
      tracesUrl({ conditions: [{ field: 'service_name', operator: '=', value: 'e2e-db' }] })
    )
    expect(rows).toHaveLength(EXPECT.traces.traces)
  })

  test('span name filter', async ({ app }) => {
    const rows = await spanRows(
      app,
      tracesUrl({ conditions: [{ field: 'span_name', operator: '=', value: 'orders.query' }] })
    )
    expect(rows).toHaveLength(EXPECT.traces.traces)
  })

  test('duration filter keeps only slow root spans', async ({ app }) => {
    // Root durations are 10ms..100ms in 10ms steps; > 50ms leaves 60..100ms.
    const rows = await spanRows(
      app,
      tracesUrl({
        conditions: [
          { field: 'parent_span_id', operator: 'Not Exist', value: '' },
          { field: 'duration_ns', operator: '>', value: '50000000' },
        ],
      })
    )
    expect(rows).toHaveLength(5)
  })

  test('absolute window keeps the first five traces', async ({ app }) => {
    // Trace k starts at SEED_START + 300k, so [0, 1499] holds traces 0..4.
    const rows = await spanRows(app, tracesUrl({ timeQuery: timeRangeQuery(SEED_START, SEED_START + 1499) }))
    expect(rows).toHaveLength(5)
  })
})
