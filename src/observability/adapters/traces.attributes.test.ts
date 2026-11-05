import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const runSQL = vi.fn()

vi.mock('@/api/editor', () => ({ default: { runSQL: (...args: unknown[]) => runSQL(...args) } }))
// The adapter resolves the bound database through the Pinia-backed helper; the test only
// needs a stable database name.
vi.mock('../signal-database', () => ({ boundSignalDatabase: () => 'public' }))

import { fetchTraceAttributeKeys } from './traces'
import type { DrilldownContext } from '../context'

function rowsResponse(rows: Array<Record<string, unknown>>) {
  const schema = ['span_attributes', 'scope_attributes', 'resource_attributes']
  return {
    output: [
      {
        records: {
          schema: { column_schemas: schema.map((name) => ({ name })) },
          rows: rows.map((row) => schema.map((name) => row[name])),
        },
      },
    ],
  }
}

function fakeCtx(columns: string[], table = 'opentelemetry_traces_v2'): DrilldownContext {
  return {
    semantics: {
      traces: {
        table: ref(table),
        database: ref('public'),
        columns: ref(columns),
        fieldMap: ref({ time: 'timestamp', parentSpanId: 'parent_span_id' }),
      },
      logs: { database: ref('public') },
    },
    connection: { databaseFor: () => 'public' },
    query: { unixTimeRange: () => [0, 0] },
    session: { traceLogs: { traceServices: new Map() } },
  } as unknown as DrilldownContext
}

const V2_COLUMNS = [
  'timestamp',
  'parent_span_id',
  'trace_id',
  'span_name',
  'service_name',
  'span_attributes',
  'scope_attributes',
  'resource_attributes',
]

describe('fetchTraceAttributeKeys', () => {
  beforeEach(() => {
    runSQL.mockReset()
  })

  it('samples JSON2 containers and returns attribute dimensions', async () => {
    runSQL.mockResolvedValueOnce(
      rowsResponse([
        {
          span_attributes: { 'http.method': 'GET', 'response_size': '94' },
          resource_attributes: { 'service.name': 'a' },
        },
        {
          span_attributes: { 'http.method': 'POST', 'response_size': '20' },
          resource_attributes: { 'service.name': 'b' },
        },
      ])
    )

    const attributes = await fetchTraceAttributeKeys(fakeCtx(V2_COLUMNS), V2_COLUMNS)

    expect(attributes.map((attribute) => attribute.column)).toEqual([
      'span_attributes.http.method',
      'span_attributes.response_size',
      'resource_attributes.service.name',
    ])
    expect(attributes.find((a) => a.column === 'span_attributes.response_size')?.dataType).toBe('BIGINT')
    // Sampling is root-scoped: the traces list and RED only ever filter root spans.
    const sql = String(runSQL.mock.calls[0]?.[0] ?? '')
    expect(sql).toContain('"parent_span_id" IS NULL')
    expect(sql).toContain('ORDER BY "timestamp" DESC')
  })

  it('caches per database + table', async () => {
    runSQL.mockResolvedValueOnce(rowsResponse([{ span_attributes: { 'http.method': 'GET' } }]))
    // Distinct table name: the adapter cache is module-level and keyed by database + table.
    const ctx = fakeCtx(V2_COLUMNS, 'opentelemetry_traces_v2_cache')

    await fetchTraceAttributeKeys(ctx, V2_COLUMNS)
    await fetchTraceAttributeKeys(ctx, V2_COLUMNS)

    expect(runSQL).toHaveBeenCalledTimes(1)
  })

  it('does not query v1 tables (attributes are columns there)', async () => {
    const v1Columns = [
      'timestamp',
      'parent_span_id',
      'trace_id',
      'span_name',
      'service_name',
      'span_attributes.http.method',
    ]
    const attributes = await fetchTraceAttributeKeys(fakeCtx(v1Columns), v1Columns)

    expect(attributes).toEqual([])
    expect(runSQL).not.toHaveBeenCalled()
  })
})
