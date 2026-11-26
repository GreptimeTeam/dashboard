import { expect, test } from '../fixtures'
import { E2E_PIPELINE } from '../env'
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

  test('?create=1 opens the create editor', async ({ app }) => {
    await visitCreate(app, '/dashboard/logs-pipelines')
    // Not "some modal is visible": arco keeps hidden modals mounted and the editor is always
    // rendered, so the old locator passed even when `?create=1` did nothing (verified).
    // The discriminator is the title: creating vs editing the auto-selected pipeline.
    const view = app.locator('.pipefile-view')
    await expect(view.locator('.card-title').filter({ hasText: 'Create Pipeline' })).toHaveCount(1)
    await expect(view.locator('.cm-content').first()).toBeVisible()
    // `visitCreate` waited for the page to strip `create=1`; assert it did not come back.
    expect(await app.evaluate(() => window.location.hash)).not.toContain('create=1')
  })
})
