import { expect, test } from '../fixtures'
import { EXPECT } from '../data/dataset'
import { tracesUrl, visit, waitSql } from '../helpers'

const SPANS_SELECT = /^\s*SELECT \* FROM .*web_trace_demo/i

/** Navigates and waits for the page's query; the response itself is not asserted on. */
async function openTraces(app: Parameters<typeof waitSql>[0], url: string) {
  const response = waitSql(app, SPANS_SELECT)
  await visit(app, url)
  await response
}

test.describe('traces query', () => {
  test('lists root spans by default', { tag: '@smoke' }, async ({ app }) => {
    await openTraces(app, tracesUrl())
    // The grid renders ~13 rows per screen; the seed has 10, so the count is exact here.
    await expect(app.locator('.vxe-body--row')).toHaveCount(EXPECT.traces.roots)
    await expect(app.locator('.vxe-body--row').first()).toContainText('e2e-trace-')
  })

  test('service filter', async ({ app }) => {
    await openTraces(app, tracesUrl({ conditions: [{ field: 'service_name', operator: '=', value: 'e2e-db' }] }))
    await expect(app.locator('.vxe-body--row')).toHaveCount(EXPECT.traces.traces)
  })

  test('duration filter keeps only slow root spans', async ({ app }) => {
    // Root durations are 10ms..100ms in 10ms steps; > 50ms leaves 60..100ms.
    await openTraces(
      app,
      tracesUrl({
        conditions: [
          { field: 'parent_span_id', operator: 'Not Exist', value: '' },
          { field: 'duration_ns', operator: '>', value: '50000000' },
        ],
      })
    )
    await expect(app.locator('.vxe-body--row')).toHaveCount(EXPECT.traces.slowRoots)
  })
})
