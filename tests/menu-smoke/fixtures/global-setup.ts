import fs from 'node:fs'
import path from 'node:path'
import { listDashboards } from './http'
import { buildFixture, dropSmokeDatabase } from './seed'
import { dbHttpBase, runSql, smokeAuthFromEnv } from './sql'
import { FIXTURE_RELATIVE, type SmokeFixture } from './types'

function nanoTimestampToUTCString(nanoTimestamp: bigint | number | string): string {
  const nano = BigInt(nanoTimestamp)
  const divide1 = BigInt(1_000_000_000)
  const seconds = nano / divide1
  const divide2 = BigInt(1_000_000)
  const milliseconds = Number((nano % divide1) / divide2)
  const nanoseconds = Number(nano % divide2)
  const date = new Date(Number(seconds) * 1000)
  const isoString = date.toISOString().replace('Z', '').replace('.000', '')
  return `${isoString}.${String(milliseconds).padStart(3, '0')}${String(nanoseconds).padStart(6, '0')}Z`
}

async function latestPipelineVersion(name: string): Promise<string | null> {
  const auth = smokeAuthFromEnv()
  const result: any = await runSql(
    `SELECT max(created_at) FROM greptime_private.pipelines WHERE name = '${name.replace(/'/g, "''")}'`,
    { baseUrl: dbHttpBase(), ...auth }
  )
  const row = result?.output?.[0]?.records?.rows?.[0]
  if (!row || row[0] == null) return null
  return nanoTimestampToUTCString(row[0])
}

export default async function globalSetup() {
  const skip = process.env.SMOKE_SKIP_FIXTURE === '1'
  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const artifactsDir = path.resolve(process.cwd(), 'artifacts/menu-smoke', runId)
  const latestDir = path.resolve(process.cwd(), 'artifacts/menu-smoke/latest')
  fs.mkdirSync(artifactsDir, { recursive: true })
  fs.mkdirSync(path.join(artifactsDir, 'screenshots'), { recursive: true })
  fs.mkdirSync(latestDir, { recursive: true })

  if (skip) {
    const fixture: SmokeFixture = {
      runId,
      database: process.env.SMOKE_DB_NAME || 'public',
      createdAt: new Date().toISOString(),
      pipelineName: process.env.SMOKE_PIPELINE_NAME || '',
      flowName: process.env.SMOKE_FLOW_NAME || '',
      persesDashboard: process.env.SMOKE_PERSES_DASHBOARD || '',
      persesStrategy: process.env.SMOKE_PERSES_DASHBOARD ? 'env' : 'reuse',
      persesCreated: false,
      artifactsDir,
    }
    const fixturePath = path.resolve(process.cwd(), FIXTURE_RELATIVE)
    fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2))
    fs.writeFileSync(path.join(artifactsDir, 'fixture.json'), JSON.stringify(fixture, null, 2))
    console.log(`[menu-smoke] SKIP_FIXTURE — using database=${fixture.database}`)
    return
  }

  const database = `smoke_${runId
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 20)
    .toLowerCase()}`
  let fixture: SmokeFixture
  try {
    fixture = await buildFixture({ runId, database, artifactsDir })
  } catch (error) {
    try {
      await dropSmokeDatabase(database)
    } catch {
      /* ignore */
    }
    throw error
  }

  const version = await latestPipelineVersion(fixture.pipelineName)
  const enriched = { ...fixture, pipelineVersion: version }
  const fixturePath = path.resolve(process.cwd(), FIXTURE_RELATIVE)
  fs.writeFileSync(fixturePath, JSON.stringify(enriched, null, 2))
  fs.writeFileSync(path.join(artifactsDir, 'fixture.json'), JSON.stringify(enriched, null, 2))

  try {
    const dashboards = await listDashboards()
    console.log(
      `[menu-smoke] fixture ready db=${fixture.database} perses=${fixture.persesDashboard} (${fixture.persesStrategy}) dashboards=${dashboards.length}`
    )
  } catch {
    console.log(`[menu-smoke] fixture ready db=${fixture.database} perses=${fixture.persesDashboard}`)
  }

  process.env.SMOKE_DB_NAME = fixture.database
  process.env.SMOKE_FIXTURE_PATH = fixturePath
}
