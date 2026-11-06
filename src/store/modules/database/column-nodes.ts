import { SEMANTIC_TYPE_MAP } from '@/views/dashboard/config'
import type { RecordsType, SchemaType } from '../code-run/types'
import type { TableTreeChild } from './types'

function findColumnIndex(schemas: SchemaType[], names: string[]): number {
  return schemas.findIndex((schema) => names.includes(schema.name))
}

export interface ColumnNodesResult {
  nodes: TableTreeChild[]
  timeIndexName: string
}

/**
 * Convert `DESC "<table>"` rows into sidebar column nodes.
 *
 * `DESC` resolves through the catalog in O(1) (~3ms) while
 * `information_schema.columns` scans the whole schema (~0.7s at 100k tables),
 * so the sidebar uses this on expand.
 *
 * Output columns: Column / Type / Key / Null / Default / Semantic Type.
 * Also accepts the information_schema column names for convenience.
 */
export default function buildColumnNodes(
  records: RecordsType | undefined,
  tableTitle: string,
  parentKey: number
): ColumnNodesResult {
  if (!records) return { nodes: [], timeIndexName: '%TIMESTAMP%' }

  const schemas = records.schema?.column_schemas || []
  const columnNameIndex = findColumnIndex(schemas, ['Column', 'column_name'])
  const dataTypeIndex = findColumnIndex(schemas, ['Type', 'greptime_data_type', 'data_type'])
  const semanticTypeIndex = findColumnIndex(schemas, ['Semantic Type', 'semantic_type'])

  let timeIndexName = '%TIMESTAMP%'

  const nodes = (records.rows || []).map((row: Array<string>) => {
    const rawSemantic = semanticTypeIndex >= 0 ? row[semanticTypeIndex] : ''
    const iconType = SEMANTIC_TYPE_MAP[rawSemantic] || rawSemantic || ''
    const title = columnNameIndex >= 0 ? row[columnNameIndex] : ''

    if (iconType === 'TIMESTAMP' && timeIndexName === '%TIMESTAMP%') {
      timeIndexName = title
    }

    return {
      title,
      key: `${tableTitle}.${title}`,
      dataType: dataTypeIndex >= 0 ? row[dataTypeIndex] : '',
      iconType,
      parentKey,
      isLeaf: true,
    } as TableTreeChild
  })

  return { nodes, timeIndexName }
}
