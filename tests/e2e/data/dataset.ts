/**
 * Fixed test dataset. Pure functions only (no I/O) so the data is identical on every run and
 * every assertion can use exact numbers from `EXPECT`.
 */
import { createHash } from 'node:crypto'
import { SEED_START } from '../env'

const SEVERITIES = ['INFO', 'INFO', 'INFO', 'WARN', 'ERROR'] as const
const LOG_COUNT = 60
const TRACE_COUNT = 10
const HOSTS = 3
const POINTS = 60
/** Counter metric: hosts 0..REQUEST_HOSTS-1, value grows by (host + 1) * 5 per minute. */
const REQUEST_HOSTS = 2

/**
 * The newest log row (rendered first) deliberately carries characters that break naive rendering:
 * double quotes, `&`, angle brackets, an emoji and a percent sign. Still starts with `e2e-log-`
 * and still does not match `e2e-log-0`, so the existing LIKE/window assertions are unaffected.
 */
export const TRICKY_MESSAGE = 'e2e-log-59 said "hi" & <b>x</b> 😀 100%'

/** Exact numbers produced by the statements below. */
export const EXPECT = {
  logs: { total: LOG_COUNT, info: 36, warn: 12, error: 12, svcA: 30, svcB: 30, tricky: TRICKY_MESSAGE },
  /** Root spans are 10ms..100ms; those slower than 50ms are traces 5..9. */
  traces: { traces: TRACE_COUNT, spans: TRACE_COUNT * 3, roots: TRACE_COUNT, slowRoots: 5 },
  cpu: { series: HOSTS, pointsPerSeries: POINTS, rows: HOSTS * POINTS },
  requests: { series: REQUEST_HOSTS, pointsPerSeries: POINTS, rows: REQUEST_HOSTS * POINTS },
} as const

const ts = (sec: number) => new Date(sec * 1000).toISOString().replace('T', ' ').replace('Z', '')
const str = (value: string) => `'${value.replace(/'/g, "''")}'`

function logRows(): string[] {
  return Array.from({ length: LOG_COUNT }, (_, i) => {
    const severity = SEVERITIES[i % SEVERITIES.length]
    const service = i % 2 === 0 ? 'svc-a' : 'svc-b'
    const message = i === LOG_COUNT - 1 ? TRICKY_MESSAGE : `e2e-log-${String(i).padStart(2, '0')}`
    return `(${str(ts(SEED_START + i * 60))}, ${str(message)}, ${str(service)}, ${str(severity)})`
  })
}

function spanRows(): string[] {
  const rows: string[] = []
  for (let k = 0; k < TRACE_COUNT; k += 1) {
    const traceId = `e2e-trace-${String(k).padStart(2, '0')}`
    const base = SEED_START + k * 300
    const rootMs = (k + 1) * 10
    rows.push(
      `(${str(ts(base))}, ${str(traceId)}, ${str(`${traceId}-root`)}, NULL, 'e2e-gateway', 'GET /api/orders', ${
        rootMs * 1_000_000
      })`,
      `(${str(ts(base + 1))}, ${str(traceId)}, ${str(`${traceId}-svc`)}, ${str(
        `${traceId}-root`
      )}, 'e2e-orders', 'orders.query', ${Math.round(rootMs / 2) * 1_000_000})`,
      `(${str(ts(base + 2))}, ${str(traceId)}, ${str(`${traceId}-db`)}, ${str(
        `${traceId}-svc`
      )}, 'e2e-db', 'SELECT orders', ${Math.round(rootMs / 4) * 1_000_000})`
    )
  }
  return rows
}

function cpuRows(): string[] {
  const rows: string[] = []
  for (let host = 0; host < HOSTS; host += 1) {
    for (let minute = 0; minute < POINTS; minute += 1) {
      // Series `host` ranges over [(host+1)*10, (host+1)*10 + 9].
      rows.push(`(${str(ts(SEED_START + minute * 60))}, ${(host + 1) * 10 + (minute % 10)}, 'e2e', 'e2e-host-${host}')`)
    }
  }
  return rows
}

function requestRows(): string[] {
  const rows: string[] = []
  for (let host = 0; host < REQUEST_HOSTS; host += 1) {
    for (let minute = 0; minute < POINTS; minute += 1) {
      rows.push(`(${str(ts(SEED_START + minute * 60))}, ${minute * (host + 1) * 5}, 'e2e', 'e2e-host-${host}')`)
    }
  }
  return rows
}

/** Everything that goes into the fixed database, in execution order. */
export function seedStatements(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS opentelemetry_logs (
      "timestamp" TIMESTAMP TIME INDEX,
      "message" STRING,
      "service_name" STRING,
      "severity_text" STRING
    )`,
    `INSERT INTO opentelemetry_logs ("timestamp", "message", "service_name", "severity_text") VALUES ${logRows().join(
      ','
    )}`,

    `CREATE TABLE IF NOT EXISTS web_trace_demo (
      "timestamp" TIMESTAMP TIME INDEX,
      "trace_id" STRING,
      "span_id" STRING,
      "parent_span_id" STRING NULL,
      "service_name" STRING,
      "span_name" STRING,
      "duration_ns" INT64,
      PRIMARY KEY ("trace_id", "span_id")
    )`,
    `INSERT INTO web_trace_demo ("timestamp", "trace_id", "span_id", "parent_span_id", "service_name", "span_name", "duration_ns") VALUES ${spanRows().join(
      ','
    )}`,

    `CREATE TABLE IF NOT EXISTS greptime_physical_table (
      greptime_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP TIME INDEX,
      greptime_value DOUBLE
    ) ENGINE=metric WITH ("physical_metric_table" = "")`,
    `CREATE TABLE IF NOT EXISTS e2e_cpu_usage (
      greptime_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP TIME INDEX,
      greptime_value DOUBLE,
      job STRING,
      instance STRING,
      PRIMARY KEY (job, instance)
    ) ENGINE=metric WITH ("on_physical_table" = "greptime_physical_table")`,
    `INSERT INTO e2e_cpu_usage (greptime_timestamp, greptime_value, job, instance) VALUES ${cpuRows().join(',')}`,

    `CREATE TABLE IF NOT EXISTS e2e_http_requests_total (
      greptime_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP TIME INDEX,
      greptime_value DOUBLE,
      job STRING,
      instance STRING,
      PRIMARY KEY (job, instance)
    ) ENGINE=metric WITH ("on_physical_table" = "greptime_physical_table")`,
    `INSERT INTO e2e_http_requests_total (greptime_timestamp, greptime_value, job, instance) VALUES ${requestRows().join(
      ','
    )}`,

    `CREATE TABLE IF NOT EXISTS e2e_flow_src ("n" INT64, "ts" TIMESTAMP TIME INDEX)`,
    `CREATE TABLE IF NOT EXISTS e2e_flow_sink (
      "n" INT64,
      "ts" TIMESTAMP TIME INDEX,
      "update_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  ]
}

/** Changes whenever any statement above changes, which triggers a re-seed. */
export function datasetVersion(): string {
  return createHash('sha1').update(JSON.stringify(seedStatements())).digest('hex').slice(0, 12)
}
