/**
 * Perses (Visualization): create, open, modify and delete a dashboard through the UI.
 *
 * Every test works on dashboards named `e2e-crud-*`, created and removed by the suite itself, so the
 * shared `e2e-dashboard` used by the smoke test is never touched. Server state is verified through
 * the dashboards HTTP API, not only through what the UI shows.
 */
import { expect, test } from '../fixtures'
import { E2E_DASHBOARD } from '../env'
import { deleteDashboard, emptyDashboardContent, listDashboards, readDashboard } from '../data/http'
import { visit, visitCreate } from '../helpers'

const BLANK = 'e2e-crud-blank'
const IMPORTED = 'e2e-crud-imported'
const PANEL = 'e2e-crud-panel'

const names = async () => (await listDashboards()).map((entry) => entry.name)
const sidebarItem = (page: Parameters<typeof visit>[0], name: string) =>
  page.locator('.gpt-sidebar-menu-row', {
    has: page.locator('.gpt-sidebar-menu-text', { hasText: new RegExp(`^${name}$`) }),
  })

async function purge() {
  await Promise.all([BLANK, IMPORTED].map((name) => deleteDashboard(name)))
}

test.describe('perses dashboards (create / open / modify / delete)', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(purge)
  test.afterAll(purge)

  test('create a blank dashboard from the modal', async ({ app }) => {
    await visitCreate(app, '/dashboard/perses')
    const modal = app.locator('.arco-modal:visible')
    await expect(modal).toContainText('New Dashboard')

    await modal.locator('input[placeholder="dashboard-name"]').fill(BLANK)
    await modal.getByRole('button', { name: 'OK' }).click()

    await expect(sidebarItem(app, BLANK)).toBeVisible()
    await expect(modal).toBeHidden()
    expect(await names()).toContain(BLANK)
    const stored = await readDashboard(BLANK)
    expect(stored.kind).toBe('Dashboard')
    expect(stored.spec.panels).toEqual({})
  })

  test('import a dashboard from JSON', async ({ app }) => {
    await visitCreate(app, '/dashboard/perses')
    const modal = app.locator('.arco-modal:visible')
    await modal.getByText('From JSON').click()
    await modal.locator('input[placeholder="dashboard-name"]').fill(IMPORTED)
    await modal.locator('textarea').fill(emptyDashboardContent(IMPORTED))
    await modal.getByRole('button', { name: 'OK' }).click()

    await expect(sidebarItem(app, IMPORTED)).toBeVisible()
    expect(await names()).toContain(IMPORTED)
    expect((await readDashboard(IMPORTED)).metadata.name).toBe(IMPORTED)
  })

  test('opening a dashboard loads it in the viewer', async ({ app }) => {
    await visit(app, `/dashboard/perses?dashboard=${encodeURIComponent(BLANK)}`)
    await expect(sidebarItem(app, BLANK)).toBeVisible()
    await expect(app.locator('iframe')).toHaveAttribute('src', new RegExp(`name=${BLANK}\\.json`))
    const viewer = app.frameLocator('iframe')
    await expect(viewer.getByRole('button', { name: 'Edit', exact: true }).first()).toBeVisible({ timeout: 20_000 })
  })

  test('add a panel and save: the change reaches the server', async ({ app }) => {
    await visit(app, `/dashboard/perses?dashboard=${encodeURIComponent(BLANK)}`)
    const viewer = app.frameLocator('iframe')
    await viewer.getByRole('button', { name: 'Edit', exact: true }).first().click({ timeout: 20_000 })
    await viewer.getByRole('button', { name: 'Add Panel' }).first().click()
    await viewer.getByLabel('Name').first().fill(PANEL)
    await viewer.getByRole('button', { name: 'Add', exact: true }).click()

    const saved = app.waitForResponse(
      (response) => response.url().includes(`/v1/dashboards/${BLANK}`) && response.request().method() === 'POST'
    )
    await viewer.getByRole('button', { name: 'Save', exact: true }).click()
    expect((await saved).ok()).toBe(true)

    const stored = await readDashboard(BLANK)
    const panels = Object.values(stored.spec.panels) as { spec: { display: { name: string } } }[]
    expect(panels.map((panel) => panel.spec.display.name)).toEqual([PANEL])
    // Back in view mode the panel title is rendered by the viewer.
    await expect(viewer.getByText(PANEL).first()).toBeVisible()
  })

  test('delete a dashboard from the sidebar menu', async ({ app }) => {
    await visit(app, `/dashboard/perses?dashboard=${encodeURIComponent(IMPORTED)}`)
    const item = sidebarItem(app, IMPORTED)
    await expect(item).toBeVisible()

    await item.hover()
    await item.locator('.menu-button').click()
    await app.locator('.dashboard-sidebar-menu .arco-dropdown-option', { hasText: /^Delete$/ }).click()

    const deleted = app.waitForResponse(
      (response) => response.url().includes(`/v1/dashboards/${IMPORTED}`) && response.request().method() === 'DELETE'
    )
    await app.locator('.arco-popconfirm-footer').getByRole('button', { name: 'Confirm' }).click()
    expect((await deleted).ok()).toBe(true)

    await expect(sidebarItem(app, IMPORTED)).toHaveCount(0)
    expect(await names()).not.toContain(IMPORTED)
  })

  test('the shared seeded dashboard is untouched', async () => {
    expect(await names()).toContain(E2E_DASHBOARD)
    expect((await readDashboard(E2E_DASHBOARD)).spec.panels).toEqual({})
  })
})
