/**
 * Shell-level behaviour (menu, locale, connection settings). Specs are numbered in the order of the
 * sidebar menu: 00 global, 01 Table Query, 02 Metrics Query, 03 Logs Query, 04 Logs Pipelines,
 * 05-06 Traces Query, 07 Ingest, 08 Flow, 09-10 Signals Explore, 11 Visualization.
 */
import { expect, test } from '../fixtures'
import { visit } from '../helpers'

/** Sidebar entries in menu order, with the route each one opens. */
const MENU: [label: string, route: string][] = [
  ['Metrics Query', 'metrics-query'],
  ['Logs Query', 'logs-query'],
  ['Logs Pipelines', 'logs-pipelines'],
  ['Traces Query', 'traces'],
  ['Ingest', 'ingest'],
  ['Flow', 'flow'],
  ['Signals Explore', 'explore'],
  ['Visualization', 'perses'],
  ['Table Query', 'query'],
]

test.describe('global', () => {
  test('menu opens every page in navigation order', { tag: '@smoke' }, async ({ app }) => {
    await visit(app, '/dashboard/query')
    const menu = app.locator('.main-sider')
    // eslint-disable-next-line no-restricted-syntax
    for (const [label, route] of MENU) {
      // eslint-disable-next-line no-await-in-loop
      await menu.getByText(label, { exact: true }).click()
      // eslint-disable-next-line no-await-in-loop
      await expect.poll(() => app.evaluate(() => window.location.hash)).toContain(`/dashboard/${route}`)
    }
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
  })
})
