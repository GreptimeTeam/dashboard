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

  test('shows the server error for invalid SQL', async ({ app }) => {
    const response = waitSql(app, 'SELEC ')
    await visit(app, queryUrl('SELEC broken FROM nowhere'))
    expect((await response).status()).toBe(400)
    // The page must stay alive and surface the failure (no blank state, no crash).
    await expect(app.getByText(/syntax|error|错误|失败/i).first()).toBeVisible()
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
