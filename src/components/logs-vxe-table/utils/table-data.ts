import type { ColumnType, TSColumn } from '@/types/query'
import { dateTypes } from '@/constants/column-types'
import getCellString from './cell-text'
import type { LogsColumnMode, LogsTableFieldsInput, MergedPart, SeparateField, TableData } from '../types'

export function isTimeColumn(column: ColumnType | null | undefined): boolean {
  if (!column?.data_type) {
    return false
  }
  return dateTypes.indexOf(column.data_type) > -1
}

/** Visible content fields, timestamp excluded (it is always rendered first). */
export function getVisibleFieldNames(input: LogsTableFieldsInput): string[] {
  const tsName = input.tsColumn?.name
  let names = input.displayedColumns.length > 0 ? input.displayedColumns.slice() : input.columns.map((c) => c.name)
  if (tsName) {
    names = names.filter((n) => n !== tsName)
  }
  return names
}

/** Separate-mode field list, in render order (timestamp first). */
export function getSeparateFields(input: LogsTableFieldsInput): SeparateField[] {
  const tsName = input.tsColumn?.name
  const fields: SeparateField[] = []
  if (tsName) {
    fields.push({ field: tsName, title: tsName, isTs: true, isTime: true, isLink: false })
  }
  getVisibleFieldNames(input).forEach((name) => {
    const meta = input.columns.find((c) => c.name === name)
    fields.push({
      field: name,
      title: meta?.title || name,
      isTs: false,
      isTime: isTimeColumn(meta),
      isLink: Boolean(input.linkColumn && name === input.linkColumn),
    })
  })
  return fields
}

export type CellTextOf = (value: unknown, column: ColumnType | TSColumn | null | undefined) => string

/**
 * Pre-stringify / format cell values so Vxe never renders raw objects.
 * Interactive bits (links, filter icon, merged parts) render via column slots.
 */
export function buildDisplayRows(
  input: LogsTableFieldsInput & {
    data: TableData[]
    columnMode: LogsColumnMode
    textOf: CellTextOf
  }
): TableData[] {
  const { data, columns, tsColumn, linkColumn, columnMode, textOf } = input
  const merge = columnMode !== 'separate'
  const fields = getVisibleFieldNames(input)
  const tsName = tsColumn?.name
  const showKeys = columnMode === 'merged-with-keys'

  return data.map((record, index) => {
    const rowIndex = typeof record.__rowIndex === 'number' ? record.__rowIndex : index
    const out: TableData = { __rowIndex: rowIndex }

    if (tsName) {
      const tsMeta = tsColumn || columns.find((c) => c.name === tsName)
      out[tsName] = textOf(record[tsName], tsMeta)
    }

    if (merge) {
      const parts: MergedPart[] = fields
        .map((key) => ({
          key,
          text: getCellString(record[key]),
          isLink: Boolean(linkColumn && key === linkColumn),
        }))
        .filter((part) => part.text)
      out.__merged_parts = parts
      out.__merged_message = parts.map((part) => (showKeys ? `${part.key}: ${part.text}` : part.text)).join(' ')
      return out
    }

    fields.forEach((name) => {
      const meta = columns.find((c) => c.name === name)
      out[name] = isTimeColumn(meta) ? textOf(record[name], meta) : getCellString(record[name])
    })
    return out
  })
}
