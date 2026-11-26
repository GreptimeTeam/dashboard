/**
 * Navigation and wait helpers. Everything is event driven: arm a response listener, push the
 * deep link, then await the listener. No fixed sleeps and no polling loops.
 */
import type { Page, Response } from '@playwright/test'
import { SEED_QUERY } from './env'

/**
 * Static pages (no data requests) used to unmount the current page. They sit inside the layout:
 * navigating to a 404 route would trip `navbar/index.vue` (`newRoute.matched[1]` is undefined).
 */
const PARK_ROUTES = [
  '/dashboard/ingest/influxdb-line-protocol/upload',
  '/dashboard/ingest/influxdb-line-protocol/input',
]

/**
 * Navigate inside the SPA (no page reload) and resolve once the router really is on `path`.
 *
 * Two hazards are handled here, both measured while turning on parallel workers:
 *  - pushing to the page we are already on does nothing (pages read their URL params on mount),
 *    so park on a static page first;
 *  - a page normalising its own URL (`router.replace` on mount) can abort a push that is still in
 *    flight, leaving the app on the previous route with no query fired. So await arrival, retry
 *    once, and fail loudly instead of letting the following `waitForResponse` time out.
 */
export async function visit(page: Page, path: string): Promise<void> {
  await page.evaluate(
    async ({ target, parks }) => {
      const router = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$router
      const targetPath = router.resolve(target).path

      const arrived = async (timeout: number) => {
        const deadline = Date.now() + timeout
        while (Date.now() < deadline) {
          if (router.currentRoute.value.path === targetPath) return true
          // eslint-disable-next-line no-await-in-loop
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 25)
          })
        }
        return false
      }

      if (router.currentRoute.value.path === targetPath) {
        await router.push(parks.find((park: string) => park !== targetPath))
        // Let the layout (navbar watchers, unmounts) settle before the real navigation.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 30)
        })
      }

      // Two attempts: the second one happens when an in-flight `router.replace` aborted the first.
      // eslint-disable-next-line no-restricted-syntax
      for (const attempt of [1, 2]) {
        // eslint-disable-next-line no-await-in-loop
        await router.push(target).catch(() => undefined)
        // eslint-disable-next-line no-await-in-loop
        if (await arrived(attempt === 1 ? 2000 : 4000)) return
      }
      throw new Error(`visit(${target}) did not reach ${targetPath}`)
    },
    { target: path, parks: PARK_ROUTES }
  )
}

/**
 * `?create=1` deep link: the page opens its create dialog and then strips the parameter itself
 * (`router.replace`). Wait for that, otherwise the pending replace can override the next `visit`
 * and bounce the app back to this page.
 */
export async function visitCreate(page: Page, path: string): Promise<void> {
  await visit(page, `${path}?create=1`)
  await page.waitForFunction(() => !window.location.hash.includes('create=1'))
}

export type SqlRecords = { columns: string[]; rows: any[][] }

export async function sqlRecords(response: Response): Promise<SqlRecords> {
  const body = await response.json()
  const records = body?.output?.[0]?.records
  return {
    columns: (records?.schema?.column_schemas ?? []).map((column: { name: string }) => column.name),
    rows: records?.rows ?? [],
  }
}

/** Resolves with the first `POST /v1/sql` whose statement matches. Arm it before `visit()`. */
export function waitSql(page: Page, match: string | RegExp, timeout = 25_000): Promise<Response> {
  return page.waitForResponse(
    (response) => {
      const request = response.request()
      if (request.method() !== 'POST' || !response.url().includes('/v1/sql')) return false
      const statement = new URLSearchParams(request.postData() || '').get('sql') || ''
      return typeof match === 'string' ? statement.includes(match) : match.test(statement)
    },
    { timeout }
  )
}

/** Resolves with the first Prometheus HTTP API call (`query_range` / `query`) whose PromQL matches. */
export function waitProm(page: Page, match: string | RegExp, timeout = 25_000): Promise<Response> {
  return page.waitForResponse(
    (response) => {
      const url = new URL(response.url())
      if (!/\/v1\/prometheus\/api\/v1\/query(_range)?$/.test(url.pathname)) return false
      const promql =
        url.searchParams.get('query') || new URLSearchParams(response.request().postData() || '').get('query') || ''
      return typeof match === 'string' ? promql.includes(match) : match.test(promql)
    },
    { timeout }
  )
}

export async function promSeries(
  response: Response
): Promise<{ metric: Record<string, string>; values: [number, string][] }[]> {
  const body = await response.json()
  return body?.data?.result ?? []
}

/**
 * `builderForm` deep link used by Logs and Traces (they apply it on mount). The pages store
 * `encodeURIComponent(JSON)` as the query value and vue-router encodes it once more, so a link the
 * app itself generates is double-encoded. Mirror that: a single-encoded JSON containing `%`
 * (e.g. a LIKE value) fails the page's own `decodeURIComponent` and the filter is silently dropped.
 */
function builderForm(form: Record<string, unknown>): string {
  return encodeURIComponent(encodeURIComponent(JSON.stringify(form)))
}

type BuilderCondition = { field: string; operator: string; value: string; relation?: 'AND' | 'OR' }

export function logsUrl(
  options: { conditions?: BuilderCondition[]; limit?: number; timeQuery?: string; table?: string } = {}
): string {
  const { conditions = [], limit = 1000, timeQuery = 'timeLength=-1', table = 'opentelemetry_logs' } = options
  const form = builderForm({
    table,
    conditions: conditions.map((c) => ({ relation: 'AND', ...c })),
    orderByField: 'timestamp',
    orderBy: 'DESC',
    limit,
    tsColumn: { name: 'timestamp', data_type: 'TimestampNanosecond' },
  })
  return `/dashboard/logs-query?editorType=builder&${timeQuery}&tourApply=1&builderForm=${form}`
}

export function tracesUrl(
  options: { conditions?: BuilderCondition[]; limit?: number; timeQuery?: string; table?: string } = {}
): string {
  const {
    conditions = [{ field: 'parent_span_id', operator: 'Not Exist', value: '' }],
    limit = 1000,
    timeQuery = 'timeLength=-1',
    table = 'web_trace_demo',
  } = options
  const form = builderForm({
    table,
    conditions: conditions.map((c) => ({ relation: 'AND', ...c })),
    orderByField: 'timestamp',
    orderBy: 'DESC',
    limit,
    tsColumn: { name: 'timestamp', data_type: 'TimestampNanosecond' },
  })
  return `/dashboard/traces?editorType=builder&${timeQuery}&tourApply=1&builderForm=${form}`
}

export function metricsUrl(
  promql: string,
  options: { tab?: 'graph' | 'table'; timeQuery?: string; step?: number } = {}
): string {
  const { tab = 'graph', timeQuery = SEED_QUERY, step } = options
  const stepQuery = step ? `&stepType=custom&stepValue=${step}` : ''
  return `/dashboard/metrics-query?promql=${encodeURIComponent(promql)}&tab=${tab}&${timeQuery}${stepQuery}`
}

export function queryUrl(sql: string): string {
  return `/dashboard/query?sql=${encodeURIComponent(sql)}`
}
