import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

type RouteCase = {
  name: string
  hashPath: string
  readySelector: string
}

const screenshotDir = path.resolve(process.cwd(), 'artifacts/release-smoke/screenshots')
const storageConfig = {
  host: process.env.SMOKE_DB_HOST || 'http://localhost:4000',
  database: process.env.SMOKE_DB_NAME || 'public',
  username: process.env.SMOKE_DB_USER || '',
  password: process.env.SMOKE_DB_PASSWORD || '',
  authHeader: process.env.SMOKE_DB_AUTH_HEADER || '',
  userTimezone: process.env.SMOKE_DB_TIMEZONE || '',
}

const routeCases: RouteCase[] = [
  { name: 'query', hashPath: '/dashboard/query', readySelector: '.new-layout--workspace' },
  { name: 'metrics', hashPath: '/dashboard/metrics-query', readySelector: '.metrics-result-content' },
  { name: 'logs-query', hashPath: '/dashboard/logs-query', readySelector: '.logs-query-container' },
  { name: 'traces', hashPath: '/dashboard/traces', readySelector: '.trace-query-container' },
  { name: 'perses', hashPath: '/dashboard/perses', readySelector: '.detail-layout' },
]

const sanitize = (value: string) => value.replace(/[^a-z0-9-]/gi, '_')

test.beforeAll(() => {
  if (!fs.existsSync(path.resolve(process.cwd(), 'dist/index.html'))) {
    throw new Error('dist is missing. Run "pnpm run build" before smoke tests.')
  }
  fs.mkdirSync(screenshotDir, { recursive: true })
})

test('release smoke: pages render without frontend errors', async ({ page, baseURL }, testInfo) => {
  const hardErrors: string[] = []
  const apiWarnings: string[] = []

  const isLikelyRuntimeError = (text: string) =>
    /uncaught|typeerror|referenceerror|syntaxerror|cannot read|failed to fetch dynamically imported module/i.test(text)

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (isLikelyRuntimeError(text)) {
        hardErrors.push(`[console.error] ${text}`)
      } else {
        apiWarnings.push(`[console.error] ${text}`)
      }
    }
  })
  page.on('pageerror', (error) => {
    const message = error?.message || String(error)
    if (message === 'Object') {
      apiWarnings.push(`[pageerror] ${message}`)
    } else {
      hardErrors.push(`[pageerror] ${message}`)
    }
  })
  page.on('requestfailed', (request) => {
    const url = request.url()
    const detail = `${request.method()} ${url} :: ${request.failure()?.errorText || 'unknown'}`
    if (url.includes('/v1/')) {
      apiWarnings.push(`[requestfailed] ${detail}`)
    } else {
      hardErrors.push(`[requestfailed] ${detail}`)
    }
  })
  page.on('response', (response) => {
    const status = response.status()
    const detail = `${response.request().method()} ${response.url()}`
    if (status >= 500) {
      hardErrors.push(`[http_${status}] ${detail}`)
    } else if (status >= 400 && response.url().includes('/v1/')) {
      apiWarnings.push(`[http_${status}] ${detail}`)
    }
  })

  await page.addInitScript((config) => {
    localStorage.setItem('config', JSON.stringify(config))
    localStorage.setItem('uiConfig', JSON.stringify({}))
  }, storageConfig)

  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  for (const routeCase of routeCases) {
    const target = `${baseURL}/#${routeCase.hashPath}`
    await page.goto(target, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(new RegExp(`#${routeCase.hashPath.replace('/', '\\/')}`))
    await page.waitForSelector(routeCase.readySelector, { state: 'visible' })
    await page.waitForTimeout(1500)

    const screenshotName = `${runId}-${sanitize(routeCase.name)}.png`
    const screenshotPath = path.join(screenshotDir, screenshotName)
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    })
    await testInfo.attach(routeCase.name, {
      path: screenshotPath,
      contentType: 'image/png',
    })
  }

  if (apiWarnings.length > 0) {
    await testInfo.attach('api-warnings.txt', {
      body: apiWarnings.join('\n'),
      contentType: 'text/plain',
    })
  }

  expect(hardErrors, `Frontend errors detected:\n${hardErrors.map((item) => `- ${item}`).join('\n')}`).toEqual([])
})
