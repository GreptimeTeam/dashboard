import { describe, it, expect, vi, beforeEach } from 'vitest'

const runSQL = vi.fn()
vi.mock('@/api/editor', () => ({ default: { runSQL: (...args: unknown[]) => runSQL(...args) } }))

import { canSuggestValues, fetchDistinctValues, resolveSuggestFieldType } from './value-suggestions'

describe('canSuggestValues — one policy for Explore and the SQL builder', () => {
  it('suggests enumerable string fields', () => {
    expect(canSuggestValues({ name: 'service_name', dataType: 'String' })).toBe(true)
    expect(canSuggestValues({ name: 'span_kind', dataType: 'String' })).toBe(true)
    expect(canSuggestValues({ name: 'span_attributes.http.method', dataType: 'STRING' })).toBe(true)
  })

  it('skips typed, identity and payload fields', () => {
    expect(canSuggestValues({ name: 'duration_nano', dataType: 'Int64' })).toBe(false)
    expect(canSuggestValues({ name: 'span_attributes.response_size', dataType: 'BIGINT' })).toBe(false)
    expect(canSuggestValues({ name: 'span_attributes.cached', dataType: 'BOOLEAN' })).toBe(false)
    expect(canSuggestValues({ name: 'timestamp', dataType: 'TimestampNanosecond' })).toBe(false)
    expect(canSuggestValues({ name: 'trace_id', dataType: 'String' })).toBe(false)
    expect(canSuggestValues({ name: 'user_id', dataType: 'String' })).toBe(false)
    expect(canSuggestValues({ name: 'span_events', dataType: 'Json' })).toBe(false)
    expect(canSuggestValues({ name: 'span_attributes.request_id', dataType: 'STRING', cardinality: 'high' })).toBe(
      false
    )
  })

  it('skips IN lists and keeps unknown types suggestable', () => {
    expect(canSuggestValues({ name: 'service_name', dataType: 'String' }, 'IN')).toBe(false)
    expect(canSuggestValues({ name: 'service_name', dataType: 'String' }, 'NOT IN')).toBe(false)
    // Unsampled chip keys have no type; they were already offered as filterable keys.
    expect(canSuggestValues({ name: 'span_attributes.legacy_key' })).toBe(true)
  })
})

describe('resolveSuggestFieldType', () => {
  it('resolves fieldMap aliases to the physical column type', () => {
    const columnTypes = { duration_nano: 'Int64', timestamp: 'TimestampNanosecond', service_name: 'String' }
    const fieldMap = { duration: 'duration_nano', time: 'timestamp', service: 'service_name' }
    expect(resolveSuggestFieldType('duration', { fieldMap, columnTypes })).toBe('Int64')
    expect(resolveSuggestFieldType('time', { fieldMap, columnTypes })).toBe('TimestampNanosecond')
    expect(resolveSuggestFieldType('service', { fieldMap, columnTypes })).toBe('String')
  })

  it('falls back to the sampled attribute type for chips', () => {
    expect(resolveSuggestFieldType('span_attributes.http.method', { attributeType: 'STRING' })).toBe('STRING')
  })
})

describe('fetchDistinctValues', () => {
  beforeEach(() => runSQL.mockReset())

  it('reads a physical column with the table and limit', async () => {
    runSQL.mockResolvedValueOnce({
      output: [
        { records: { schema: { column_schemas: [{ name: 'value' }] }, rows: [['zeta'], ['alpha'], ['alpha'], ['']] } },
      ],
    })

    const values = await fetchDistinctValues({
      database: 'public',
      table: 'opentelemetry_traces_v2',
      source: { kind: 'column', column: 'service_name' },
    })

    expect(values).toEqual(['alpha', 'zeta'])
    const sql = String(runSQL.mock.calls[0]?.[0] ?? '')
    expect(sql).toContain('SELECT DISTINCT "service_name" AS value')
    expect(sql).toContain('WHERE "service_name" IS NOT NULL')
    expect(sql).toContain('LIMIT 200')
  })

  it('reads a JSON2 attribute through a JSON path', async () => {
    runSQL.mockResolvedValueOnce({
      output: [{ records: { schema: { column_schemas: [{ name: 'value' }] }, rows: [['GET'], ['POST']] } }],
    })

    await fetchDistinctValues({
      database: 'public',
      table: 'opentelemetry_traces_v2',
      source: { kind: 'attribute', column: 'span_attributes', path: 'http.method' },
    })

    const sql = String(runSQL.mock.calls[0]?.[0] ?? '')
    expect(sql).toContain(`json_get_string("span_attributes", '$."http.method"') AS value`)
    expect(sql).toContain(`json_get_string("span_attributes", '$."http.method"') IS NOT NULL`)
  })

  it('applies the Explore window and other filters when given', async () => {
    runSQL.mockResolvedValueOnce({
      output: [{ records: { schema: { column_schemas: [{ name: 'value' }] }, rows: [['frontend']] } }],
    })

    await fetchDistinctValues({
      database: 'public',
      table: 'opentelemetry_traces_v2',
      source: { kind: 'column', column: 'span_name' },
      timeColumn: 'timestamp',
      timeRange: [100, 200],
      extraWhere: [`"service_name" = 'frontend'`],
    })

    const sql = String(runSQL.mock.calls[0]?.[0] ?? '')
    expect(sql).toContain('"timestamp" >= FROM_UNIXTIME(100)')
    expect(sql).toContain('"timestamp" <= FROM_UNIXTIME(200)')
    expect(sql).toContain(`"service_name" = 'frontend'`)
  })
})
