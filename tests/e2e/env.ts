/**
 * Shared constants for the e2e suite (single-session Playwright, deep-link driven).
 *
 * Two data sources:
 *  - E2E_DB     : fixed, small, script-seeded database. Deterministic assertions, safe to write.
 *  - EXPLORE_DB : existing database (read-only) used by Explore / Drilldown inside the absolute
 *                 window 2026-09-18 .. 2026-09-20 (UTC), and by the trace tests (see TRACES_*).
 */

import { assertIdentifier, writableDatabase } from './guard'

export const HOST = process.env.E2E_HOST || '127.0.0.1'
export const PORT = Number(process.env.E2E_PORT || 4173)
export const BASE_URL = process.env.E2E_BASE_URL || `http://${HOST}:${PORT}`

/**
 * Fixed test database, created and seeded by `pnpm e2e:seed` (also checked on every run).
 * Validated at import time: it is dropped and rebuilt whenever the dataset changes, so an
 * accidental `E2E_DB=public` must fail before any SQL is sent.
 */
export const E2E_DB = writableDatabase(process.env.E2E_DB || 'dashboard_e2e')
/** Existing database holding real data for Explore / Drilldown (read-only). */
export const EXPLORE_DB = assertIdentifier('E2E_EXPLORE_DB', process.env.E2E_EXPLORE_DB || 'public')

if (EXPLORE_DB === E2E_DB) {
  throw new Error(
    `[e2e] E2E_DB and E2E_EXPLORE_DB are both "${E2E_DB}": E2E_DB is dropped and rebuilt, ` +
      'the read-only database must be a different one.'
  )
}

/** Global (non-database) objects owned by the suite. Always prefixed so they are easy to spot. */
export const E2E_PIPELINE = 'e2e_pipe'
export const E2E_DASHBOARD = 'e2e-dashboard'
export const E2E_FLOW = 'e2e_flow'

/** Unix seconds. 2026-09-18T00:00:00Z .. 2026-09-21T00:00:00Z, i.e. all of 9.18, 9.19 and 9.20. */
export const WINDOW_START = Number(process.env.E2E_WINDOW_START || 1789689600)
export const WINDOW_END = Number(process.env.E2E_WINDOW_END || 1789948800)

/** Seeded rows live in one hour starting at 2026-09-19T12:00:00Z (inside the window above). */
export const SEED_START = 1789819200
export const SEED_END = SEED_START + 3600

/** `'YYYY-MM-DD HH:mm:ss'` in UTC — the literal form GreptimeDB compares TIMESTAMP columns against. */
export function utcTimestamp(sec: number): string {
  return new Date(sec * 1000).toISOString().replace('T', ' ').replace('Z', '')
}

/** `timeRange=<start>&timeRange=<end>` (vue-router array query). */
export function timeRangeQuery(start: number, end: number): string {
  return `timeRange=${start}&timeRange=${end}`
}

export const WINDOW_QUERY = timeRangeQuery(WINDOW_START, WINDOW_END)
export const SEED_QUERY = timeRangeQuery(SEED_START, SEED_END)

/**
 * Trace tests read OpenTelemetry-schema spans from the existing database: `opentelemetry_traces_v2`
 * (semantic model `greptime_trace_v2`). Its data sits in 2026-11-04 (UTC), outside the 9.18–9.20
 * window above, so it has its own absolute window. Tests that need it skip when it is empty.
 */
export const TRACES_TABLE = assertIdentifier(
  'E2E_TRACES_TABLE',
  process.env.E2E_TRACES_TABLE || 'opentelemetry_traces_v2'
)
/** Logs written by the same OTel demo; used for trace -> logs. */
export const TRACES_LOGS_TABLE = assertIdentifier(
  'E2E_TRACES_LOGS_TABLE',
  process.env.E2E_TRACES_LOGS_TABLE || 'opentelemetry_logs'
)
export const TRACES_WINDOW_START = Number(process.env.E2E_TRACES_WINDOW_START || 1793750400)
export const TRACES_WINDOW_END = Number(process.env.E2E_TRACES_WINDOW_END || 1793836800)
export const TRACES_QUERY = timeRangeQuery(TRACES_WINDOW_START, TRACES_WINDOW_END)
