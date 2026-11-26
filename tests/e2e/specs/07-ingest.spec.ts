import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import { E2E_DB, E2E_PIPELINE, SEED_START } from '../env'
import { visit } from '../helpers'
import { dbHttpBase, runSql, authFromEnv } from '../data/sql'

const INPUT = '/dashboard/ingest/influxdb-line-protocol/input'

async function readRows(sql: string): Promise<any[][]> {
  const result: any = await runSql(sql, { baseUrl: dbHttpBase(), database: E2E_DB, ...authFromEnv() })
  return result.output[0].records.rows
}

/** Types into the line-protocol editor and presses Write; resolves with the HTTP status. */
async function writeFromUi(app: Page, text: string): Promise<number> {
  await visit(app, INPUT)
  await app.locator('.cm-content').first().click()
  await app.keyboard.press('ControlOrMeta+A')
  await app.keyboard.insertText(text)
  const written = app.waitForResponse((r) => r.url().includes('/v1/influxdb/write') && r.request().method() === 'POST')
  await app
    .getByRole('button', { name: /Write|写入/i })
    .first()
    .click()
  return (await written).status()
}

// Fixed tags + fixed timestamps: every run overwrites the same rows instead of piling up new ones.
const ns = (offsetSec: number) => `${SEED_START + offsetSec}000000000`

test.describe('ingest', () => {
  test('a line written from the UI is stored once and readable back', { tag: '@smoke' }, async ({ app }) => {
    const line = `e2e_ingest_idem,host=a usage=1.5 ${ns(0)}`
    expect([200, 204]).toContain(await writeFromUi(app, line))
    // Writing the identical point again must overwrite, not duplicate.
    expect([200, 204]).toContain(await writeFromUi(app, line))
    expect(await readRows(`SELECT count(*), max(usage) FROM e2e_ingest_idem WHERE host = 'a'`)).toEqual([[1, 1.5]])
  })

  test('invalid line protocol is rejected', async ({ app }) => {
    expect(await writeFromUi(app, 'this is not line protocol')).toBe(400)
  })

  test('log ingestion writes NDJSON through the pipeline into the chosen table', async ({ app }) => {
    const db = { baseUrl: dbHttpBase(), database: E2E_DB, ...authFromEnv() }
    // The test owns this table: start from an empty one with the schema the pipeline produces, so
    // the row count proves what this run wrote. (Picking it from the list avoids typing into the
    // searchable select, which queries the server on every keystroke.)
    await runSql('DROP TABLE IF EXISTS e2e_ingest_logs', db)
    await runSql('CREATE TABLE e2e_ingest_logs ("message" STRING, greptime_timestamp TIMESTAMP(9) TIME INDEX)', db)
    await visit(app, `/dashboard/ingest/log-ingestion/input?pipeline=${E2E_PIPELINE}`)
    await expect(app.locator('.select-item', { hasText: 'Pipeline' }).getByText(E2E_PIPELINE)).toBeVisible()

    const table = app.locator('.select-item', { hasText: 'Table' }).first().locator('.arco-select')
    await table.click()
    await app
      .locator('.arco-select-dropdown:visible .arco-select-option', { hasText: /^e2e_ingest_logs$/ })
      .first()
      .click({ timeout: 20_000 })
    await expect(table.locator('.arco-select-view-value')).toHaveText('e2e_ingest_logs')
    // Format: the pipeline needs structured input with a timestamp.
    await app.locator('.select-item', { hasText: 'Format' }).locator('.arco-select').click()
    await app.locator('.arco-select-option', { hasText: /^NDJSON$/ }).click()

    // Fixed timestamps (epoch ns) => reruns overwrite the same rows.
    // Built as text: epoch nanoseconds are beyond what a JS number prints exactly in every case.
    const lines = [0, 1, 2].map((i) => `{"message":"e2e-log-line-${i}","greptime_timestamp":${ns(i)}}`)
    await app.locator('.cm-content').first().click()
    await app.keyboard.press('ControlOrMeta+A')
    await app.keyboard.insertText(lines.join('\n'))

    const written = app.waitForResponse((r) => r.url().includes('/v1/events/logs') && r.request().method() === 'POST')
    await app
      .getByRole('button', { name: /Write|写入/i })
      .first()
      .click()
    const response = await written
    expect(response.status()).toBe(200)
    const params = new URL(response.url()).searchParams
    expect([params.get('db'), params.get('table'), params.get('pipeline_name')]).toEqual([
      E2E_DB,
      'e2e_ingest_logs',
      E2E_PIPELINE,
    ])

    expect(await readRows('SELECT message FROM e2e_ingest_logs ORDER BY greptime_timestamp')).toEqual([
      ['e2e-log-line-0'],
      ['e2e-log-line-1'],
      ['e2e-log-line-2'],
    ])
  })
})
