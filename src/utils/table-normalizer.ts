import { dateTypes, numberTypes } from '@/views/dashboard/config'
import type { SchemaType, RecordsType } from '@/store/modules/code-run/types'
import type { ColumnType } from '@/types/query'

export interface NormalizedTableModel {
  columns: ColumnType[]
  rows: Record<string, unknown>[]
  displayedColumns: string[]
  tsColumn: ColumnType | null
}

function columnNameToDataIndex(columnName: string) {
  return columnName.replace(/\./gi, '-')
}

export function normalizeRecordsToTableModel(records?: RecordsType): NormalizedTableModel {
  const columnSchemas = records?.schema?.column_schemas || []
  if (!columnSchemas.length) {
    return {
      columns: [],
      rows: [],
      displayedColumns: [],
      tsColumn: null,
    }
  }

  const timeColumnNames = columnSchemas
    .filter((column: SchemaType) => dateTypes.includes(column.data_type))
    .map((column: SchemaType) => column.name)

  const columns = columnSchemas
    .map((column: SchemaType) => {
      return {
        name: columnNameToDataIndex(column.name),
        title: column.name,
        data_type: column.data_type,
        semantic_type: '',
      } as ColumnType
    })
    .sort((a, b) => +timeColumnNames.includes(b.title || b.name) - +timeColumnNames.includes(a.title || a.name))

  const rows = (records?.rows || []).map((row: any[]) => {
    const tempRow: Record<string, unknown> = {}
    ;(row || []).forEach((item: unknown, index: number) => {
      const rawColumnName = columnSchemas[index]?.name
      if (!rawColumnName) return

      const columnName = columnNameToDataIndex(rawColumnName)
      const type = columnSchemas[index]?.data_type
      let normalizedItem = item
      if (numberTypes.includes(type) && typeof normalizedItem === 'string') {
        if (type !== 'Int64' && type !== 'UInt64' && type !== 'Float64') {
          normalizedItem = Number(normalizedItem)
        }
      }
      tempRow[columnName] = normalizedItem
    })
    return tempRow
  })

  const displayedColumns = columns.map((column) => column.name)
  const tsColumn = columns.find((column) => dateTypes.includes(column.data_type)) || null

  return {
    columns,
    rows,
    displayedColumns,
    tsColumn,
  }
}
