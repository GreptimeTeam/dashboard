/**
 * Idempotent seeding of the fixed e2e database.
 *
 * A normal run costs one tiny version lookup (tens of ms). The database is only rebuilt when
 * the dataset changed (or `force` is set), so the data stays fixed between runs.
 */
import { createDashboard, createPipeline, listDashboards, E2E_PIPELINE_YAML } from './http'
import { dbHttpBase, runSql, authFromEnv } from './sql'
import { E2E_DASHBOARD, E2E_DB, E2E_FLOW, E2E_PIPELINE } from '../env'
import { datasetVersion, seedStatements } from './dataset'

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`

async function sql(statement: string, database?: string): Promise<any> {
  return runSql(statement, { baseUrl: dbHttpBase(), database, ...authFromEnv() })
}

function firstValue(result: any): unknown {
  return result?.output?.[0]?.records?.rows?.[0]?.[0]
}

async function storedVersion(): Promise<string | null> {
  try {
    return (
      (firstValue(await sql('SELECT dataset_version FROM e2e_meta ORDER BY ts DESC LIMIT 1', E2E_DB)) as string) ?? null
    )
  } catch {
    return null
  }
}

async function createFlow(): Promise<boolean> {
  try {
    await sql(
      `CREATE FLOW IF NOT EXISTS ${quote(E2E_FLOW)}
SINK TO ${quote(E2E_DB)}.e2e_flow_sink
AS
SELECT n, ts FROM ${quote(E2E_DB)}.e2e_flow_src`,
      E2E_DB
    )
    return true
  } catch (error) {
    console.warn(`[e2e] CREATE FLOW unavailable: ${error instanceof Error ? error.message.split('\n')[0] : error}`)
    return false
  }
}

async function flowExists(): Promise<boolean> {
  try {
    const result = await sql(`SELECT count(*) FROM information_schema.flows WHERE flow_name = '${E2E_FLOW}'`)
    return Number(firstValue(result)) > 0
  } catch {
    return false
  }
}

/** Pipelines and Perses dashboards are not per-database; create them once and keep them. */
async function ensureGlobals(): Promise<void> {
  const pipelines = await sql(`SELECT count(*) FROM greptime_private.pipelines WHERE name = '${E2E_PIPELINE}'`)
  if (!(Number(firstValue(pipelines)) > 0)) {
    await createPipeline(E2E_PIPELINE, E2E_PIPELINE_YAML, { database: E2E_DB })
  }
  try {
    const dashboards = await listDashboards()
    if (!dashboards.some((item) => item.name === E2E_DASHBOARD)) {
      await createDashboard(E2E_DASHBOARD)
    }
  } catch (error) {
    console.warn(`[e2e] dashboards unavailable: ${error instanceof Error ? error.message.split('\n')[0] : error}`)
  }
}

export type SeedResult = {
  database: string
  version: string
  /** True when the database was (re)built this call. */
  seeded: boolean
  flow: boolean
  ms: number
}

export default async function ensureSeed(options: { force?: boolean } = {}): Promise<SeedResult> {
  const started = Date.now()
  const version = datasetVersion()

  await sql(`CREATE DATABASE IF NOT EXISTS ${quote(E2E_DB)}`)

  let seeded = false
  if (options.force || (await storedVersion()) !== version) {
    // Say out loud what is about to be destroyed: a wrong E2E_DB must be obvious in the log, not
    // only in the failure that follows.
    console.log(`[e2e] rebuilding database "${E2E_DB}" (dataset ${version}${options.force ? ', forced' : ''})`)
    // Flow names are cluster-scoped and reference the tables; drop it before the database.
    await sql(`DROP FLOW IF EXISTS ${quote(E2E_FLOW)}`).catch(() => undefined)
    await sql(`DROP DATABASE IF EXISTS ${quote(E2E_DB)}`)
    await sql(`CREATE DATABASE ${quote(E2E_DB)}`)
    // Order matters (tables before inserts), so run the statements one after another.
    await seedStatements().reduce(
      (chain, statement) => chain.then(() => sql(statement, E2E_DB)),
      Promise.resolve<unknown>(undefined)
    )
    await createFlow()
    // Written last: a half-seeded database never carries the current version.
    await sql('CREATE TABLE IF NOT EXISTS e2e_meta (ts TIMESTAMP TIME INDEX, dataset_version STRING)', E2E_DB)
    await sql(`INSERT INTO e2e_meta (ts, dataset_version) VALUES (now(), '${version}')`, E2E_DB)
    seeded = true
  }

  await ensureGlobals()
  return { database: E2E_DB, version, seeded, flow: await flowExists(), ms: Date.now() - started }
}
