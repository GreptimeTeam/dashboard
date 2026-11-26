import type { RecordsType, SchemaType } from '../code-run/types'
import type { TableTreeParent } from './types'
import { resolveMetricTableMeta } from './table-meta'

function findColumnIndex(schemas: SchemaType[], names: string[]): number {
  return schemas.findIndex((schema) => names.includes(schema.name))
}

/**
 * Convert an `information_schema.tables` result page into sidebar tree nodes.
 *
 * Pure (no store access) so the paged sidebar and other callers can share it. `keyBase` keeps keys stable across pages: a page loaded
 * at `offset` gets `offset + rowIndex`, so the same table always maps to the
 * same key regardless of load order.
 */
export default function buildTableNodes(records: RecordsType | undefined, keyBase = 0): TableTreeParent[] {
  if (!records) return []

  const schemas = records.schema?.column_schemas || []
  const tableNameIndex = findColumnIndex(schemas, ['table_name'])
  const tableTypeIndex = findColumnIndex(schemas, ['table_type'])
  const engineIndex = findColumnIndex(schemas, ['engine'])
  const createOptionsIndex = findColumnIndex(schemas, ['create_options'])

  return (records.rows || []).map((row: Array<string>, index: number) => {
    const engine = engineIndex >= 0 ? row[engineIndex] : undefined
    const createOptions = createOptionsIndex >= 0 ? row[createOptionsIndex] : undefined
    const metricTableMeta = resolveMetricTableMeta(engine, createOptions)

    return {
      title: tableNameIndex >= 0 ? row[tableNameIndex] : '',
      key: keyBase + index,
      children: [],
      columns: [],
      details: [],
      timeIndexName: '',
      childrenType: 'columns',
      isLeaf: false,
      tableType: tableTypeIndex >= 0 ? row[tableTypeIndex] : undefined,
      engine,
      isLogicalTable: metricTableMeta.isLogicalTable,
      isPhysicalMetricTable: metricTableMeta.isPhysicalMetricTable,
      physicalTableName: metricTableMeta.physicalTableName,
    } as TableTreeParent
  })
}
