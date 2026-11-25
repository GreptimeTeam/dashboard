import {
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
 *  - make sure the fixed database matches the current dataset (re-seed only when it changed);
 *  - record which optional capabilities exist so specs can skip instead of failing.
 */
export default async function globalSetup() {
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
