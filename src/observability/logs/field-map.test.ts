import { describe, expect, it, vi } from 'vitest'
import { discoverLabelColumns, type SchemaColumn } from './field-map'

vi.mock('@/api/editor', () => ({
  default: {
    getTableSchema: vi.fn(),
  },
}))

describe('discoverLabelColumns', () => {
  it('includes string FIELD dimensions when TAG is sparse', () => {
    const columns: SchemaColumn[] = [
      { name: 'timestamp', data_type: 'TimestampMillisecond', semantic_type: 'TIMESTAMP' },
      { name: 'message', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'level', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'pod', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'cluster', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'trace_id', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'line_no', data_type: 'Int64', semantic_type: 'FIELD' },
    ]

    expect(
      discoverLabelColumns(columns, {
        time: 'timestamp',
        body: 'message',
      })
    ).toEqual(['cluster', 'level', 'pod'])
  })

  it('keeps TAG columns and settings include', () => {
    const columns: SchemaColumn[] = [
      { name: 'ts', data_type: 'TimestampNanosecond', semantic_type: 'TIMESTAMP' },
      { name: 'client', data_type: 'String', semantic_type: 'TAG' },
      { name: 'country', data_type: 'String', semantic_type: 'FIELD' },
      { name: 'body', data_type: 'String', semantic_type: 'FIELD' },
    ]

    expect(
      discoverLabelColumns(columns, { time: 'ts', body: 'body', primaryGroupBy: 'client' }, { include: ['country'] })
    ).toEqual(['client', 'country'])
  })
})
