import { expect, test } from '../fixtures'
import { EXPECT } from '../data/dataset'
import { sqlRecords, tracesUrl, visit, waitSql } from '../helpers'

const SPANS_SELECT = /^\s*SELECT \* FROM .*web_trace_demo/i

async function spanRows(app: Parameters<typeof waitSql>[0], url: string) {
  const response = waitSql(app, SPANS_SELECT)
  await visit(app, url)
  return (await sqlRecords(await response)).rows
}

test.describe('traces query', () => {
  test('lists root spans by default', { tag: '@smoke' }, async ({ app }) => {
    expect(await spanRows(app, tracesUrl())).toHaveLength(EXPECT.traces.roots)
    await expect(app.locator('.vxe-body--row').first()).toBeVisible()
  })

  test('service filter', async ({ app }) => {
    const rows = await spanRows(
      app,
      tracesUrl({ conditions: [{ field: 'service_name', operator: '=', value: 'e2e-db' }] })
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
})
