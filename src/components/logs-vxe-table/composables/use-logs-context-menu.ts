import { computed, ref, shallowRef, type Ref } from 'vue'
import type { ColumnType } from '@/types/query'
import getCellString from '../utils/cell-text'
import type { TableData } from '../types'

export type FilterMenuPayload = { columnName: string; operator: string; value: unknown }

/**
 * Per-cell filter/copy context menu (separate mode only, never on time columns;
 * JSON columns only offer copy).
 */
export default function useLogsContextMenu(options: {
  enabled: Ref<boolean> | (() => boolean)
  columns: () => ColumnType[]
  isTimeField: (field: string) => boolean
  getOriginalRow: (row: TableData) => TableData
  onFilter: (payload: FilterMenuPayload) => void
}) {
  const enabled = typeof options.enabled === 'function' ? options.enabled : () => options.enabled.value
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
    if (!enabled() || isTimeField(columnName)) {
      return
    }
    const original = getOriginalRow(row)
    triggerCell.value = [original, columnName]
    event.preventDefault()
    event.stopPropagation()

    const column = columns().find((col) => col.name === columnName)
    // Time columns never reach here (no menu); JSON columns only offer copy.
    if (column?.data_type && column.data_type.toLowerCase() === 'json') {
      filterOptions.value = []
    } else {
      filterOptions.value = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE']
    }

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
    } else if (action.startsWith('filter')) {
      const operator = action.split('_')[1]
      onFilter({ columnName, operator, value: record[columnName] })
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
