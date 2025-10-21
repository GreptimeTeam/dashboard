import { expect, test } from '@playwright/test'
import { mkdir } from 'fs/promises'
import path from 'path'

const SCREENSHOT_PATH = path.join(process.cwd(), 'e2e-screenshots', 'query-fail.png')
const SQL_STATEMENT = 'SELECT 1;'

test.use({
  baseURL: 'http://localhost:5177',
  testIdAttribute: 'data-test',
})

test.setTimeout(15_000)

test.describe('Query Page (real backend)', () => {
  test('executes SQL against live backend and renders results', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('tourStatus', JSON.stringify({ navbar: true }))
    })

    try {
      await test.step('Navigate to query page', async () => {
        await page.goto('/dashboard/query')
        await page.waitForLoadState('networkidle')
      })

      await test.step('Input SQL statement', async () => {
        const sqlInput = page.getByTestId('sql-input').locator('.cm-content')
        await sqlInput.click()
        await sqlInput.pressSequentially(SQL_STATEMENT)
      })

      await test.step('Run query', async () => {
        await page.getByTestId('run-query').locator('button').first().click()
      })

      const resultArea = page.getByTestId('query-result')
      await expect(resultArea).toContainText('1', { timeout: 15_000 })

      const resultText = (await resultArea.textContent())?.trim() ?? ''
      console.log('SQL executed:', SQL_STATEMENT)
      console.log('Result text:', resultText)
    } catch (error) {
      console.error('Query test failed:', error)
      await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true })
      await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true })
      throw error
    }
  })
})
