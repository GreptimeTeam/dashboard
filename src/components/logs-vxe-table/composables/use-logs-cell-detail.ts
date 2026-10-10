import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import getCellString from '../utils/cell-text'
import type { LogsColumnMode, TableData } from '../types'

const CELL_DETAIL_OPEN_DELAY_MS = 200
const CELL_DETAIL_DRAG_THRESHOLD_PX = 4

/**
 * Cell detail popup: every non-empty normal cell can show its raw value.
 * Opening is delayed for one click and suppressed for drags/selections, so
 * selecting or double-click selecting text never fights with the popup.
 */
export default function useLogsCellDetail(options: {
  rootEl: Ref<HTMLElement | null>
  columnMode: () => LogsColumnMode
}) {
  const { rootEl, columnMode } = options

  const cellDetail = ref<{ title: string; content: string } | null>(null)
  const cellDetailVisible = ref(false)
  const cellDetailAnchorStyle = ref<Record<string, string>>({ display: 'none' })
  let cellDetailOpenTimer: ReturnType<typeof setTimeout> | null = null
  let cellDetailPointerStart: { x: number; y: number; hadSelection: boolean } | null = null
  let detailHoverCell: HTMLElement | null = null

  function hasTextSelection() {
    const selection = window.getSelection()
    return Boolean(selection && !selection.isCollapsed && selection.toString().trim())
  }

  function cancelCellDetailOpen() {
    if (cellDetailOpenTimer != null) {
      clearTimeout(cellDetailOpenTimer)
      cellDetailOpenTimer = null
    }
  }

  function closeCellDetail() {
    cancelCellDetailOpen()
    cellDetailVisible.value = false
  }

  function onDetailKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeCellDetail()
    }
  }

  function onDetailPointerDown(event: PointerEvent) {
    cancelCellDetailOpen()
    if (cellDetailVisible.value) {
      closeCellDetail()
    }
    cellDetailPointerStart =
      event.button === 0 ? { x: event.clientX, y: event.clientY, hadSelection: hasTextSelection() } : null
  }

  function clearDetailHoverCell() {
    detailHoverCell?.classList.remove('logs-vxe-detail-cell--overflow')
    detailHoverCell = null
  }

  /**
   * Affordance is based on the cell's real overflow state, measured only while
   * the user hovers it. This avoids the pressure of showing a click cursor on
   * every cell, and avoids estimating text width while rendering columns.
   */
  function isDetailContentOverflowing(cell: HTMLElement) {
    const targets = [
      cell.querySelector('.logs-vxe-cell-text'),
      cell.querySelector('.logs-vxe-merged-cell'),
      cell.querySelector('.vxe-cell'),
    ]
    return targets.some((target) => {
      if (!(target instanceof HTMLElement)) {
        return false
      }
      return target.scrollWidth - target.clientWidth > 1 || target.scrollHeight - target.clientHeight > 1
    })
  }

  function updateDetailHoverCell(event: Event) {
    const target = event.target as Element | null
    const cell = target?.closest<HTMLElement>('.vxe-body--column.logs-vxe-detail-cell') || null
    if (cell === detailHoverCell) {
      return
    }

    clearDetailHoverCell()
    detailHoverCell = cell
    cell?.classList.toggle('logs-vxe-detail-cell--overflow', isDetailContentOverflowing(cell))
  }

  function isDetailCellTarget(event: MouseEvent | undefined) {
    const target = event?.target as Element | null
    return Boolean(target?.closest('button, a, .logs-vxe-cell-action'))
  }

  function isPlainDetailClick(event: MouseEvent | undefined) {
    if (!event || event.button !== 0 || event.detail > 1 || !cellDetailPointerStart) {
      return false
    }
    if (cellDetailPointerStart.hadSelection || hasTextSelection()) {
      return false
    }
    const movedX = event.clientX - cellDetailPointerStart.x
    const movedY = event.clientY - cellDetailPointerStart.y
    return Math.hypot(movedX, movedY) <= CELL_DETAIL_DRAG_THRESHOLD_PX
  }

  function setCellDetailAnchor(cell: Element) {
    const rect = cell.getBoundingClientRect()
    cellDetailAnchorStyle.value = {
      position: 'fixed',
      display: 'block',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${Math.max(rect.width, 1)}px`,
      height: `${Math.max(rect.height, 1)}px`,
    }
  }

  function openCellDetail(row: TableData, field: string, event?: MouseEvent) {
    const merge = columnMode() !== 'separate'
    const cell = (event?.target as Element | null)?.closest('.vxe-body--column')
    const content = merge ? String(row.__merged_message || '') : getCellString(row[field])
    if (!cell || !content) {
      return
    }

    setCellDetailAnchor(cell)
    cellDetail.value = {
      title: merge ? 'message' : field,
      content,
    }
    cellDetailVisible.value = true
  }

  function scheduleCellDetail(row: TableData, field: string, event?: MouseEvent) {
    cancelCellDetailOpen()
    if (!isPlainDetailClick(event)) {
      return
    }
    cellDetailOpenTimer = setTimeout(() => {
      cellDetailOpenTimer = null
      openCellDetail(row, field, event)
    }, CELL_DETAIL_OPEN_DELAY_MS)
  }

  onMounted(() => {
    rootEl.value?.addEventListener('pointerdown', onDetailPointerDown)
    rootEl.value?.addEventListener('mouseover', updateDetailHoverCell)
    rootEl.value?.addEventListener('mouseleave', clearDetailHoverCell)
    window.addEventListener('keydown', onDetailKeydown)
  })

  onBeforeUnmount(() => {
    clearDetailHoverCell()
    rootEl.value?.removeEventListener('pointerdown', onDetailPointerDown)
    rootEl.value?.removeEventListener('mouseover', updateDetailHoverCell)
    rootEl.value?.removeEventListener('mouseleave', clearDetailHoverCell)
    window.removeEventListener('keydown', onDetailKeydown)
    closeCellDetail()
  })

  return {
    cellDetail,
    cellDetailVisible,
    cellDetailAnchorStyle,
    scheduleCellDetail,
    openCellDetail,
    closeCellDetail,
    clearDetailHoverCell,
    isDetailCellTarget,
  }
}
