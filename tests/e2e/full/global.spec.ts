import { expect, test } from '../fixtures'
import { visit } from '../helpers'

test.describe('global', () => {
  test('menu navigates between the main pages', async ({ app }) => {
    await visit(app, '/dashboard/query')
    const menu = app.locator('.main-sider')
    const open = async (label: string, route: string) => {
      await menu.getByText(label, { exact: true }).click()
      await expect.poll(() => app.evaluate(() => window.location.hash)).toContain(`/dashboard/${route}`)
    }
    await open('Metrics Query', 'metrics-query')
    await open('Logs Query', 'logs-query')
    await open('Traces Query', 'traces')
    await open('Flow', 'flow')
    await open('Table Query', 'query')
  })

  test('?locale= switches the UI language and back', async ({ app }) => {
    try {
      await visit(app, '/dashboard/query?locale=zh-CN')
      await expect(app.getByText('已连接').first()).toBeVisible()
    } finally {
      // The navbar strips `?locale=` right after applying it; let that finish, then restore the
      // default because the page is shared by every other test in the worker.
      await expect.poll(() => app.evaluate(() => window.location.hash)).not.toContain('locale=')
      await visit(app, '/dashboard/query?locale=en-US')
    }
    await expect(app.getByText('Connected').first()).toBeVisible()
  })

  test('?settings=1 opens the connection settings', async ({ app }) => {
    await visit(app, '/dashboard/query?settings=1')
    // Several (hidden) arco modals are always mounted; only a visible one counts.
    await expect(app.locator('.arco-drawer:visible, .arco-modal:visible, .arco-popover:visible').first()).toBeVisible()
    await expect(
      app
        .getByText(/Host|主机/)
        .filter({ visible: true })
        .first()
    ).toBeVisible()
    await app.keyboard.press('Escape')
    await expect(app.locator('.arco-drawer:visible, .arco-modal:visible, .arco-popover:visible')).toHaveCount(0)
  })
})
