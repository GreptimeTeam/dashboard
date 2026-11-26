import fs from 'node:fs'
import path from 'node:path'
import {
  BASE_URL,
  EXPLORE_DB,
  TRACES_LOGS_TABLE,
  TRACES_TABLE,
  TRACES_WINDOW_END,
  TRACES_WINDOW_START,
  WINDOW_END,
  WINDOW_START,
} from './env'
import ensureSeed from './data/seed'
import { queryRows } from './data/sql'
import { TRACE_FACTS_ENV, type TraceFacts } from './facts'

const utc = (sec: number) => new Date(sec * 1000).toISOString().replace('T', ' ').replace('Z', '')
const between = (start: number, end: number) => `"timestamp" >= '${utc(start)}' AND "timestamp" < '${utc(end)}'`

/* ------------------------------------------------------------------ served build check */

const DIST_DIR = path.resolve(process.env.E2E_DIST_DIR || 'dist')

/** `dist/index.html` references its entry bundle by content hash — the cheapest build identity. */
const entryAsset = (html: string) => /<script[^>]+src="([^"]*assets\/index-[^"]+\.js)"/.exec(html)?.[1]

function newestMtime(dir: string): number {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((newest, entry) => {
    const full = path.join(dir, entry.name)
    return Math.max(newest, entry.isDirectory() ? newestMtime(full) : fs.statSync(full).mtimeMs)
  }, 0)
}

/** The preview server is started by Playwright before globalSetup; give it a moment to answer. */
async function servedHtml(url: string, attempts = 10): Promise<string | undefined> {
  try {
    const response = await fetch(url)
    if (response.ok) return await response.text()
  } catch {
    // not ready yet
  }
  if (attempts <= 1) return undefined
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 500)
  })
  return servedHtml(url, attempts - 1)
}

/**
 * Fails fast when the page under test is not the build in `dist/`.
 *
 * `webServer.reuseExistingServer` happily reuses whatever already answers on the port — another
 * checkout, an orphaned preview from a deleted worktree, or yesterday's build. All three make the
 * suite report on code nobody is reviewing, so compare the served entry asset with `dist/index.html`
 * and, for the default `dist/`, refuse a build older than `src/`.
 */
async function assertServingDist(): Promise<void> {
  const indexPath = path.join(DIST_DIR, 'index.html')
  if (!fs.existsSync(indexPath)) {
    throw new Error(`[e2e] ${indexPath} does not exist. Build the app first (pnpm build) or set E2E_DIST_DIR.`)
  }
  const expected = entryAsset(fs.readFileSync(indexPath, 'utf8'))

  const html = await servedHtml(BASE_URL)
  if (!html) {
    throw new Error(`[e2e] ${BASE_URL} did not answer. Is anything already listening on that port?`)
  }
  const served = entryAsset(html)
  if (expected && served && expected !== served) {
    throw new Error(
      `[e2e] ${BASE_URL} is serving a different build than ${path.relative(process.cwd(), DIST_DIR) || DIST_DIR}.\n` +
        `      dist expects ${expected}\n      the server returns ${served}\n` +
        '      Another preview server is already on this port (an old checkout?). Stop it, e.g.\n' +
        `        lsof -ti tcp:${new URL(BASE_URL).port || 80} | xargs kill`
    )
  }

  // A release artifact (E2E_DIST_DIR) is legitimately older than src/ — only guard the local build.
  const srcDir = path.resolve('src')
  if (!process.env.E2E_DIST_DIR && fs.existsSync(srcDir)) {
    const distTime = fs.statSync(indexPath).mtimeMs
    const srcTime = newestMtime(srcDir)
    if (srcTime > distTime) {
      throw new Error(
        `[e2e] dist/ is older than src/ (${new Date(distTime).toISOString()} < ${new Date(srcTime).toISOString()}).\n` +
          '      pnpm e2e tests the built app, not the dev server: run `pnpm build` first.'
      )
    }
  }

  console.log(
    `[e2e] serving ${path.relative(process.cwd(), DIST_DIR) || DIST_DIR} (${expected ?? 'entry asset unknown'})`
  )
}

async function hasRowsInWindow(table: string, start: number, end: number): Promise<boolean> {
  try {
    return (await queryRows(`SELECT 1 FROM ${table} WHERE ${between(start, end)} LIMIT 1`, EXPLORE_DB)).length > 0
  } catch {
    return false
  }
}

/** Measures the biggest trace of the window; `undefined` when the table is missing or empty. */
async function measureTraces(): Promise<TraceFacts | undefined> {
  try {
    const window = between(TRACES_WINDOW_START, TRACES_WINDOW_END)
    const [top] = await queryRows(
      `SELECT trace_id, count(*) AS spans FROM ${TRACES_TABLE} WHERE ${window} GROUP BY trace_id ORDER BY spans DESC, trace_id ASC LIMIT 1`,
      EXPLORE_DB
    )
    if (!top) return undefined
    const id = String(top[0])
    const [services, [roots], logs] = await Promise.all([
      queryRows(
        `SELECT DISTINCT service_name FROM ${TRACES_TABLE} WHERE ${window} AND trace_id = '${id}' ORDER BY 1`,
        EXPLORE_DB
      ),
      queryRows(`SELECT count(*) FROM ${TRACES_TABLE} WHERE ${window} AND parent_span_id IS NULL`, EXPLORE_DB),
      queryRows(
        `SELECT count(*) FROM ${TRACES_LOGS_TABLE} WHERE ${between(
          TRACES_WINDOW_START,
          TRACES_WINDOW_END
        )} AND trace_id = '${id}'`,
        EXPLORE_DB
      ).catch(() => [[0]]),
    ])
    return {
      id,
      spans: Number(top[1]),
      services: services.map((row) => String(row[0])),
      roots: Number(roots[0]),
      logs: Number(logs[0]?.[0] ?? 0),
    }
  } catch {
    return undefined
  }
}

/**
 * Runs once per `playwright test`, before any worker boots. Everything here is a cheap check:
 *  - verify the served page really is the `dist/` build (before any database work);
 *  - make sure the fixed database matches the current dataset (re-seed only when it changed);
 *  - record which optional capabilities exist so specs can skip instead of failing.
 */
export default async function globalSetup() {
  // Before seeding: a stale/mismatched build must fail without touching the database.
  await assertServingDist()

  const [seed, logs, traces] = await Promise.all([
    ensureSeed(),
    hasRowsInWindow(TRACES_LOGS_TABLE, WINDOW_START, WINDOW_END),
    measureTraces(),
  ])

  // Workers are spawned after globalSetup and inherit these.
  process.env.E2E_FLOW_READY = seed.flow ? '1' : '0'
  process.env.E2E_EXPLORE_READY = logs ? '1' : '0'
  if (traces) process.env[TRACE_FACTS_ENV] = JSON.stringify(traces)

  console.log(
    `[e2e] ${seed.database} ${seed.seeded ? 'seeded' : 'ready'} in ${seed.ms}ms | flow=${seed.flow} | ` +
      `${EXPLORE_DB}: logs in 9.18-9.20=${logs}, ${
        traces
          ? `${TRACES_TABLE} biggest trace ${traces.id} (${traces.spans} spans, ${traces.services.length} services, ${traces.logs} logs)`
          : `${TRACES_TABLE} empty in its window`
      }`
  )
}
