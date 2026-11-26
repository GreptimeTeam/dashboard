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
export default function useCellDetail(options: { rootEl: Ref<HTMLElement | null>; columnMode: () => LogsColumnMode }) {
  const { rootEl, columnMode } = options

  const cellDetail = ref<{ title: string; content: string } | null>(null)
  const cellDetailVisible = ref(false)
  const cellDetailAnchorStyle = ref<Record<string, string>>({ display: 'none' })
  let cellDetailOpenTimer: ReturnType<typeof setTimeout> | null = null
  let cellDetailPointerStart: { x: number; y: number; hadSelection: boolean } | null = null
  let detailHoverCell: HTMLElement | null = null

  /**
   * Whether the current selection lives inside `cell`.
   *
   * Scoped on purpose: a selection left over from another cell (e.g. the user
   * double-clicked a value to copy it, then clicked a different cell) must not
   * suppress the popup — that click collapses the old selection anyway.
   */
  function selectionInsideCell(cell: Element | null): boolean {
    if (!cell) {
      return false
    }
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return false
    }
    for (let i = 0; i < selection.rangeCount; i += 1) {
      const range = selection.getRangeAt(i)
      if (cell.contains(range.startContainer) || cell.contains(range.endContainer)) {
        return true
      }
    }
    return false
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
    const cell = (event.target as Element | null)?.closest('.vxe-body--column') ?? null
    cellDetailPointerStart =
      event.button === 0 ? { x: event.clientX, y: event.clientY, hadSelection: selectionInsideCell(cell) } : null
  }

  function clearDetailHoverCell() {
    detailHoverCell?.classList.remove('dg-detail-cell--overflow')
    detailHoverCell = null
  }

  /**
   * A cell is "openable" exactly when its rendered text is clipped. This drives
   * BOTH the affordance (cursor + hover ring, computed on hover) and the click
   * behaviour — otherwise the cursor says "nothing to see" while clicking still
   * pops up a copy of the text that is already fully visible.
   *
   * Measured lazily instead of at render time: the check costs a scrollWidth read,
   * and doing it for every cell while rendering columns would be a layout read per
   * cell (the same reason width measurement was removed).
   */
  function isDetailContentOverflowing(cell: HTMLElement) {
    const targets = [
      cell.querySelector('.dg-cell-text'),
      cell.querySelector('.dg-merged-cell'),
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
    const cell = target?.closest<HTMLElement>('.vxe-body--column.dg-detail-cell') || null
    if (cell === detailHoverCell) {
      return
    }

    clearDetailHoverCell()
    detailHoverCell = cell
    cell?.classList.toggle('dg-detail-cell--overflow', isDetailContentOverflowing(cell))
  }

  function isDetailCellTarget(event: MouseEvent | undefined) {
    const target = event?.target as Element | null
    return Boolean(target?.closest('button, a, .dg-cell-action'))
  }

  function isPlainDetailClick(event: MouseEvent | undefined) {
    if (!event || event.button !== 0 || event.detail > 1 || !cellDetailPointerStart) {
      return false
    }
    const cell = (event.target as Element | null)?.closest('.vxe-body--column') ?? null
    if (cellDetailPointerStart.hadSelection || selectionInsideCell(cell)) {
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
    const cell = (event?.target as Element | null)?.closest<HTMLElement>('.vxe-body--column')
    const content = merge ? String(row.__merged_message || '') : getCellString(row[field])
    if (!cell || !content) {
      return
    }
    // Nothing is clipped → the popup would just repeat what is already on screen.
    if (!isDetailContentOverflowing(cell)) {
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
