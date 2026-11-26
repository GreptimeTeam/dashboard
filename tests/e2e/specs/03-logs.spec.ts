import { expect, test } from '../fixtures'
import { EXPECT } from '../data/dataset'
import { SEED_START, timeRangeQuery, utcTimestamp } from '../env'
import { logsUrl, visit, waitSql } from '../helpers'
import { dbTotal, expectPageShown, expectPageTotal } from '../oracle'

const LOGS_SELECT = /^\s*SELECT \* FROM .*opentelemetry_logs/i

/**
 * Navigates and waits for the page's own query.
 *
 * The response is a synchronisation point only: every expectation below is either what the page
 * reports to the user, or what the database really holds. Restyling the generated SQL must not
 * fail these tests; rendering the wrong rows must.
 */
async function openLogs(app: Parameters<typeof visit>[0], url: string) {
  const response = waitSql(app, LOGS_SELECT)
  await visit(app, url)
  await response
}

test.describe('logs query', () => {
  test('lists every row in the grid', { tag: '@smoke' }, async ({ app }) => {
    await openLogs(app, logsUrl())
    await expectPageTotal(app, await dbTotal())
    await expect(app.locator('.vxe-body--row').first()).toContainText('e2e-log-')
  })

  test('severity and service filters combine', async ({ app }) => {
    const condition = `"severity_text" = 'WARN' AND "service_name" = 'svc-b'`
    const expected = await dbTotal(condition)
    await openLogs(
      app,
      logsUrl({
        conditions: [
          { field: 'severity_text', operator: '=', value: 'WARN' },
          { field: 'service_name', operator: '=', value: 'svc-b' },
        ],
      })
    )
    // WARN is i % 5 == 3; svc-b is odd i. Odd i with i % 5 == 3: 3, 13, ..., 53 => 6 rows.
    expect(expected).toBe(6)
    await expectPageTotal(app, expected)
    await expect(app.locator('.vxe-body--row')).toHaveCount(expected)
  })

  // The builder wraps LIKE values in %...% itself.
  test('LIKE filter on the message', async ({ app }) => {
    const expected = await dbTotal(`"message" LIKE '%e2e-log-0%'`)
    await openLogs(app, logsUrl({ conditions: [{ field: 'message', operator: 'LIKE', value: 'e2e-log-0' }] }))
    await expectPageTotal(app, expected)
    await expect(app.locator('.vxe-body--row')).toHaveCount(expected)
  })

  test('absolute window keeps only the first half hour', async ({ app }) => {
    const end = SEED_START + 1799
    const expected = await dbTotal(
      `"timestamp" >= '${utcTimestamp(SEED_START)}' AND "timestamp" <= '${utcTimestamp(end)}'`
    )
    await openLogs(app, logsUrl({ timeQuery: timeRangeQuery(SEED_START, end) }))
    await expectPageTotal(app, expected)
  })

  test('empty window reports zero rows instead of spinning forever', async ({ app }) => {
    await openLogs(app, logsUrl({ timeQuery: timeRangeQuery(1_600_000_000, 1_600_003_600) }))
    await expectPageTotal(app, 0)
    await expect(app.locator('.vxe-body--row')).toHaveCount(0)
  })

  test('the result header honours the query limit', async ({ app }) => {
    await openLogs(app, logsUrl({ limit: 10 }))
    await expectPageShown(app, 10)
  })

  test('renders quotes, angle brackets and emoji literally', async ({ app }) => {
    await openLogs(app, logsUrl())
    // Row 0 is the newest seed row (DESC by timestamp) and carries the tricky message: an
    // unescaped render turns `<b>x</b>` into bold text (or drops the row) and fails here.
    await expect(app.locator('.vxe-body--row').first()).toContainText(EXPECT.logs.tricky)
  })
})
