/**
 * Visualization (Perses): open the seeded dashboard, then one create → edit → delete round trip.
 *
 * The round trip works on `e2e-crud-*`, created and removed by the test itself, so the shared
 * `e2e-dashboard` is never touched. Server state is verified through the dashboards HTTP API, not
 * only through what the UI shows.
 */
import { expect, test } from '../fixtures'
import { E2E_DASHBOARD } from '../env'
import { deleteDashboard, listDashboards, readDashboard } from '../data/http'
import { visit, visitCreate } from '../helpers'

const CRUD = 'e2e-crud-dashboard'
const PANEL = 'e2e-crud-panel'

const names = async () => (await listDashboards()).map((entry) => entry.name)
const sidebarItem = (page: Parameters<typeof visit>[0], name: string) =>
  page.locator('.gpt-sidebar-menu-row', {
    has: page.locator('.gpt-sidebar-menu-text', { hasText: new RegExp(`^${name}$`) }),
  })
const editButton = (page: Parameters<typeof visit>[0]) =>
  page.frameLocator('iframe').getByRole('button', { name: 'Edit', exact: true }).first()

test.describe('visualization', () => {
  test('seeded dashboard opens in the viewer', { tag: '@smoke' }, async ({ app }) => {
    await visit(app, `/dashboard/perses?dashboard=${encodeURIComponent(E2E_DASHBOARD)}`)
    await expect(sidebarItem(app, E2E_DASHBOARD)).toBeVisible()
    await expect(app.locator('iframe')).toHaveAttribute('src', new RegExp(`name=${E2E_DASHBOARD}\\.json`))
    await expect(editButton(app)).toBeVisible({ timeout: 20_000 })
  })

  test('create a dashboard, add a panel, then delete it', async ({ app }) => {
    test.setTimeout(60_000)
    await deleteDashboard(CRUD)
    try {
      await test.step('create a blank dashboard from the modal', async () => {
        await visitCreate(app, '/dashboard/perses')
        const modal = app.locator('.arco-modal:visible')
        await expect(modal).toContainText('New Dashboard')
        await modal.locator('input[placeholder="dashboard-name"]').fill(CRUD)
        await modal.getByRole('button', { name: 'OK' }).click()

        await expect(sidebarItem(app, CRUD)).toBeVisible()
        await expect(modal).toBeHidden()
        const stored = await readDashboard(CRUD)
        expect(stored.kind).toBe('Dashboard')
        expect(stored.spec.panels).toEqual({})
        await expect(editButton(app)).toBeVisible({ timeout: 20_000 })
      })

      await test.step('add a panel and save: the change reaches the server', async () => {
        // Open it by URL: the sidebar re-selects after the list refreshes, so do not rely on the
        // selection left behind by the create step.
        await visit(app, `/dashboard/perses?dashboard=${encodeURIComponent(CRUD)}`)
        await expect(app.locator('iframe')).toHaveAttribute('src', new RegExp(`name=${CRUD}\\.json`))
        const viewer = app.frameLocator('iframe')
        await editButton(app).click({ timeout: 20_000 })
        await viewer.getByRole('button', { name: 'Add Panel' }).first().click()
        await viewer.getByLabel('Name').first().fill(PANEL)
        await viewer.getByRole('button', { name: 'Add', exact: true }).click()

        const saved = app.waitForResponse(
          (response) => response.url().includes(`/v1/dashboards/${CRUD}`) && response.request().method() === 'POST'
        )
        await viewer.getByRole('button', { name: 'Save', exact: true }).click()
        expect((await saved).ok()).toBe(true)

        const stored = await readDashboard(CRUD)
        const panels = Object.values(stored.spec.panels) as { spec: { display: { name: string } } }[]
        expect(panels.map((panel) => panel.spec.display.name)).toEqual([PANEL])
        // Back in view mode the panel title is rendered by the viewer.
        await expect(viewer.getByText(PANEL).first()).toBeVisible()
      })

      await test.step('delete it from the sidebar menu', async () => {
        const item = sidebarItem(app, CRUD)
        await item.hover()
        await item.locator('.menu-button').click()
        await app.locator('.dashboard-sidebar-menu .arco-dropdown-option', { hasText: /^Delete$/ }).click()

        const deleted = app.waitForResponse(
          (response) => response.url().includes(`/v1/dashboards/${CRUD}`) && response.request().method() === 'DELETE'
        )
        await app.locator('.arco-popconfirm-footer').getByRole('button', { name: 'Confirm' }).click()
        expect((await deleted).ok()).toBe(true)

        await expect(sidebarItem(app, CRUD)).toHaveCount(0)
        const remaining = await names()
        expect(remaining).not.toContain(CRUD)
        // The list after cleanup is thin evidence on its own; keep the server state in the report.
        await test.info().attach('verified.txt', {
          body: `dashboards after delete: ${remaining.join(', ') || '(none)'}`,
          contentType: 'text/plain',
        })
      })
    } finally {
      await deleteDashboard(CRUD)
    }
  })
})
