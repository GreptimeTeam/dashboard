import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

import { fetchBreakdownAttrValues } from './traces'
import { BREAKDOWN_CARD_LIMIT } from '../traces/red-queries'
import type { DrilldownContext } from '../context'

const runSQL = vi.fn()

vi.mock('@/api/editor', () => ({ default: { runSQL: (...args: unknown[]) => runSQL(...args) } }))
vi.mock('../signal-database', () => ({ boundSignalDatabase: () => 'public' }))

const COLUMNS = ['timestamp', 'parent_span_id', 'trace_id', 'span_name', 'service_name', 'duration_nano']

function fakeCtx(): DrilldownContext {
  return {
    semantics: {
      traces: {
        table: ref('opentelemetry_traces'),
        database: ref('public'),
        columns: ref(COLUMNS),
        columnTypes: ref({}),
        fieldMap: ref({ time: 'timestamp', parentSpanId: 'parent_span_id' }),
      },
      logs: { database: ref('public') },
    },
    connection: { databaseFor: () => 'public' },
    query: { unixTimeRange: () => [0, 0], filters: ref([]) },
    ui: { spanScope: ref('root') },
    session: { traceLogs: { traceServices: new Map() } },
  } as unknown as DrilldownContext
}

/** One group per row: [service_name, metric_value]. */
function rowsResponse(count: number) {
  const rows = Array.from({ length: count }, (_, index) => [`svc-${index}`, count - index])
  return {
    output: [
      {
        records: {
          schema: { column_schemas: [{ name: 'service_name' }, { name: 'metric' }] },
          rows,
        },
      },
    ],
  }
}

describe('fetchBreakdownAttrValues', () => {
  beforeEach(() => {
    runSQL.mockReset()
  })

  it('caps the cards at the limit and flags truncation when more groups exist', async () => {
    runSQL.mockResolvedValueOnce(rowsResponse(BREAKDOWN_CARD_LIMIT + 1))

    const result = await fetchBreakdownAttrValues(fakeCtx(), 'rate', ['service_name'])

    expect(result.values).toHaveLength(BREAKDOWN_CARD_LIMIT)
    expect(result.truncated).toBe(true)
    expect(result.values[0]).toMatchObject({ value: 'svc-0', parts: ['svc-0'] })
    // The query asks for one extra row so truncation can be detected without a COUNT.
    expect(String(runSQL.mock.calls[0]?.[0] ?? '')).toContain(`LIMIT ${BREAKDOWN_CARD_LIMIT + 1}`)
  })

  it('does not flag truncation when the groups fit within the limit', async () => {
    runSQL.mockResolvedValueOnce(rowsResponse(BREAKDOWN_CARD_LIMIT))

    const result = await fetchBreakdownAttrValues(fakeCtx(), 'rate', ['service_name'])

    expect(result.values).toHaveLength(BREAKDOWN_CARD_LIMIT)
    expect(result.truncated).toBe(false)
  })

  it('returns an empty, non-truncated result when the query fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    runSQL.mockRejectedValueOnce(new Error('boom'))

    const result = await fetchBreakdownAttrValues(fakeCtx(), 'rate', ['service_name'])

    expect(result).toEqual({ values: [], truncated: false })
    consoleError.mockRestore()
  })
})
