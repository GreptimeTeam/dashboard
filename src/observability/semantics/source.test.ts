import { beforeEach, describe, expect, it, vi } from 'vitest'

import editorApi from '@/api/editor'
import {
  clearSemanticsCache,
  declaredMetricKindFromSemantics,
  declaredMetricUnitFromSemantics,
  declaredTemporalityFromSemantics,
  ensureSemanticsLoaded,
  getTableEntityDeclarations,
  getTableSemantics,
  mapDeclaredMetricType,
} from './source'
import { resolveEntityIdentity } from './resolve'
import type { MetricTableSemantics } from './types'
import { mapUcumToPanelUnit, resolveMetricPanelUnit } from '../metrics/metric-units'
import { inferPromQL, shouldApplyRate } from '../metrics/infer-promql'

vi.mock('@/api/editor', () => ({
  default: {
    runSQL: vi.fn(),
  },
}))

// Keeps the pinia-backed current-database helper out of the module graph.
vi.mock('../current-database', () => ({
  currentDatabase: () => 'public',
}))

const runSQL = vi.mocked(editorApi.runSQL)

const SEMANTICS_SCHEMAS = [
  { name: 'table_name' },
  { name: 'signal_type' },
  { name: 'source' },
  { name: 'metadata_quality' },
  { name: 'semantic_options' },
  { name: 'entity_declarations' },
]

function sqlResult(rows: unknown[][]) {
  return {
    output: [
      {
        records: {
          schema: { column_schemas: SEMANTICS_SCHEMAS },
          rows,
        },
      },
    ],
  }
}

describe('semantics/source', () => {
  beforeEach(() => {
    clearSemanticsCache()
    runSQL.mockReset()
  })

  it('maps the DB-side metric.type whitelist', () => {
    expect(mapDeclaredMetricType('counter')).toBe('counter')
    expect(mapDeclaredMetricType('histogram')).toBe('histogram')
    expect(mapDeclaredMetricType('gauge')).toBe('gauge')
    expect(mapDeclaredMetricType('updown_counter')).toBe('updown_counter')
    expect(mapDeclaredMetricType('summary')).toBe('summary')
    expect(mapDeclaredMetricType('gauge_histogram')).toBe('gauge_histogram')
    expect(mapDeclaredMetricType('info')).toBe('gauge')
    expect(mapDeclaredMetricType('stateset')).toBe('gauge')
    // Server-side "I do not know" sentinels must not fall back to a name guess.
    expect(mapDeclaredMetricType('mixed')).toBe('unknown')
    expect(mapDeclaredMetricType('unknown')).toBe('unknown')
    // Not in the DB whitelist, so these can never appear.
    expect(mapDeclaredMetricType('ExponentialHistogram')).toBeNull()
    expect(mapDeclaredMetricType('updowncounter')).toBeNull()
    expect(mapDeclaredMetricType('mystery')).toBeNull()
  })

  it('gates only kind on metadata_quality; unit/temporality are usable when present', () => {
    const declared: MetricTableSemantics = {
      tableName: 'gen_ai_client_token_usage',
      metadataQuality: 'declared',
      metricType: 'histogram',
      metricUnit: 's',
      metricTemporality: 'cumulative',
    }
    expect(declaredMetricKindFromSemantics(declared)).toBe('histogram')
    expect(declaredMetricUnitFromSemantics(declared)).toBe('s')
    expect(declaredTemporalityFromSemantics(declared)).toBe('cumulative')

    const inferred: MetricTableSemantics = {
      ...declared,
      metadataQuality: 'inferred',
    }
    expect(declaredMetricKindFromSemantics(inferred)).toBeNull()
    // `metadata_quality` describes `metric.type` only — the unit is never guessed.
    expect(declaredMetricUnitFromSemantics(inferred)).toBe('s')
    expect(declaredTemporalityFromSemantics(inferred)).toBe('cumulative')
    expect(declaredMetricUnitFromSemantics(null)).toBeNull()
    expect(declaredTemporalityFromSemantics(null)).toBeNull()
  })

  it('ensureMetricSemanticsLoaded caches core fields; get never issues LIMIT 1', async () => {
    runSQL.mockResolvedValueOnce(
      sqlResult([
        [
          'http_requests_total',
          'metric',
          'otlp',
          'declared',
          { 'metric.type': 'counter', 'metric.unit': '{request}', 'metric.temporality': 'cumulative' },
        ],
      ]) as never
    )

    const [hit, miss] = await Promise.all([
      getTableSemantics('http_requests_total'),
      getTableSemantics('no_such_metric'),
    ])
    expect(runSQL).toHaveBeenCalledTimes(1)
    // The dump is deliberately not filtered by signal_type: entity declarations live
    // outside metric rows, so it is scoped by schema only.
    expect(String(runSQL.mock.calls[0][0])).toContain('entity_declarations')
    expect(String(runSQL.mock.calls[0][0])).toContain("table_schema = 'public'")
    expect(String(runSQL.mock.calls[0][0])).not.toContain('LIMIT 1')

    expect(hit).toMatchObject({
      tableName: 'http_requests_total',
      metadataQuality: 'declared',
      metricType: 'counter',
      metricUnit: '{request}',
      metricTemporality: 'cumulative',
    })
    expect(miss).toBeNull()

    await ensureSemanticsLoaded()
    expect(runSQL).toHaveBeenCalledTimes(1)
  })

  it('treats transient load failure as empty semantics and retries on the next access', async () => {
    runSQL.mockRejectedValueOnce(new Error('network blip'))
    expect(await getTableSemantics('solo_metric')).toBeNull()
    expect(runSQL).toHaveBeenCalledTimes(1)

    // Transient failures do not settle the dump — the next lookup retries the read.
    runSQL.mockResolvedValueOnce({ output: [{ records: { schema: { column_schemas: [{ name: 'table_name' }] }, rows: [] } }] } as never)
    expect(await getTableSemantics('solo_metric')).toBeNull()
    expect(runSQL).toHaveBeenCalledTimes(2)
  })
})

describe('entity identities', () => {
  const SERVICE_DECLARATION = JSON.stringify([
    {
      entity_type: 'service',
      origin: 'convention',
      id: ['service_name'],
      id_qualifier: 'resource_attributes.service.namespace',
    },
  ])

  beforeEach(() => {
    clearSemanticsCache()
    runSQL.mockReset()
  })

  it('prefers declarations and places paths against the table columns', async () => {
    runSQL.mockResolvedValueOnce(
      sqlResult([['opentelemetry_traces', 'trace', 'opentelemetry', null, null, SERVICE_DECLARATION]]) as never
    )

    await expect(
      resolveEntityIdentity('opentelemetry_traces', 'service', [
        { name: 'service_name' },
        { name: 'resource_attributes.service.namespace' },
      ])
    ).resolves.toEqual({
      entityType: 'service',
      origin: 'declaration',
      id: [{ column: 'service_name' }],
      idQualifier: { column: 'resource_attributes.service.namespace' },
    })
  })

  it('reads nested paths out of a JSON container column', async () => {
    runSQL.mockResolvedValueOnce(
      sqlResult([
        [
          'opentelemetry_logs',
          'log',
          'opentelemetry',
          null,
          null,
          JSON.stringify([{ entity_type: 'service', origin: 'convention', id: ['resource_attributes.service.name'] }]),
        ],
      ]) as never
    )

    const identity = await resolveEntityIdentity('opentelemetry_logs', 'service', [
      { name: 'resource_attributes', data_type: 'json' },
    ])
    expect(identity?.id).toEqual([{ column: 'resource_attributes', jsonKey: 'service.name' }])
  })

  it('falls back to the trace model shape, and to null without either', async () => {
    runSQL.mockResolvedValueOnce(
      sqlResult([['opentelemetry_traces', 'trace', 'opentelemetry', null, null, null]]) as never
    )
    const traceColumns = ['trace_id', 'parent_span_id', 'timestamp', 'span_name', 'service_name'].map((name) => ({
      name,
    }))

    await expect(resolveEntityIdentity('opentelemetry_traces', 'service', traceColumns)).resolves.toEqual({
      entityType: 'service',
      origin: 'model',
      id: [{ column: 'service_name' }],
    })
    await expect(resolveEntityIdentity('opentelemetry_traces', 'container', traceColumns)).resolves.toBeNull()
  })

  it('exposes declarations for tables that carry no other semantics', async () => {
    runSQL.mockResolvedValueOnce(sqlResult([['web_trace_demo', null, null, null, null, SERVICE_DECLARATION]]) as never)

    await expect(getTableEntityDeclarations('web_trace_demo')).resolves.toEqual([
      {
        entityType: 'service',
        origin: 'convention',
        id: ['service_name'],
        idQualifier: 'resource_attributes.service.namespace',
        supersededBy: undefined,
      },
    ])
  })
})

describe('UCUM unit mapping', () => {
  it('maps common UCUM to panel units', () => {
    expect(mapUcumToPanelUnit('s', false)).toBe('s')
    expect(mapUcumToPanelUnit('s', true)).toBe('none')
    expect(mapUcumToPanelUnit('By', false)).toBe('bytes')
    expect(mapUcumToPanelUnit('By', true)).toBe('Bps')
    expect(mapUcumToPanelUnit('1', false)).toBe('percentunit')
    expect(mapUcumToPanelUnit('{request}', true)).toBe('ucum:request/s')
    expect(mapUcumToPanelUnit('{token}', false)).toBe('ucum:token')
  })

  it('prefers semantic unit over name heuristic', () => {
    expect(resolveMetricPanelUnit('drilldown_demo_cpu_usage', false, { semanticUnit: '1' })).toBe('percentunit')
    expect(resolveMetricPanelUnit('http_requests_total', true, { semanticUnit: '{request}' })).toBe('ucum:request/s')
    expect(resolveMetricPanelUnit('http_requests_total', true)).toBe('cps')
  })
})

describe('temporality / rate', () => {
  it('skips rate for delta counters', () => {
    expect(shouldApplyRate('counter', 'cumulative')).toBe(true)
    expect(shouldApplyRate('counter', 'delta')).toBe(false)
    expect(inferPromQL('demo_total', undefined, { kind: 'counter', temporality: 'delta' })).toBe('sum(demo_total)')
    expect(inferPromQL('demo_total', undefined, { kind: 'counter', temporality: 'cumulative' })).toBe(
      'sum(rate(demo_total[5m]))'
    )
  })
})
