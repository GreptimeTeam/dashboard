import { createDashboard, createPipeline, listDashboards, SMOKE_PIPELINE_YAML, writeInfluxLine } from './http'
import { dbHttpBase, runSql, smokeAuthFromEnv } from './sql'
import type { PersesStrategy, SmokeFixture } from './types'

function nowNs(): string {
  return `${Date.now()}000000`
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export async function createSmokeDatabase(database: string): Promise<void> {
  const auth = smokeAuthFromEnv()
  await runSql(`CREATE DATABASE IF NOT EXISTS ${quoteIdent(database)}`, {
    baseUrl: dbHttpBase(),
    ...auth,
  })
}

export async function dropSmokeDatabase(database: string): Promise<void> {
  const auth = smokeAuthFromEnv()
  await runSql(`DROP DATABASE IF EXISTS ${quoteIdent(database)}`, {
    baseUrl: dbHttpBase(),
    ...auth,
  })
}

export async function seedTables(database: string): Promise<void> {
  const auth = smokeAuthFromEnv()
  const opts = { baseUrl: dbHttpBase(), database, ...auth }
  const ts = new Date().toISOString().replace('T', ' ').replace('Z', '')

  await runSql(
    `CREATE TABLE IF NOT EXISTS opentelemetry_logs (
      "timestamp" TIMESTAMP TIME INDEX,
      "message" STRING,
      "service_name" STRING,
      "severity_text" STRING
    )`,
    opts
  )
  await runSql(
    `INSERT INTO opentelemetry_logs ("timestamp", "message", "service_name", "severity_text") VALUES
      ('${ts}', 'smoke-log-ok', 'smoke-svc', 'INFO')`,
    opts
  )

  await runSql(
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
    opts
  )
  await runSql(
    `INSERT INTO web_trace_demo ("timestamp", "trace_id", "span_id", "parent_span_id", "service_name", "span_name", "duration_ns") VALUES
      ('${ts}', 'smoke-trace-1', 'smoke-span-root', NULL, 'smoke-svc', 'root', 1000000)`,
    opts
  )

  await runSql(
    `CREATE TABLE IF NOT EXISTS smoke_flow_src (
      "n" INT64,
      "ts" TIMESTAMP TIME INDEX
    )`,
    opts
  )
  await runSql(
    `CREATE TABLE IF NOT EXISTS smoke_flow_sink (
      "n" INT64,
      "ts" TIMESTAMP TIME INDEX,
      "update_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    opts
  )

  // Influx mito table — used by ingest write/readback (not Prometheus catalog).
  const line = `smoke_cpu,host=smoke usage=1.23 ${nowNs()}`
  const influxRes = await writeInfluxLine(line, { database })
  if (!influxRes.ok && influxRes.status !== 204) {
    throw new Error(`seed influx write: ${influxRes.status} ${await influxRes.text()}`)
  }

  // Metric-engine tables — visible in metrics-query / explore catalogs + range queries.
  await runSql(
    `CREATE TABLE IF NOT EXISTS greptime_physical_table (
      greptime_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP TIME INDEX,
      greptime_value DOUBLE
    ) ENGINE=metric WITH ("physical_metric_table" = "")`,
    opts
  )
  await runSql(
    `CREATE TABLE IF NOT EXISTS smoke_ready_metric (
      greptime_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP TIME INDEX,
      greptime_value DOUBLE,
      instance STRING PRIMARY KEY
    ) ENGINE=metric WITH ("on_physical_table" = "greptime_physical_table")`,
    opts
  )
  const nowMs = Date.now()
  const samples = [20, 10, 5, 1, 0].map((minsAgo, i) => {
    const sampleTs = new Date(nowMs - minsAgo * 60_000).toISOString().replace('T', ' ').replace('Z', '')
    return `('${sampleTs}', ${10 + i * 7}, 'local')`
  })
  await runSql(
    `INSERT INTO smoke_ready_metric (greptime_timestamp, greptime_value, instance) VALUES ${samples.join(', ')}`,
    opts
  )
}

/** Prometheus metric name seeded for metrics / explore interactions. */
export const SMOKE_METRIC_NAME = 'smoke_ready_metric'

export async function seedFlow(database: string, flowName: string): Promise<void> {
  const auth = smokeAuthFromEnv()
  const opts = { baseUrl: dbHttpBase(), database, ...auth }
  // Flow names are cluster-scoped; qualify sink/source with database when needed.
  const sql = `CREATE FLOW IF NOT EXISTS ${quoteIdent(flowName)}
SINK TO ${quoteIdent(database)}.smoke_flow_sink
AS
SELECT n, ts FROM ${quoteIdent(database)}.smoke_flow_src`
  await runSql(sql, opts)
}

export async function dropFlow(database: string, flowName: string): Promise<void> {
  const auth = smokeAuthFromEnv()
  try {
    await runSql(`DROP FLOW IF EXISTS ${quoteIdent(flowName)}`, {
      baseUrl: dbHttpBase(),
      database,
      ...auth,
    })
  } catch {
    // Flow may be unsupported or already gone.
  }
}

export async function resolvePersesDashboard(runSuffix: string): Promise<{
  name: string
  strategy: PersesStrategy
  created: boolean
}> {
  const envName = (process.env.SMOKE_PERSES_DASHBOARD || '').trim()
  if (envName) {
    return { name: envName, strategy: 'env', created: false }
  }

  try {
    const list = await listDashboards()
    const preferred = ['overview', 'monitordb', 'hhh', 'test']
    const hit =
      list.find((item) => preferred.includes(item.name.toLowerCase())) ||
      list.find((item) => item.name && !item.name.startsWith('smoke-e2e'))
    if (hit?.name) {
      return { name: hit.name, strategy: 'reuse', created: false }
    }
  } catch {
    // Fall through to create.
  }

  const name = `smoke-e2e-${runSuffix}`
  await createDashboard(name)
  return { name, strategy: 'created', created: true }
}

export async function seedPipeline(database: string, pipelineName: string): Promise<void> {
  await createPipeline(pipelineName, SMOKE_PIPELINE_YAML, { database })
}

export async function buildFixture(partial: {
  runId: string
  database: string
  artifactsDir: string
}): Promise<SmokeFixture> {
  const suffix =
    partial.runId
      .replace(/[^a-z0-9]/gi, '')
      .slice(-8)
      .toLowerCase() || 'run'
  const pipelineName = `smoke_pipe_${suffix}`
  const flowName = `smoke_flow_${suffix}`

  await createSmokeDatabase(partial.database)
  await seedTables(partial.database)
  await seedPipeline(partial.database, pipelineName)

  let flowOk = true
  try {
    await seedFlow(partial.database, flowName)
  } catch (error) {
    flowOk = false
    console.warn(`[menu-smoke] CREATE FLOW skipped: ${error instanceof Error ? error.message : error}`)
  }

  const perses = await resolvePersesDashboard(suffix)

  return {
    runId: partial.runId,
    database: partial.database,
    createdAt: new Date().toISOString(),
    pipelineName,
    flowName: flowOk ? flowName : '',
    persesDashboard: perses.name,
    persesStrategy: perses.strategy,
    persesCreated: perses.created,
    artifactsDir: partial.artifactsDir,
  }
}
