import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { runPageAction } from './actions'
import { buildCatalog } from './catalog'
import { FIXTURE_RELATIVE, type SmokeFixture } from './fixtures/types'
import { writeReport, type PageReport, type SmokeSummary } from './report'
import { bootApp, spaPush } from './spa'

function loadFixture(): SmokeFixture {
  const fixturePath = path.resolve(process.cwd(), process.env.SMOKE_FIXTURE_PATH || FIXTURE_RELATIVE)
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Missing fixture at ${fixturePath}. globalSetup should have created it.`)
  }
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as SmokeFixture
}

test('menu smoke: sequential page interactions', async ({ page, baseURL }, testInfo) => {
  const fixture = loadFixture()
  const catalog = buildCatalog(fixture)
  const screenshotsDir = path.join(fixture.artifactsDir, 'screenshots')
  fs.mkdirSync(screenshotsDir, { recursive: true })

  const storageConfig = {
    host: process.env.SMOKE_USE_ABSOLUTE_DB_HOST === '1' ? process.env.SMOKE_DB_HOST || 'http://localhost:4000' : '',
    database: fixture.database,
    username: process.env.SMOKE_DB_USER || '',
    password: process.env.SMOKE_DB_PASSWORD || '',
    authHeader: process.env.SMOKE_DB_AUTH_HEADER || '',
    userTimezone: process.env.SMOKE_DB_TIMEZONE || '',
  }

  const hardErrors: string[] = []
  const apiWarnings: string[] = []
  const isLikelyRuntimeError = (text: string) =>
    /uncaught|typeerror|referenceerror|syntaxerror|cannot read|failed to fetch dynamically imported module/i.test(text)

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (isLikelyRuntimeError(text)) hardErrors.push(`[console.error] ${text}`)
      else apiWarnings.push(`[console.error] ${text}`)
    }
  })
  page.on('pageerror', (error) => {
    const message = error?.message || String(error)
    if (message === 'Object') apiWarnings.push(`[pageerror] ${message}`)
    else hardErrors.push(`[pageerror] ${message}`)
  })
  page.on('requestfailed', (request) => {
    const url = request.url()
    const detail = `${request.method()} ${url} :: ${request.failure()?.errorText || 'unknown'}`
    const isSameOriginAsset = !!baseURL && url.startsWith(baseURL) && !url.includes('/v1/')
    if (isSameOriginAsset) hardErrors.push(`[requestfailed] ${detail}`)
    else apiWarnings.push(`[requestfailed] ${detail}`)
  })

  // Metrics/explore use the ephemeral smoke DB (seeded with metric-engine tables).
  // Override with SMOKE_METRICS_DB only when intentionally pointing at another catalog.
  const metricsDatabase = process.env.SMOKE_METRICS_DB || fixture.database

  await page.addInitScript(
    ({ config, database, metricsDatabase: metricsDb }) => {
      localStorage.setItem('config', JSON.stringify(config))
      localStorage.setItem('uiConfig', JSON.stringify({}))
      // Per-signal DB prefs — see signal-database.ts
      const host = config.host || ''
      localStorage.setItem(`signal-db:logs`, JSON.stringify({ v: 1, host, database }))
      localStorage.setItem(`signal-db:traces`, JSON.stringify({ v: 1, host, database }))
      localStorage.setItem(`signal-db:metrics`, JSON.stringify({ v: 1, host, database: metricsDb }))
    },
    { config: storageConfig, database: fixture.database, metricsDatabase }
  )

  const origin = baseURL || `http://127.0.0.1:${process.env.SMOKE_PORT || 4173}`
  await bootApp(page, origin)

  const pageReports: PageReport[] = []
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  for (const smoke of catalog) {
    const started = Date.now()
    let status: PageReport['status'] = 'pass'
    let note = 'ok'
    try {
      await spaPush(page, smoke.path, origin)
      const result = await runPageAction(page, smoke, fixture)
      note = result.note
      if (!result.ok) status = 'fail'
    } catch (error) {
      status = 'fail'
      note = error instanceof Error ? error.message : String(error)
    }

    const screenshotPath = path.join(screenshotsDir, smoke.file)
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false })
      await testInfo.attach(smoke.name, { path: screenshotPath, contentType: 'image/png' })
    } catch (error) {
      note = `${note}; screenshot failed: ${error instanceof Error ? error.message : error}`
      if (status === 'pass') status = 'warn'
    }

    const seconds = (Date.now() - started) / 1000
    pageReports.push({
      file: smoke.file,
      name: smoke.name,
      label: smoke.label,
      status,
      seconds,
      note,
    })
    console.log(`[${status.toUpperCase()}] ${smoke.file.padEnd(24)} ${seconds.toFixed(1)}s  ${note}`)
  }

  if (apiWarnings.length > 0) {
    await testInfo.attach('api-warnings.txt', {
      body: apiWarnings.join('\n'),
      contentType: 'text/plain',
    })
  }

  const summary: SmokeSummary = {
    runId: fixture.runId,
    database: fixture.database,
    baseURL: origin,
    strict: process.env.SMOKE_STRICT === '1',
    startedAt,
    finishedAt: new Date().toISOString(),
    totalSeconds: (Date.now() - t0) / 1000,
    pass: pageReports.filter((p) => p.status === 'pass').length,
    fail: pageReports.filter((p) => p.status === 'fail').length,
    warn: pageReports.filter((p) => p.status === 'warn').length,
    pages: pageReports,
    fixture,
  }

  const indexPath = writeReport(fixture.artifactsDir, summary, catalog)
  // Mirror latest (HTML + screenshots) so file://…/latest/index.html can load imgs.
  const latestDir = path.resolve(process.cwd(), 'artifacts/menu-smoke/latest')
  fs.mkdirSync(latestDir, { recursive: true })
  fs.copyFileSync(indexPath, path.join(latestDir, 'index.html'))
  fs.copyFileSync(path.join(fixture.artifactsDir, 'summary.json'), path.join(latestDir, 'summary.json'))
  fs.cpSync(screenshotsDir, path.join(latestDir, 'screenshots'), { recursive: true })
  console.log(`[menu-smoke] report: ${indexPath}`)
  console.log(`[menu-smoke] latest:  ${path.join(latestDir, 'index.html')}`)

  expect(hardErrors, `Frontend hard errors:\n${hardErrors.map((e) => `- ${e}`).join('\n')}`).toEqual([])

  if (process.env.SMOKE_STRICT === '1') {
    expect(
      summary.fail,
      `Strict mode: ${summary.fail} page(s) failed:\n${pageReports
        .filter((p) => p.status === 'fail')
        .map((p) => `- ${p.name}: ${p.note}`)
        .join('\n')}`
    ).toBe(0)
  }
})
