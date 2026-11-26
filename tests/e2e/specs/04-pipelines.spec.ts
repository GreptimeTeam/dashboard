import { expect, test } from '../fixtures'
import { E2E_PIPELINE } from '../env'
import { visit, visitCreate } from '../helpers'

test.describe('pipelines', () => {
  test('seeded pipeline is listed and shows its definition', { tag: '@smoke' }, async ({ app }) => {
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
