import { computed, ref, shallowRef, type Ref } from 'vue'
import type { ColumnType } from '@/types/query'
import { filterOpsForType } from '@/observability/filters'
import getCellString from '../utils/cell-text'
import type { TableData } from '../types'

export type FilterMenuPayload = { columnName: string; operator: string; value: unknown }

/** Logs Query SQL builder vs Explore drilldown chips (`=~` / no LIKE). */
export type LogsFilterMenuKind = 'sql-builder' | 'drilldown'

const FILTER_MENU_PREFIX = 'filter_'

/** Parse `filter_NOT LIKE` → `NOT LIKE` (split on first `_` only breaks multi-word ops). */
export function parseFilterMenuOperator(action: string): string {
  if (!action.startsWith(FILTER_MENU_PREFIX)) {
    return ''
  }
  return action.slice(FILTER_MENU_PREFIX.length)
}

function sqlBuilderFilterOps(column: ColumnType | undefined, isTime: boolean): string[] {
  if (!column) {
    return []
  }
  if (column.data_type && column.data_type.toLowerCase() === 'json') {
    return []
  }
  if (isTime) {
    return ['>=', '<=']
  }
  return ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE']
}

function drilldownFilterOps(column: ColumnType | undefined, isTime: boolean): string[] {
  if (!column) {
    return []
  }
  if (column.data_type && column.data_type.toLowerCase() === 'json') {
    return []
  }
  if (isTime) {
    return ['>=', '<=']
  }
  return filterOpsForType(column.data_type)
}

/**
 * Per-cell filter/copy context menu (separate mode only).
 * JSON columns only offer copy; time columns offer copy + range filters.
 */
export default function useLogsContextMenu(options: {
  enabled: Ref<boolean> | (() => boolean)
  columns: () => ColumnType[]
  isTimeField: (field: string) => boolean
  getOriginalRow: (row: TableData) => TableData
  onFilter: (payload: FilterMenuPayload) => void
  /** Drilldown chips use `=~`; Logs Query SQL builder uses `LIKE`. */
  filterMenuKind?: Ref<LogsFilterMenuKind> | (() => LogsFilterMenuKind)
}) {
  const enabled = typeof options.enabled === 'function' ? options.enabled : () => options.enabled.value
  const filterMenuKind =
    typeof options.filterMenuKind === 'function'
      ? options.filterMenuKind
      : () => options.filterMenuKind?.value ?? 'sql-builder'
  const { columns, isTimeField, getOriginalRow, onFilter } = options

  const contextMenuVisible = ref(false)
  const contextMenuPosition = ref({ x: 0, y: 0 })
  const contextMenuStyle = computed(() => ({
    position: 'fixed' as const,
    top: `${contextMenuPosition.value.y}px`,
    left: `${contextMenuPosition.value.x}px`,
    zIndex: 9999,
  }))
  const filterOptions = shallowRef<string[]>([])
  const triggerCell = ref<[TableData, string] | null>(null)

  function hideContextMenu() {
    contextMenuVisible.value = false
  }

  function onContextMenuVisibleChange(popupVisible: boolean) {
    if (!popupVisible) {
      hideContextMenu()
    }
  }

  function openContextMenu(row: TableData, columnName: string, event: MouseEvent) {
    if (!enabled()) {
      return
    }
    const original = getOriginalRow(row)
    triggerCell.value = [original, columnName]
    event.preventDefault()
    event.stopPropagation()

    const column = columns().find((col) => col.name === columnName)
    const isTime = isTimeField(columnName)
    const opsForMenu = filterMenuKind() === 'drilldown' ? drilldownFilterOps : sqlBuilderFilterOps
    filterOptions.value = opsForMenu(column, isTime)

    const rect = (event.currentTarget as Element).getBoundingClientRect()
    contextMenuPosition.value = { x: rect.left, y: rect.bottom }
    contextMenuVisible.value = true
  }

  async function handleMenuClick(value: string | number | Record<string, unknown>) {
    const action = String(value)
    if (!triggerCell.value) {
      return
    }
    const [record, columnName] = triggerCell.value
    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(getCellString(record[columnName]))
      } catch {
        // ignore clipboard errors
      }
    } else if (action.startsWith(FILTER_MENU_PREFIX)) {
      const operator = parseFilterMenuOperator(action)
      if (operator) {
        onFilter({ columnName, operator, value: getCellString(record[columnName]) })
      }
    }
    hideContextMenu()
  }

  return {
    contextMenuVisible,
    contextMenuStyle,
    filterOptions,
    openContextMenu,
    handleMenuClick,
    hideContextMenu,
    onContextMenuVisibleChange,
  }
}
