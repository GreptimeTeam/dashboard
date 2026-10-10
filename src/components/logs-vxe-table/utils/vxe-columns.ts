import type { ColumnType, TSColumn } from '@/types/query'
import { TIME_COLUMN_FIXED_WIDTH } from './column-widths'
import { getSeparateFields } from './table-data'
import type { ColumnWidthRule, LogsColumnMode, SeparateField } from '../types'

/** Class names for time columns — accent color + toggle/link affordance. */
export function getTimeColumnClassNames(isPrimaryTs: boolean, isTime: boolean, tsCellDetail: boolean): string {
  if (!isPrimaryTs && !isTime) {
    return ''
  }
  const classes = ['logs-vxe-ts-col']
  if (isPrimaryTs) {
    classes.push(tsCellDetail ? 'logs-vxe-ts-col--link' : 'logs-vxe-ts-col--toggle')
  } else if (!tsCellDetail) {
    classes.push('logs-vxe-ts-col--toggle')
  }
  return classes.join(' ')
}

type CellRenderer = (params: { row: Record<string, unknown>; column: { field?: string } }) => unknown

/**
 * VXE column definitions for both modes. Timestamp column is fixed width and
 * first; content columns carry width rules and edge padding classes (legacy
 * DataTable pads the first/last column wider).
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
  renderTsHeader: (title: string) => unknown
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
    renderTsHeader,
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
    [index === 0 ? 'logs-vxe-edge-left' : '', index === total - 1 ? 'logs-vxe-edge-right' : '']
      .filter(Boolean)
      .join(' ')

  if (merge) {
    if (tsName) {
      cols.push(
        contentColumn(tsName, tsName, {
          className: [getTimeColumnClassNames(true, true, tsCellDetail), 'logs-vxe-edge-left']
            .filter(Boolean)
            .join(' '),
          headerClassName: 'logs-vxe-edge-left',
          width: TIME_COLUMN_FIXED_WIDTH,
          slots: { default: renderSeparateCell, header: () => renderTsHeader(tsName) },
        })
      )
    }
    cols.push(
      contentColumn('__merged_message', 'message', {
        minWidth: 'auto',
        className: ['logs-vxe-detail-cell', 'logs-vxe-edge-right'].join(' '),
        headerClassName: 'logs-vxe-edge-right',
        slots: { default: renderMergedCell },
      })
    )
    return cols
  }

  const fields = getSeparateFields({ columns, displayedColumns, tsColumn, linkColumn })
  fields.forEach((item: SeparateField, index: number) => {
    const classNames = [
      getTimeColumnClassNames(item.isTs, item.isTime, tsCellDetail),
      item.isLink ? 'logs-vxe-link-col' : '',
      !item.isTs && !item.isTime && !item.isLink ? 'logs-vxe-detail-cell' : '',
    ]
      .filter(Boolean)
      .join(' ')
    const edge = edgeClass(index, fields.length)
    const rule = widthRules[item.field] || {}
    cols.push(
      contentColumn(item.field, item.title, {
        className: [classNames, edge].filter(Boolean).join(' '),
        ...(edge ? { headerClassName: edge } : {}),
        ...rule,
        slots: {
          default: renderSeparateCell,
          ...(item.isTime ? { header: () => renderTsHeader(item.title) } : {}),
        },
      })
    )
  })

  return cols
}
