import { describe, it, expect, vi, beforeEach } from 'vitest'

const runSQL = vi.fn()
vi.mock('@/api/editor', () => ({ default: { runSQL: (...args: unknown[]) => runSQL(...args) } }))

import { fetchSampledAttributes, fetchTableAttributeKeys } from './attribute-sampling'

function rowsResponse(columns: string[], rows: unknown[][]) {
  return {
    output: [{ records: { schema: { column_schemas: columns.map((name) => ({ name })) }, rows } }],
  }
}

describe('fetchSampledAttributes — logs tables', () => {
  beforeEach(() => runSQL.mockReset())

  it('samples log_attributes without a parent-span filter', async () => {
    runSQL.mockResolvedValueOnce(
      rowsResponse(
        ['log_attributes', 'resource_attributes'],
        [
          [{ 'level': 'info', 'http.method': 'GET', 'latency_ms': 12 }, { 'service.name': 'api' }],
          [{ 'level': 'error', 'http.method': 'POST', 'latency_ms': 30 }, { 'service.name': 'api' }],
        ]
      )
    )

    const attributes = await fetchSampledAttributes({
      database: 'public',
      table: 'opentelemetry_logs',
      columns: ['ts', 'body', 'service_name', 'log_attributes', 'resource_attributes'],
      timeColumn: 'ts',
    })

    const sql = String(runSQL.mock.calls[0]?.[0] ?? '')
    expect(sql).toContain('"log_attributes"')
    expect(sql).not.toContain('parent_span_id')
    expect(sql).toContain('ORDER BY "ts" DESC')

    expect(attributes.map((attribute) => attribute.column)).toEqual([
      'resource_attributes.service.name',
      'log_attributes.http.method',
      'log_attributes.latency_ms',
      'log_attributes.level',
    ])
    expect(attributes.find((a) => a.column === 'log_attributes.latency_ms')?.dataType).toBe('BIGINT')
  })

  it('keeps the root-span scope for trace tables', async () => {
    runSQL.mockResolvedValueOnce(rowsResponse(['span_attributes'], [[{ 'http.method': 'GET' }]]))

    await fetchSampledAttributes({
      database: 'public',
      table: 'opentelemetry_traces_v2',
      columns: ['timestamp', 'parent_span_id', 'span_attributes'],
      parentColumn: 'parent_span_id',
      timeColumn: 'timestamp',
    })

    expect(String(runSQL.mock.calls[0]?.[0] ?? '')).toContain('WHERE "parent_span_id" IS NULL')
  })

  it('caches per database + table and publishes sampled types', async () => {
    runSQL.mockResolvedValueOnce(rowsResponse(['log_attributes'], [[{ level: 'info' }]]))
    const options = {
      database: 'public',
      table: 'logs_cache_probe',
      columns: ['ts', 'log_attributes'],
      timeColumn: 'ts',
    }

    await fetchTableAttributeKeys(options)
    await fetchTableAttributeKeys(options)
    expect(runSQL).toHaveBeenCalledTimes(1)
  })
})
