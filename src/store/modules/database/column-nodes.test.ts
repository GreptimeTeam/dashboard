import { describe, expect, it } from 'vitest'
import type { RecordsType } from '../code-run/types'
import buildColumnNodes from './column-nodes'

function records(columns: string[], rows: string[][]): RecordsType {
  return {
    schema: { column_schemas: columns.map((name) => ({ name, data_type: 'String', semantic_type: '' })) },
    rows,
  } as unknown as RecordsType
}

describe('buildColumnNodes', () => {
  it('maps DESC rows into column nodes', () => {
    const data = records(
      ['Column', 'Type', 'Key', 'Null', 'Default', 'Semantic Type'],
      [
        ['ts', 'TimestampMillisecond', 'PRI', 'NO', '', 'TIMESTAMP'],
        ['host', 'String', '', 'YES', '', 'FIELD'],
        ['service', 'String', '', 'YES', '', 'TAG'],
      ]
    )

    const { nodes, timeIndexName } = buildColumnNodes(data, 'http_requests', 42)

    expect(timeIndexName).toBe('ts')
    expect(nodes).toHaveLength(3)
    expect(nodes[0]).toMatchObject({
      title: 'ts',
      key: 'http_requests.ts',
      dataType: 'TimestampMillisecond',
      iconType: 'TIMESTAMP',
      parentKey: 42,
      isLeaf: true,
    })
    expect(nodes[2]).toMatchObject({ title: 'service', iconType: 'TAG' })
  })

  it('accepts information_schema column names too', () => {
    const data = records(['column_name', 'greptime_data_type', 'semantic_type'], [['value', 'Float64', 'FIELD']])
    const { nodes, timeIndexName } = buildColumnNodes(data, 't', 0)
    expect(nodes[0]).toMatchObject({ title: 'value', dataType: 'Float64', iconType: 'FIELD' })
    expect(timeIndexName).toBe('%TIMESTAMP%')
  })

  it('handles empty / missing records', () => {
    expect(buildColumnNodes(undefined, 't', 0)).toEqual({ nodes: [], timeIndexName: '%TIMESTAMP%' })
    expect(buildColumnNodes(records(['Column'], []), 't', 0).nodes).toEqual([])
  })
})
