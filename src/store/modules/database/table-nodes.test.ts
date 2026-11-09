import { describe, expect, it } from 'vitest'
import type { RecordsType } from '../code-run/types'
import buildTableNodes from './table-nodes'

function records(columns: string[], rows: string[][]): RecordsType {
  return {
    schema: { column_schemas: columns.map((name) => ({ name, data_type: 'String', semantic_type: '' })) },
    rows,
  } as unknown as RecordsType
}

describe('buildTableNodes', () => {
  it('maps rows to nodes by column name, not by position', () => {
    const data = records(
      ['table_type', 'table_name', 'create_options', 'engine'],
      [
        ['BASE TABLE', 'metrics', 'ttl=7d', 'mito'],
        ['BASE TABLE', 'logs', '', 'mito'],
      ]
    )

    const nodes = buildTableNodes(data)

    expect(nodes.map((node) => node.title)).toEqual(['metrics', 'logs'])
    expect(nodes.map((node) => node.key)).toEqual([0, 1])
    expect(nodes[0]).toMatchObject({
      tableType: 'BASE TABLE',
      engine: 'mito',
      childrenType: 'columns',
      isLeaf: false,
      children: [],
      columns: [],
      details: [],
    })
  })

  it('applies keyBase so keys stay stable across pages', () => {
    const data = records(['table_name', 'engine'], [['t_2000', 'mito']])
    expect(buildTableNodes(data, 2000)[0].key).toBe(2000)
  })

  it('resolves logical metric tables from create_options', () => {
    const data = records(
      ['table_name', 'table_type', 'engine', 'create_options'],
      [
        ['http_requests', 'BASE TABLE', 'metric', 'on_physical_table=greptime_physical_metric'],
        ['greptime_physical_metric', 'BASE TABLE', 'metric', 'physical_metric_table=true'],
      ]
    )

    const [logical, physical] = buildTableNodes(data)

    expect(logical).toMatchObject({
      isLogicalTable: true,
      isPhysicalMetricTable: false,
      physicalTableName: 'greptime_physical_metric',
    })
    expect(physical).toMatchObject({ isLogicalTable: false, isPhysicalMetricTable: true })
  })

  it('returns an empty list for empty / missing records', () => {
    expect(buildTableNodes(undefined)).toEqual([])
    expect(buildTableNodes(records(['table_name'], []))).toEqual([])
  })

  it('tolerates a narrow select without optional columns', () => {
    const nodes = buildTableNodes(records(['table_name'], [['only_name']]))
    expect(nodes[0]).toMatchObject({ title: 'only_name', engine: undefined, tableType: undefined })
  })
})
