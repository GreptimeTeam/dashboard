import fs from 'node:fs'
import path from 'node:path'
import { deleteDashboard, deletePipeline } from './http'
import { dropFlow, dropSmokeDatabase } from './seed'
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

export default async function globalTeardown() {
  if (process.env.SMOKE_SKIP_FIXTURE === '1') {
    console.log('[menu-smoke] SKIP_FIXTURE — teardown noop')
    return
  }

  const fixturePath = path.resolve(process.cwd(), process.env.SMOKE_FIXTURE_PATH || FIXTURE_RELATIVE)
  if (!fs.existsSync(fixturePath)) {
    console.warn(`[menu-smoke] no fixture at ${fixturePath}`)
    return
  }

  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as SmokeFixture & {
    pipelineVersion?: string | null
  }

  const errors: string[] = []

  if (fixture.pipelineName) {
    try {
      const version = fixture.pipelineVersion || (await latestPipelineVersion(fixture.pipelineName))
      if (version) {
        await deletePipeline(fixture.pipelineName, version, { database: fixture.database })
      }
    } catch (error) {
      errors.push(`pipeline: ${error instanceof Error ? error.message : error}`)
    }
  }

  if (fixture.flowName) {
    try {
      await dropFlow(fixture.database, fixture.flowName)
    } catch (error) {
      errors.push(`flow: ${error instanceof Error ? error.message : error}`)
    }
  }

  if (fixture.persesCreated && fixture.persesDashboard) {
    try {
      await deleteDashboard(fixture.persesDashboard)
    } catch (error) {
      errors.push(`perses: ${error instanceof Error ? error.message : error}`)
    }
  }

  try {
    await dropSmokeDatabase(fixture.database)
  } catch (error) {
    errors.push(`drop db: ${error instanceof Error ? error.message : error}`)
  }

  if (errors.length) {
    console.warn(`[menu-smoke] teardown warnings:\n- ${errors.join('\n- ')}`)
  } else {
    console.log(`[menu-smoke] teardown ok — dropped ${fixture.database}`)
  }
}
