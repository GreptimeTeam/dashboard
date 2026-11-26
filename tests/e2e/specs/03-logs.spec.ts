import { expect, test } from '../fixtures'
import { EXPECT } from '../data/dataset'
import { SEED_START, timeRangeQuery } from '../env'
import { logsUrl, sqlRecords, visit, waitSql } from '../helpers'

const LOGS_SELECT = /^\s*SELECT \* FROM .*opentelemetry_logs/i

async function loggedRows(app: Parameters<typeof waitSql>[0], url: string) {
  const response = waitSql(app, LOGS_SELECT)
  await visit(app, url)
  return (await sqlRecords(await response)).rows
}

test.describe('logs query', () => {
  test('lists every row in the grid', { tag: '@smoke' }, async ({ app }) => {
    expect(await loggedRows(app, logsUrl())).toHaveLength(EXPECT.logs.total)
    await expect(app.locator('.vxe-body--row').first()).toContainText('e2e-log-')
  })

  test('severity and service filters combine', async ({ app }) => {
    const rows = await loggedRows(
      app,
      logsUrl({
        conditions: [
          { field: 'severity_text', operator: '=', value: 'WARN' },
          { field: 'service_name', operator: '=', value: 'svc-b' },
        ],
      })
    )
    // WARN is i % 5 == 3; svc-b is odd i. Odd i with i % 5 == 3: 3, 13, ..., 53 => 6 rows.
    expect(rows).toHaveLength(6)
  })

  // The builder wraps LIKE values in %...% itself.
  test('LIKE filter on the message', async ({ app }) => {
    const rows = await loggedRows(
      app,
      logsUrl({ conditions: [{ field: 'message', operator: 'LIKE', value: 'e2e-log-0' }] })
    )
    expect(rows).toHaveLength(10)
  })

  test('absolute window keeps only the first half hour', async ({ app }) => {
    const rows = await loggedRows(app, logsUrl({ timeQuery: timeRangeQuery(SEED_START, SEED_START + 1799) }))
    expect(rows).toHaveLength(30)
  })
})
