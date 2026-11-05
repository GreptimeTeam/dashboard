import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computed, ref } from 'vue'

const runSQL = vi.fn()
vi.mock('@/api/editor', () => ({ default: { runSQL: (...args: unknown[]) => runSQL(...args) } }))
vi.mock('@/api/metrics', () => ({ getLabelNames: async () => [], getLabelValues: async () => [] }))
vi.mock('@/store/modules/table-schema', () => ({
  default: () => ({
    ensureTableSchema: async () => [
      { name: 'ts', data_type: 'TimestampNanosecond', semantic_type: 'TIMESTAMP' },
      { name: 'service', data_type: 'String' },
      { name: 'env', data_type: 'String' },
      { name: 'level', data_type: 'String' },
      { name: 'message', data_type: 'String' },
      { name: 'logattributes', data_type: 'Json2' },
      { name: 'resourceattributes', data_type: 'Json2' },
    ],
  }),
}))
vi.mock('../signal-database', () => ({ boundSignalDatabase: () => 'public' }))
vi.mock('../drilldown-settings', () => ({ loadDrilldownSettings: () => ({ logs: {} }) }))
vi.mock('./traces', () => ({ fetchTraceAttributeKeys: async () => [] }))
vi.mock('../traces/attribute-sampling', () => ({ fetchTableAttributeKeys: async () => [] }))

import { canSuggestFilterValues, fetchSqlLabelValues } from './filter-options'

const FIELD_MAP = { time: 'ts' }

const ctx = {
  connection: { signal: ref('logs'), databaseFor: () => 'public', logsDatabase: ref('public') },
  query: { unixTimeRange: () => [], filters: ref([]) },
  semantics: {
    logs: {
      database: ref('public'),
      table: ref('logs_attr_test'),
      fieldMap: ref(FIELD_MAP),
      columnTypes: ref({ service: 'String', env: 'String', level: 'String' }),
      entityFilterKeys: ref({}),
      revision: ref(1),
      ready: computed(() => true),
    },
  },
  ui: { logsView: ref('detail'), metric: ref(undefined) },
} as any

function valuesResponse(values: string[]) {
  return { output: [{ records: { schema: { column_schemas: [{ name: 'value' }] }, rows: values.map((v) => [v]) } }] }
}

describe('logs value suggestions', () => {
  beforeEach(() => runSQL.mockReset())

  it('suggests values for enumerable string columns even when they are not OTEL labels', async () => {
    // No `severity_text` / `service_name` in this table, so roles stay unresolved and every
    // string column used to be treated as free text ("contains") — and skipped.
    expect(canSuggestFilterValues('level', FIELD_MAP, ['level'])).toBe(true)
    expect(canSuggestFilterValues('service', FIELD_MAP, ['service'])).toBe(true)

    runSQL.mockResolvedValueOnce(valuesResponse(['ERROR', 'INFO']))
    const values = await fetchSqlLabelValues(ctx, 'level', { signal: 'logs', labelKeys: ['level'] })

    expect(values).toEqual(['ERROR', 'INFO'])
    const sql = String(runSQL.mock.calls[0]?.[0] ?? '')
    expect(sql).toContain('SELECT DISTINCT "level" AS value')
  })

  it('skips body-like columns even when the body role was never mapped', async () => {
    // `message` / `content` read as free text even without a role mapping.
    expect(canSuggestFilterValues('message', FIELD_MAP, ['message'])).toBe(false)
    expect(canSuggestFilterValues('content', FIELD_MAP, ['content'])).toBe(false)
    // Enumerable names stay suggestable.
    expect(canSuggestFilterValues('level', FIELD_MAP, ['level'])).toBe(true)
    expect(canSuggestFilterValues('env', FIELD_MAP, ['env'])).toBe(true)
  })

  it('skips the body role (free text)', async () => {
    const bodyCtx = {
      ...ctx,
      semantics: {
        logs: { ...ctx.semantics.logs, fieldMap: ref({ time: 'ts', body: 'message' }) },
      },
    }
    expect(canSuggestFilterValues('message', { time: 'ts', body: 'message' }, [])).toBe(false)

    const values = await fetchSqlLabelValues(bodyCtx, 'message', { signal: 'logs', labelKeys: [] })
    expect(values).toEqual([])
    expect(runSQL).not.toHaveBeenCalled()
  })

  it('suggests values for a JSON attribute chip', async () => {
    runSQL.mockResolvedValueOnce(valuesResponse(['checkout', 'search']))
    const values = await fetchSqlLabelValues(ctx, 'logattributes.endpoint', { signal: 'logs', labelKeys: [] })

    expect(values).toEqual(['checkout', 'search'])
    expect(String(runSQL.mock.calls[0]?.[0] ?? '')).toContain(`json_get_string("logattributes", '$."endpoint"')`)
  })
})
