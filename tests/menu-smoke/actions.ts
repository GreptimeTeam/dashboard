import type { Page } from '@playwright/test'
import type { SmokePage } from './catalog'
import { dryrunPipeline } from './fixtures/http'
import { SMOKE_METRIC_NAME } from './fixtures/seed'
import { dbHttpBase, runSql, smokeAuthFromEnv } from './fixtures/sql'
import type { SmokeFixture } from './fixtures/types'
import {
  bodyHas,
  exploreCardsSettled,
  hasVxeRows,
  isConnected,
  isLoading,
  metricsCountVisible,
  metricsResultReady,
  resultBadgeGtZero,
  tablesSidebarReady,
  waitUntil,
} from './ready'

export type ActionResult = {
  ok: boolean
  note: string
}

function nowNs(): string {
  return `${Date.now()}000000`
}

async function waitSqlOk(page: Page, timeoutMs = 20_000): Promise<boolean> {
  try {
    const response = await page.waitForResponse(
      (res) => res.url().includes('/v1/sql') && res.request().method() === 'POST',
      { timeout: timeoutMs }
    )
    return response.ok()
  } catch {
    return false
  }
}

async function waitPromOk(page: Page, timeoutMs = 25_000): Promise<boolean> {
  try {
    const response = await page.waitForResponse((res) => res.url().includes('/v1/prometheus/') && res.status() < 500, {
      timeout: timeoutMs,
    })
    return response.ok()
  } catch {
    return false
  }
}

async function verifySqlHasRows(database: string, sql: string): Promise<boolean> {
  const auth = smokeAuthFromEnv()
  const result: any = await runSql(sql, { baseUrl: dbHttpBase(), database, ...auth })
  const rows = result?.output?.[0]?.records?.rows
  return Array.isArray(rows) && rows.length > 0
}

async function clickRun(page: Page): Promise<void> {
  const run = page.getByRole('button', { name: /Run Query|运行|查询|Run(?! All)/i })
  if ((await run.count()) > 0) {
    await run
      .first()
      .click({ timeout: 3000 })
      .catch(() => undefined)
  }
}

async function fillEditor(page: Page, selector: string, text: string): Promise<void> {
  const editor = page.locator(selector).first()
  if ((await editor.count()) === 0) return
  await editor.click({ timeout: 3000 }).catch(() => undefined)
  await page.keyboard.press('Meta+A').catch(() => undefined)
  await page.keyboard.press('Control+A').catch(() => undefined)
  await page.keyboard.type(text, { delay: 5 })
}

async function runQueryAction(page: Page): Promise<ActionResult> {
  await waitUntil(page, async () => isConnected(page), 10_000)

  let resultOk = await waitUntil(page, async () => (await bodyHas(page, 'smoke_ok')) && (await hasVxeRows(page)), 8_000)

  if (!resultOk) {
    await fillEditor(page, '.cm-content', 'SELECT 1 AS smoke_ok')
    const sqlPromise = waitSqlOk(page, 15_000)
    await clickRun(page)
    await sqlPromise
    resultOk = await waitUntil(page, async () => (await bodyHas(page, 'smoke_ok')) || (await hasVxeRows(page)), 15_000)
  }

  // Sidebar table list is slower than SELECT 1 — wait before screenshot.
  const tablesOk = await waitUntil(
    page,
    async () => tablesSidebarReady(page, 'opentelemetry_logs', 'smoke_cpu', 'web_trace_demo'),
    25_000
  )

  if (!resultOk) return { ok: false, note: 'query result missing' }
  if (!tablesOk) return { ok: false, note: 'query ok but tables sidebar not loaded' }
  return { ok: true, note: 'select 1 ok + tables listed' }
}

async function runMetricsAction(page: Page): Promise<ActionResult> {
  await waitUntil(page, async () => isConnected(page), 10_000)
  const listOk = await waitUntil(
    page,
    async () => (await metricsCountVisible(page)) || (await bodyHas(page, SMOKE_METRIC_NAME)),
    25_000
  )
  if (!listOk) {
    return { ok: false, note: 'metrics list empty' }
  }

  // Deep-link may already have run.
  let ready = await waitUntil(page, async () => metricsResultReady(page), 8_000)
  if (ready) {
    return { ok: true, note: `queried ${SMOKE_METRIC_NAME} with results (deep-link)` }
  }

  // Sidebar click uses replaceEditorContent (keeps Vue/CM in sync). Do not also keyboard-type.
  const metricItem = page.locator('.metric-item', { hasText: SMOKE_METRIC_NAME }).first()
  if ((await metricItem.count()) === 0) {
    return { ok: false, note: `${SMOKE_METRIC_NAME} not in metrics sidebar` }
  }
  await metricItem.click({ timeout: 5000 })
  await page.waitForTimeout(300)

  const promPromise = waitPromOk(page, 25_000)
  await clickRun(page)
  await promPromise
  ready = await waitUntil(page, async () => metricsResultReady(page), 20_000)

  if (!ready) {
    // Click metric again + Run once more.
    await metricItem.click({ timeout: 3000 }).catch(() => undefined)
    const again = waitPromOk(page, 20_000)
    await clickRun(page)
    await again
    ready = await waitUntil(page, async () => metricsResultReady(page), 15_000)
  }

  if (!ready) {
    return { ok: false, note: `queried ${SMOKE_METRIC_NAME} but no result series` }
  }
  return { ok: true, note: `queried ${SMOKE_METRIC_NAME} with results` }
}

async function runLogsOrTracesAction(page: Page, kind: 'logs' | 'traces'): Promise<ActionResult> {
  await waitUntil(page, async () => isConnected(page), 10_000)
  await waitSqlOk(page, 15_000)
  let ok = await waitUntil(
    page,
    async () => ((await hasVxeRows(page)) || (await resultBadgeGtZero(page))) && !(await isLoading(page)),
    15_000
  )
  if (!ok) {
    await clickRun(page)
    await waitSqlOk(page, 15_000)
    ok = await waitUntil(page, async () => (await hasVxeRows(page)) || (await resultBadgeGtZero(page)), 15_000)
  }
  return {
    ok,
    note: ok ? `${kind} rows ready` : `${kind} no rows after query`,
  }
}

async function runPipelineAction(page: Page, fixture: SmokeFixture): Promise<ActionResult> {
  if (!fixture.pipelineName) {
    return { ok: false, note: 'no pipeline fixture' }
  }
  const listed = await waitUntil(
    page,
    async () => bodyHas(page, fixture.pipelineName, `${fixture.pipelineName}.yaml`),
    20_000
  )
  if (!listed) {
    return { ok: false, note: `pipeline ${fixture.pipelineName} not in sidebar` }
  }

  const dry = await dryrunPipeline(
    fixture.pipelineName,
    {
      message: 'smoke-dryrun',
      greptime_timestamp: Date.now(),
    },
    { database: fixture.database }
  )
  if (!dry.ok) {
    return { ok: false, note: `dryrun ${dry.status}: ${(await dry.text()).slice(0, 200)}` }
  }
  return { ok: true, note: `pipeline listed + dryrun ${dry.status}` }
}

async function runIngestAction(page: Page, fixture: SmokeFixture): Promise<ActionResult> {
  await waitUntil(page, async () => (await page.locator('.cm-content').count()) > 0, 15_000)
  const line = `smoke_cpu,host=ui usage=9.87 ${nowNs()}`
  await fillEditor(page, '.card-editor .cm-content, .cm-content', line)

  const writeBtn = page.getByRole('button', { name: /Write|写入/i })
  if ((await writeBtn.count()) === 0) {
    return { ok: false, note: 'Write button not found' }
  }

  let status = 0
  try {
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes('/v1/influxdb/write') && res.request().method() === 'POST',
      { timeout: 20_000 }
    )
    await writeBtn.first().click()
    status = (await responsePromise).status()
  } catch (error) {
    return { ok: false, note: `influx write failed: ${error instanceof Error ? error.message : error}` }
  }

  if (status !== 204 && status !== 200) {
    return { ok: false, note: `influx write HTTP ${status}` }
  }

  const hasRows = await verifySqlHasRows(
    fixture.database,
    `SELECT * FROM smoke_cpu WHERE host = 'ui' ORDER BY greptime_timestamp DESC LIMIT 1`
  ).catch(async () => verifySqlHasRows(fixture.database, `SELECT * FROM smoke_cpu LIMIT 1`))

  return {
    ok: hasRows,
    note: hasRows ? `influx write ${status} + SQL readback` : `influx write ${status} but SQL empty`,
  }
}

async function runFlowAction(page: Page, fixture: SmokeFixture): Promise<ActionResult> {
  if (!fixture.flowName) {
    return { ok: false, note: 'flow fixture missing (CREATE FLOW may be unsupported)' }
  }
  await waitUntil(
    page,
    async () => (await isConnected(page)) || (await page.locator('.flow-page, .flow-table').count()) > 0,
    10_000
  )

  const search = page.locator('.flow-filter-search input, input[placeholder*="Search"], input[placeholder*="搜索"]')
  if ((await search.count()) > 0) {
    await search.first().fill(fixture.flowName)
  }

  const ok = await waitUntil(page, async () => bodyHas(page, fixture.flowName), 20_000)
  return { ok, note: ok ? `flow ${fixture.flowName} listed` : `flow ${fixture.flowName} not listed` }
}

async function runExploreAction(page: Page): Promise<ActionResult> {
  await waitUntil(page, async () => isConnected(page), 10_000)
  const catalogOk = await waitUntil(
    page,
    async () => (await metricsCountVisible(page)) && (await bodyHas(page, SMOKE_METRIC_NAME)),
    25_000
  )
  if (!catalogOk) {
    return { ok: false, note: 'explore missing metric catalog / smoke_ready_metric' }
  }

  // Wait for sparkline cards to leave loading; then optionally open the seeded metric.
  let settled = await waitUntil(page, async () => exploreCardsSettled(page), 40_000)
  const selectBtn = page
    .locator('.metric-catalog-card', { hasText: SMOKE_METRIC_NAME })
    .getByRole('button', { name: /Select|选择/i })
  if ((await selectBtn.count()) > 0) {
    await selectBtn
      .first()
      .click({ timeout: 3000 })
      .catch(() => undefined)
    // Detail view should load without infinite spin.
    settled = await waitUntil(
      page,
      async () => !(await isLoading(page)) || (await bodyHas(page, SMOKE_METRIC_NAME)),
      20_000
    )
  }

  return {
    ok: settled,
    note: settled ? `explore settled (${SMOKE_METRIC_NAME})` : 'explore cards still loading',
  }
}

async function runPersesAction(page: Page, fixture: SmokeFixture): Promise<ActionResult> {
  const name = fixture.persesDashboard
  if (!name) {
    return { ok: false, note: 'no perses dashboard resolved' }
  }
  const ok = await waitUntil(page, async () => bodyHas(page, name), 25_000)
  return {
    ok,
    note: ok
      ? `perses ${name} (${fixture.persesStrategy})`
      : `perses dashboard ${name} not selected (${fixture.persesStrategy})`,
  }
}

export async function runPageAction(page: Page, smoke: SmokePage, fixture: SmokeFixture): Promise<ActionResult> {
  switch (smoke.action) {
    case 'query':
      return runQueryAction(page)
    case 'metrics':
      return runMetricsAction(page)
    case 'logs':
      return runLogsOrTracesAction(page, 'logs')
    case 'traces':
      return runLogsOrTracesAction(page, 'traces')
    case 'pipeline':
      return runPipelineAction(page, fixture)
    case 'ingest':
      return runIngestAction(page, fixture)
    case 'flow':
      return runFlowAction(page, fixture)
    case 'explore':
      return runExploreAction(page)
    case 'perses':
      return runPersesAction(page, fixture)
    default:
      return { ok: false, note: `unknown action ${smoke.action}` }
  }
}
