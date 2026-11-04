import { describe, it, expect, vi, beforeEach } from 'vitest'

const runSQL = vi.fn()
vi.mock('@/api/editor', () => ({ default: { runSQL: (...args: unknown[]) => runSQL(...args) } }))

import { canSuggestColumnValues, fetchColumnDistinctValues } from './attribute-sampling'

describe('column value suggestions', () => {
  it('suggests enumerable string columns', () => {
    for (const name of ['service_name', 'span_name', 'span_kind', 'span_status_code', 'scope_name']) {
      expect(canSuggestColumnValues({ name, data_type: 'String' })).toBe(true)
    }
  })

  it('skips typed, identity and payload columns', () => {
    expect(canSuggestColumnValues({ name: 'duration_nano', data_type: 'Int64' })).toBe(false)
    expect(canSuggestColumnValues({ name: 'timestamp', data_type: 'TimestampNanosecond' })).toBe(false)
    expect(canSuggestColumnValues({ name: 'trace_id', data_type: 'String' })).toBe(false)
    expect(canSuggestColumnValues({ name: 'parent_span_id', data_type: 'String' })).toBe(false)
    expect(canSuggestColumnValues({ name: 'user_id', data_type: 'String' })).toBe(false)
    expect(canSuggestColumnValues({ name: 'span_events', data_type: 'Json' })).toBe(false)
  })
})

describe('fetchColumnDistinctValues', () => {
  beforeEach(() => runSQL.mockReset())

  it('queries DISTINCT on the column and sorts the values', async () => {
    runSQL.mockResolvedValueOnce({
      output: [
        { records: { schema: { column_schemas: [{ name: 'value' }] }, rows: [['zeta'], ['alpha'], ['alpha'], ['']] } },
      ],
    })

    const values = await fetchColumnDistinctValues({
      database: 'public',
      table: 'opentelemetry_traces_v2',
      column: 'service_name',
    })

    expect(values).toEqual(['alpha', 'zeta'])
    const sql = String(runSQL.mock.calls[0]?.[0] ?? '')
    expect(sql).toContain('SELECT DISTINCT "service_name" AS value')
    expect(sql).toContain('WHERE "service_name" IS NOT NULL')
    expect(sql).toContain('LIMIT 200')
  })
})
