import { expect, test } from '../fixtures'
import { EXPECT } from '../data/dataset'
import { queryUrl, sqlRecords, visit, waitSql } from '../helpers'

test.describe('table query', () => {
  test('aggregates by severity with exact counts', async ({ app }) => {
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

  test('joins spans back to their root', async ({ app }) => {
    const sql =
      'SELECT count(*) AS n FROM web_trace_demo c JOIN web_trace_demo p ON c.parent_span_id = p.span_id AND c.trace_id = p.trace_id'
    const response = waitSql(app, 'JOIN web_trace_demo')
    await visit(app, queryUrl(sql))
    // Every non-root span (2 per trace) has a parent.
    expect((await sqlRecords(await response)).rows).toEqual([[EXPECT.traces.spans - EXPECT.traces.roots]])
  })

  test('shows the server error for invalid SQL', async ({ app }) => {
    const response = waitSql(app, 'SELEC ')
    await visit(app, queryUrl('SELEC broken FROM nowhere'))
    expect((await response).status()).toBe(400)
    // The page must stay alive and surface the failure (no blank state, no crash).
    await expect(app.getByText(/syntax|error|错误|失败/i).first()).toBeVisible()
  })

  test('EXPLAIN returns a plan', async ({ app }) => {
    const response = waitSql(app, /^EXPLAIN /i)
    await visit(app, queryUrl('EXPLAIN SELECT count(*) FROM opentelemetry_logs'))
    const { rows } = await sqlRecords(await response)
    expect(rows.length).toBeGreaterThan(0)
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
