import { expect, test } from '../fixtures'
import { EXPECT } from '../data/dataset'
import { queryUrl, sqlRecords, visit, waitSql } from '../helpers'

test.describe('table query', () => {
  test('aggregates by severity with exact counts', { tag: '@smoke' }, async ({ app }) => {
    const sql =
      'SELECT severity_text, count(*) AS c FROM opentelemetry_logs GROUP BY severity_text ORDER BY severity_text'
    const response = waitSql(app, 'GROUP BY severity_text')
    await visit(app, queryUrl(sql))
    const { columns, rows } = await sqlRecords(await response)
    expect(columns).toEqual(['severity_text', 'c'])
    expect(rows).toEqual([
      ['ERROR', EXPECT.logs.error],
      ['INFO', EXPECT.logs.info],
      ['WARN', EXPECT.logs.warn],
    ])
    // Keep-alive page: earlier results stay mounted, so match the row by content.
    await expect(app.locator('.vxe-body--row', { hasText: 'ERROR' }).first()).toContainText(String(EXPECT.logs.error))
  })

  test('lists the seeded tables in the sidebar', async ({ app }) => {
    await visit(app, queryUrl('SELECT 1 AS ok'))
    await Promise.all(
      ['opentelemetry_logs', 'web_trace_demo', 'e2e_cpu_usage'].map((table) =>
        expect(app.getByText(table).first()).toBeVisible()
      )
    )
  })
})
