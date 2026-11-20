import { SMOKE_METRIC_NAME } from './fixtures/seed'
import type { SmokeFixture } from './fixtures/types'

export type ActionKind = 'query' | 'metrics' | 'logs' | 'pipeline' | 'traces' | 'ingest' | 'flow' | 'explore' | 'perses'

export type SmokePage = {
  file: string
  name: string
  label: string
  /** Path + search for vue-router.push (no hash). */
  path: string
  action: ActionKind
}

function builderForm(params: Record<string, unknown>): string {
  return encodeURIComponent(JSON.stringify(params))
}

export function buildCatalog(fixture: SmokeFixture): SmokePage[] {
  const db = fixture.database
  const logsForm = builderForm({
    table: 'opentelemetry_logs',
    conditions: [],
    orderByField: 'timestamp',
    orderBy: 'DESC',
    limit: 1000,
    tsColumn: { name: 'timestamp', data_type: 'TimestampNanosecond' },
    database: db,
  })
  const tracesForm = builderForm({
    table: 'web_trace_demo',
    conditions: [
      {
        field: 'parent_span_id',
        operator: 'Not Exist',
        value: '',
        relation: 'AND',
      },
    ],
    orderByField: 'timestamp',
    orderBy: 'DESC',
    limit: 1000,
    tsColumn: { name: 'timestamp', data_type: 'TimestampNanosecond' },
    database: db,
  })

  const persesPath = fixture.persesDashboard
    ? `/dashboard/perses?dashboard=${encodeURIComponent(fixture.persesDashboard)}`
    : '/dashboard/perses'

  return [
    {
      file: '01-query.png',
      name: 'query',
      label: 'Table 查询',
      path: '/dashboard/query?sql=SELECT%201%20AS%20smoke_ok',
      action: 'query',
    },
    {
      file: '02-metrics-query.png',
      name: 'metrics',
      label: 'Metrics 查询',
      // Graph tab + relative 30m so seeded smoke_ready_metric has recent points.
      path: `/dashboard/metrics-query?promql=${encodeURIComponent(SMOKE_METRIC_NAME)}&tab=graph&timeLength=30`,
      action: 'metrics',
    },
    {
      file: '03-logs-query.png',
      name: 'logs-query',
      label: 'Logs 查询',
      path: `/dashboard/logs-query?editorType=builder&timeLength=-1&tourApply=1&builderForm=${logsForm}`,
      action: 'logs',
    },
    {
      file: '04-logs-pipeline.png',
      name: 'logs-pipelines',
      label: 'Logs Pipeline',
      path: '/dashboard/logs-pipelines',
      action: 'pipeline',
    },
    {
      file: '05-traces.png',
      name: 'traces',
      label: 'Traces 查询',
      path: `/dashboard/traces?editorType=builder&timeLength=-1&tourApply=1&builderForm=${tracesForm}`,
      action: 'traces',
    },
    {
      file: '06-ingest.png',
      name: 'ingest',
      label: '写入 Influx',
      path: '/dashboard/ingest/influxdb-line-protocol/input',
      action: 'ingest',
    },
    {
      file: '07-flow.png',
      name: 'flow',
      label: 'Flow',
      path: '/dashboard/flow',
      action: 'flow',
    },
    {
      file: '08-explore.png',
      name: 'explore',
      label: '信号探索',
      path: `/dashboard/explore?signal=metrics&timeLength=30`,
      action: 'explore',
    },
    {
      file: '09-perses.png',
      name: 'perses',
      label: '可视化',
      path: persesPath,
      action: 'perses',
    },
  ]
}
