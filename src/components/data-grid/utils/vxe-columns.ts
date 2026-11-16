import type { ColumnType, TSColumn } from '@/types/query'
import { isJsonDataType } from '@/utils/json-display'
import { getSeparateFields, isTimeColumn } from './table-data'
import type { ColumnWidthRule, LogsColumnMode, SeparateField } from '../types'

/** Class names for time columns — accent color + toggle/link affordance. */
export function getTimeColumnClassNames(isPrimaryTs: boolean, isTime: boolean, tsCellDetail: boolean): string {
  if (!isPrimaryTs && !isTime) {
    return ''
  }
  const classes = ['dg-ts-col']
  if (isPrimaryTs) {
    classes.push(tsCellDetail ? 'dg-ts-col--link' : 'dg-ts-col--toggle')
  } else if (!tsCellDetail) {
    classes.push('dg-ts-col--toggle')
  }
  return classes.join(' ')
}

type CellRenderer = (params: { row: Record<string, unknown>; column: { field?: string } }) => unknown
type HeaderRenderer = (column: ColumnType, field: string, title: string) => unknown

/**
 * VXE column definitions for both modes. Timestamp column is first; columns
 * carry width rules and edge padding classes (legacy DataTable pads the
 * first/last column wider).
 */
export function buildVxeColumns(options: {
  columnMode: LogsColumnMode
  columns: ColumnType[]
  displayedColumns: string[]
  tsColumn: TSColumn | null
  linkColumn: string
  tsCellDetail: boolean
  wrapLine: boolean
  widthRules: Record<string, ColumnWidthRule>
  renderSeparateCell: CellRenderer
  renderMergedCell: CellRenderer
  renderHeader: HeaderRenderer
  hasColumnSlot?: (field: string) => boolean
  renderColumnSlot?: CellRenderer
}): Record<string, unknown>[] {
  const {
    columnMode,
    columns,
    displayedColumns,
    tsColumn,
    linkColumn,
    tsCellDetail,
    wrapLine,
    widthRules,
    renderSeparateCell,
    renderMergedCell,
    renderHeader,
    hasColumnSlot,
    renderColumnSlot,
  } = options

  const cols: Record<string, unknown>[] = []
  const tsName = tsColumn?.name
  const merge = columnMode !== 'separate'
  const showOverflow = wrapLine ? false : 'ellipsis'
  const contentColumn = (field: string, title: string, extra: Record<string, unknown> = {}) => ({
    field,
    title,
    showOverflow,
    ...extra,
  })
  const edgeClass = (index: number, total: number) =>
    [index === 0 ? 'dg-edge-left' : '', index === total - 1 ? 'dg-edge-right' : ''].filter(Boolean).join(' ')

  const cellForField = (field: string): CellRenderer => {
    if (hasColumnSlot?.(field) && renderColumnSlot) {
      return renderColumnSlot
    }
    return renderSeparateCell
  }

  if (merge) {
    if (tsName) {
      const tsMeta = (tsColumn || { name: tsName, data_type: 'TimestampNanosecond' }) as ColumnType
      cols.push(
        contentColumn(tsName, tsName, {
          className: [getTimeColumnClassNames(true, true, tsCellDetail), 'dg-edge-left'].filter(Boolean).join(' '),
          headerClassName: 'dg-edge-left',
          ...(widthRules[tsName] || { width: 'auto' }),
          slots: {
            default: cellForField(tsName),
            header: () => renderHeader(tsMeta, tsName, tsName),
          },
        })
      )
    }
    cols.push(
      contentColumn('__merged_message', 'message', {
        ...(widthRules.__merged_message || { minWidth: 'auto' }),
        className: ['dg-detail-cell', 'dg-edge-right'].join(' '),
        headerClassName: 'dg-edge-right',
        slots: { default: renderMergedCell },
      })
    )
    return cols
  }

  const fields = getSeparateFields({ columns, displayedColumns, tsColumn, linkColumn })
  const metaByName = new Map(columns.map((column) => [column.name, column]))
  fields.forEach((item: SeparateField, index: number) => {
    const meta =
      metaByName.get(item.field) ||
      (tsColumn?.name === item.field
        ? ({ name: item.field, data_type: tsColumn.data_type || 'timestamp', title: item.title } as ColumnType)
        : ({ name: item.field, title: item.title, data_type: '' } as ColumnType))
    const isTime = item.isTs || item.isTime || isTimeColumn(meta)
    const isJson = isJsonDataType(meta.data_type)
    const classNames = [
      getTimeColumnClassNames(item.isTs, item.isTime, tsCellDetail),
      item.isLink ? 'dg-link-col' : '',
      !item.isTs && !item.isTime && !item.isLink ? 'dg-detail-cell' : '',
      isJson ? 'dg-json-col' : '',
    ]
      .filter(Boolean)
      .join(' ')
    const edge = edgeClass(index, fields.length)
    // Explicit width (non-text content) wins over the estimated rule.
    const explicitWidth = typeof meta.width === 'number' && meta.width > 0 ? meta.width : null
    const rule = explicitWidth ? { width: explicitWidth } : widthRules[item.field] || {}
    cols.push(
      contentColumn(item.field, item.title, {
        className: [classNames, edge].filter(Boolean).join(' '),
        ...(edge ? { headerClassName: edge } : {}),
        ...rule,
        slots: {
          default: cellForField(item.field),
          header: () => renderHeader(meta, item.field, item.title),
        },
      })
    )
  })

  return cols
}
