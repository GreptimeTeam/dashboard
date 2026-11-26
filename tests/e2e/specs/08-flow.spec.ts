import { expect, test } from '../fixtures'
import { E2E_DB, E2E_FLOW } from '../env'
import { queryRows, runSql, dbHttpBase, authFromEnv } from '../data/sql'
import { visit, waitSql } from '../helpers'

const UI_FLOW = 'e2e_ui_flow'
const UI_SINK = `${UI_FLOW}_sink`

const sql = (statement: string) =>
  runSql(statement, { baseUrl: dbHttpBase(), database: E2E_DB, ...authFromEnv() }).catch(() => undefined)

test.describe('flow', () => {
  test.skip(process.env.E2E_FLOW_READY !== '1', 'CREATE FLOW unavailable on this GreptimeDB')

  // The list is paginated and a shared database can hold many flows: locate ours through the
  // page's own search box instead of assuming it is on the first page.
  test('seeded flow is listed with its sink table', async ({ app }) => {
    await visit(app, '/dashboard/flow')
    await app.locator('.flow-filter-search input').fill(E2E_FLOW)
    const row = app.locator('.vxe-body--row', { hasText: E2E_FLOW })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('e2e_flow_sink')
    await expect(row).toContainText('e2e_flow_src')
  })

  test('search hides non-matching flows', async ({ app }) => {
    await visit(app, '/dashboard/flow')
    const rows = app.locator('.vxe-body--row')
    const search = app.locator('.flow-filter-search input')
    await search.fill(E2E_FLOW)
    await expect(rows.filter({ hasText: E2E_FLOW })).toHaveCount(1)
    await search.fill('no_such_flow')
    await expect(rows).toHaveCount(0)
  })

  test('create a flow from the form: it exists on the server and shows in the list', async ({ app }) => {
    test.setTimeout(60_000)
    // The test owns this flow: start without it and remove it afterwards.
    await sql(`DROP FLOW IF EXISTS ${UI_FLOW}`)
    await sql(`DROP TABLE IF EXISTS ${UI_SINK}`)
    try {
      await visit(app, '/dashboard/flow')
      await app.getByRole('button', { name: 'New Flow' }).click()

      const drawer = app.locator('.arco-drawer:visible')
      await expect(drawer).toContainText('Create Flow')
      await drawer.getByPlaceholder('Enter flow name').fill(UI_FLOW)
      // The sink table is prefilled from the flow name.
      await expect(drawer.getByText(UI_SINK).first()).toBeVisible()
      await drawer.locator('.cm-content').first().click()
      await app.keyboard.insertText('SELECT n, ts FROM e2e_flow_src')

      const created = waitSql(app, /CREATE\s+FLOW/i)
      await drawer.getByRole('button', { name: 'Create Flow' }).click()
      expect((await created).status()).toBe(200)
      await expect(app.getByText('Flow created successfully').first()).toBeVisible()
      await expect(drawer).toBeHidden()

      // Server side: the flow is registered with the expected sink and source.
      const flows = await queryRows(
        `SELECT flow_name, sink_table_name, source_table_names FROM information_schema.flows WHERE flow_name = '${UI_FLOW}'`,
        E2E_DB
      )
      expect(flows).toHaveLength(1)
      expect(String(flows[0][1])).toContain(UI_SINK)
      expect(String(flows[0][2])).toContain('e2e_flow_src')

      // UI side: the refreshed list shows it.
      await app.locator('.flow-filter-search input').fill(UI_FLOW)
      const row = app.locator('.vxe-body--row', { hasText: UI_FLOW })
      await expect(row).toHaveCount(1)
      await expect(row).toContainText(UI_SINK)
    } finally {
      await sql(`DROP FLOW IF EXISTS ${UI_FLOW}`)
      await sql(`DROP TABLE IF EXISTS ${UI_SINK}`)
    }
  })
})
