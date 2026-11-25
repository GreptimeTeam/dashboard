import { expect, test } from '../fixtures'
import { E2E_FLOW, E2E_PIPELINE } from '../env'
import { visit, visitCreate } from '../helpers'

test.describe('pipelines', () => {
  test('seeded pipeline is listed and shows its definition', async ({ app }) => {
    await visit(app, '/dashboard/logs-pipelines')
    const item = app.getByText(E2E_PIPELINE).first()
    await expect(item).toBeVisible()
    await item.click()
    // E2E_PIPELINE_YAML declares a timestamp transform.
    await expect(app.getByText(/greptime_timestamp/).first()).toBeVisible()
  })

  test('?create=1 opens the create flow', async ({ app }) => {
    await visitCreate(app, '/dashboard/logs-pipelines')
    await expect(app.locator('.arco-modal, .arco-drawer, .cm-content').first()).toBeVisible()
  })
})

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
    await search.fill(E2E_FLOW)
    await expect(rows.filter({ hasText: E2E_FLOW })).toHaveCount(1)
  })

  test('?create=1 opens the create flow', async ({ app }) => {
    await visitCreate(app, '/dashboard/flow')
    await expect(app.locator('.arco-modal, .arco-drawer, .cm-content').first()).toBeVisible()
  })
})
