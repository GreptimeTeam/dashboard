import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

import { buildTracesContextWhere, fetchRedTimeseries, fetchRootSpanList } from './traces'
import type { DrilldownContext } from '../context'
import type { SpanScope } from '../traces/red-queries'

const runSQL = vi.fn()

vi.mock('@/api/editor', () => ({ default: { runSQL: (...args: unknown[]) => runSQL(...args) } }))
vi.mock('../signal-database', () => ({ boundSignalDatabase: () => 'public' }))

const COLUMNS = ['timestamp', 'parent_span_id', 'trace_id', 'span_name', 'service_name', 'duration_nano']

function fakeCtx(scope: SpanScope, filters: Array<{ key: string; op: string; value: string }> = []): DrilldownContext {
  return {
    semantics: {
      traces: {
        table: ref('opentelemetry_traces'),
        database: ref('public'),
        columns: ref(COLUMNS),
        columnTypes: ref({}),
        fieldMap: ref({ time: 'timestamp', parentSpanId: 'parent_span_id', traceId: 'trace_id' }),
      },
      logs: { database: ref('public') },
    },
    connection: { databaseFor: () => 'public' },
    query: {
      unixTimeRange: () => [100, 200],
      filters: ref(filters),
      time: ref(30),
      rangeTime: ref([]),
    },
    ui: { spanScope: ref(scope) },
    session: { traceLogs: { traceServices: new Map() } },
  } as unknown as DrilldownContext
}

function recordsResponse(columns: string[], rows: unknown[][]) {
  return {
    output: [{ records: { schema: { column_schemas: columns.map((name) => ({ name })) }, rows } }],
  }
}

const sqlAt = (index: number) => String(runSQL.mock.calls[index]?.[0] ?? '')

describe('span scope', () => {
  beforeEach(() => {
    runSQL.mockReset()
  })

  describe('buildTracesContextWhere', () => {
    it('restricts to root spans in root scope', () => {
      expect(buildTracesContextWhere(fakeCtx('root'))).toContain('"parent_span_id" IS NULL')
    })

    it('does not restrict to root spans in all scope', () => {
      expect(buildTracesContextWhere(fakeCtx('all'))).not.toContain('parent_span_id')
    })

    it('lets an explicit rootOnly override the scope', () => {
      expect(buildTracesContextWhere(fakeCtx('all'), { rootOnly: true })).toContain('"parent_span_id" IS NULL')
      expect(buildTracesContextWhere(fakeCtx('root'), { rootOnly: false })).not.toContain('parent_span_id')
    })

    it('drops label chips when includeFilters is false', () => {
      const ctx = fakeCtx('all', [{ key: 'service_name', op: '=', value: 'gateway' }])
      expect(buildTracesContextWhere(ctx)).toContain('gateway')
      expect(buildTracesContextWhere(ctx, { includeFilters: false })).not.toContain('gateway')
    })
  })

  describe('RED charts', () => {
    it('counts every span in all scope', async () => {
      runSQL.mockResolvedValue(recordsResponse(['time_bucket', 'metric_value'], []))
      await fetchRedTimeseries(fakeCtx('all'), 'rate')
      expect(sqlAt(0)).not.toContain('parent_span_id')
    })

    it('counts root spans only in root scope', async () => {
      runSQL.mockResolvedValue(recordsResponse(['time_bucket', 'metric_value'], []))
      await fetchRedTimeseries(fakeCtx('root'), 'rate')
      expect(sqlAt(0)).toContain('"parent_span_id" IS NULL')
    })
  })

  describe('fetchRootSpanList', () => {
    const LIST_COLUMNS = ['timestamp', 'trace_id', 'span_name']

    it('runs a single root query in root scope, error predicate included', async () => {
      runSQL.mockResolvedValue(recordsResponse(LIST_COLUMNS, []))
      await fetchRootSpanList(fakeCtx('root'), { redMetric: 'errors' })

      expect(runSQL).toHaveBeenCalledTimes(1)
      expect(sqlAt(0)).toContain('"parent_span_id" IS NULL')
      expect(sqlAt(0)).toContain('STATUS_CODE_ERROR')
    })

    it('stays a single root query in all scope for Rate without chips', async () => {
      runSQL.mockResolvedValue(recordsResponse(LIST_COLUMNS, []))
      await fetchRootSpanList(fakeCtx('all'), { redMetric: 'rate' })

      expect(runSQL).toHaveBeenCalledTimes(1)
      expect(sqlAt(0)).toContain('"parent_span_id" IS NULL')
    })

    it('finds error traces by any span, then reads their root rows by id', async () => {
      runSQL
        .mockResolvedValueOnce(recordsResponse(['trace_id'], [['t-1'], ['t-2']]))
        .mockResolvedValueOnce(recordsResponse(LIST_COLUMNS, [[1, 't-1', 'GET /a']]))

      const result = await fetchRootSpanList(fakeCtx('all'), { redMetric: 'errors' })

      expect(runSQL).toHaveBeenCalledTimes(2)
      // Step 1: any span, error condition applied here, no root restriction.
      expect(sqlAt(0)).toContain('GROUP BY "trace_id"')
      expect(sqlAt(0)).toContain('STATUS_CODE_ERROR')
      expect(sqlAt(0)).not.toContain('parent_span_id')
      // Step 2: root rows of those traces; the error condition is not re-applied to the root.
      expect(sqlAt(1)).toContain('"parent_span_id" IS NULL')
      expect(sqlAt(1)).toContain(`"trace_id" IN ('t-1', 't-2')`)
      expect(sqlAt(1)).not.toContain('STATUS_CODE_ERROR')
      expect(result.rows).toHaveLength(1)
    })

    it('applies label chips to the trace lookup, not to the root rows', async () => {
      runSQL
        .mockResolvedValueOnce(recordsResponse(['trace_id'], [['t-9']]))
        .mockResolvedValueOnce(recordsResponse(LIST_COLUMNS, []))

      await fetchRootSpanList(fakeCtx('all', [{ key: 'service_name', op: '=', value: 'db-svc' }]), {
        redMetric: 'rate',
      })

      expect(runSQL).toHaveBeenCalledTimes(2)
      expect(sqlAt(0)).toContain('db-svc')
      expect(sqlAt(1)).not.toContain('db-svc')
      expect(sqlAt(1)).toContain(`"trace_id" IN ('t-9')`)
    })

    it('still queries root rows (to keep the column schema) when no trace matches', async () => {
      runSQL
        .mockResolvedValueOnce(recordsResponse(['trace_id'], []))
        .mockResolvedValueOnce(recordsResponse(LIST_COLUMNS, []))

      const result = await fetchRootSpanList(fakeCtx('all'), { redMetric: 'errors' })

      expect(sqlAt(1)).toContain('1 = 0')
      expect(result.columns.map((column) => column.name)).toEqual(LIST_COLUMNS)
    })

    it('returns an empty list when the trace lookup fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      runSQL.mockRejectedValueOnce(new Error('boom'))

      const result = await fetchRootSpanList(fakeCtx('all'), { redMetric: 'errors' })

      expect(result).toEqual({ rows: [], columns: [] })
      expect(runSQL).toHaveBeenCalledTimes(1)
      consoleError.mockRestore()
    })
  })
})
