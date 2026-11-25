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
  test('writing the same point twice keeps one row', async ({ app }) => {
    const line = `e2e_ingest_idem,host=a usage=1.5 ${ns(0)}`
    expect([200, 204]).toContain(await writeFromUi(app, line))
    expect([200, 204]).toContain(await writeFromUi(app, line))
    expect(await readRows(`SELECT count(*), max(usage) FROM e2e_ingest_idem WHERE host = 'a'`)).toEqual([[1, 1.5]])
  })

  test('multi-line payload lands as separate series', async ({ app }) => {
    const lines = ['x', 'y', 'z'].map((host, i) => `e2e_ingest_multi,host=${host} usage=${i + 1} ${ns(i)}`).join('\n')
    expect([200, 204]).toContain(await writeFromUi(app, lines))
    expect(await readRows('SELECT host, usage FROM e2e_ingest_multi ORDER BY host')).toEqual([
      ['x', 1],
      ['y', 2],
      ['z', 3],
    ])
  })

  test('invalid line protocol is rejected', async ({ app }) => {
    expect(await writeFromUi(app, 'this is not line protocol')).toBe(400)
  })

  test('file upload page renders its drop zone', async ({ app }) => {
    await visit(app, '/dashboard/ingest/influxdb-line-protocol/upload')
    await expect(app.locator('.arco-upload, [class*="upload"]').first()).toBeVisible()
  })

  test('log ingestion preselects the pipeline from the URL', async ({ app }) => {
    await visit(app, `/dashboard/ingest/log-ingestion/input?pipeline=${E2E_PIPELINE}`)
    await expect(app.getByText(E2E_PIPELINE).first()).toBeVisible()
  })
})
