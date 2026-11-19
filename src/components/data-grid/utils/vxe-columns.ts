import type { ColumnType, TSColumn } from '@/types/query'
import { resolveColumnWidthRule } from './column-widths'
import { getSeparateFields } from './table-data'
import type { ColumnWidthRule, LogsColumnMode, SeparateField } from '../types'

/** Class names for time columns — reuse global timestamp-cell styles. */
export function getTimeColumnClassNames(
  isPrimaryTs: boolean,
  isTime: boolean,
  options: { tsCellDetail?: boolean; tsToggle?: boolean } | boolean = {}
): string {
  if (!isPrimaryTs && !isTime) {
    return ''
  }
  // Legacy call sites passed `tsCellDetail` as the 3rd boolean.
  const opts = typeof options === 'boolean' ? { tsCellDetail: options } : options
  const tsCellDetail = opts.tsCellDetail ?? false
  const tsToggle = opts.tsToggle ?? true
  const classes = ['timestamp-cell']
  if (!tsToggle) {
    return classes.join(' ')
  }
  if (isPrimaryTs) {
    classes.push(tsCellDetail ? 'ts-cell-detail-link' : 'timestamp-cell--toggle')
  } else if (!tsCellDetail) {
    classes.push('timestamp-cell--toggle')
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
  /** When false: keep timestamp color, but no toggle cursor / click affordance. */
  tsToggle?: boolean
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
    tsToggle = true,
    wrapLine,
    widthRules,
    renderSeparateCell,
    renderMergedCell,
    renderHeader,
    hasColumnSlot,
    renderColumnSlot,
  } = options
  const timeClassOpts = { tsCellDetail, tsToggle }

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
          className: [getTimeColumnClassNames(true, true, timeClassOpts), 'dg-edge-left'].filter(Boolean).join(' '),
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
    const classNames = [
      getTimeColumnClassNames(item.isTs, item.isTime, timeClassOpts),
      item.isLink ? 'dg-link-col' : '',
      !item.isTs && !item.isTime && !item.isLink ? 'dg-detail-cell' : '',
    ]
      .filter(Boolean)
      .join(' ')
    const edge = edgeClass(index, fields.length)
    // Slot / action columns keep their declared width. Time columns take
    // max(explicit, estimate) so legacy 190px hints cannot clip timestamps.
    const explicitWidth = typeof meta.width === 'number' && meta.width > 0 ? meta.width : null
    const estimatedRule = widthRules[item.field]
    let rule: ColumnWidthRule = estimatedRule || {}
    if (item.isTs || item.isTime) {
      rule = resolveColumnWidthRule(estimatedRule, explicitWidth)
    } else if (explicitWidth) {
      rule = { width: explicitWidth }
    }
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
