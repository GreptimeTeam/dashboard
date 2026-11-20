export type PersesStrategy = 'env' | 'reuse' | 'created'

export type SmokeFixture = {
  runId: string
  database: string
  createdAt: string
  pipelineName: string
  flowName: string
  persesDashboard: string
  persesStrategy: PersesStrategy
  /** Only delete on teardown when we created it this run. */
  persesCreated: boolean
  artifactsDir: string
}

export const FIXTURE_RELATIVE = 'artifacts/menu-smoke/latest/fixture.json'
