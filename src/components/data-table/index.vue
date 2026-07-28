<template lang="pug">
.data-table-container(
  ref="tableContainer"
  :class="containerClasses"
  :style="lockedTableWidthPx ? { '--data-table-locked-width': lockedTableWidthPx + 'px' } : undefined"
)
  a-table(
    :key="tableRenderKey"
    v-bind="tablePassThroughProps"
    row-key="__rowIndex"
    :data="processedData"
    :pagination="false"
    :bordered="false"
    :stripe="false"
    :row-class="getRowClass"
    :class="tableClassesDynamic"
    @column-resize="onColumnResize"
  )
    template(#empty)
      a-empty.data-table-empty(description="No data")
        template(#image)
          img.data-table-empty-icon(alt="" :src="tableEmptyIcon")
    template(#loading)
      a-spin(dot)

    // Define columns using the straightforward approach
    template(#columns)
      template(v-for="(col, colIndex) in processedColumns" :key="col.name")
        a-table-column(
          :width="col.width || undefined"
          :ellipsis="true"
          :data-index="col.name"
          :title="col.title || col.name"
          :cell-class="col.cellClass"
          :header-cell-class="col.cellClass"
        )
          // Custom title slot - allow parent components to override column titles
          template(#title)
            slot(
              :name="`title-${col.name}`"
              :column="col"
              :is-time-column="isTimeColumn(col)"
              :ts-view-str="tsViewStr"
              :change-ts-view="changeTsView"
            )
              // Default title rendering (fallback when no custom title slot provided)
              template(v-if="isTimeColumn(col)")
                a-tooltip(
                  placement="top"
                  :content="tsViewStr ? $t('dashboard.showTimestamp') : $t('dashboard.formatTimestamp')"
                )
                  span.gpt-semantic-th(style="cursor: pointer" :class="getSemanticThClass(col)" @click="changeTsView")
                    svg.icon-12
                      use(href="#time-index")
                    | {{ col.name }}
              template(v-else-if="col.semantic_type")
                span.gpt-semantic-th(:class="getSemanticThClass(col)") {{ col.title || col.name }}
              template(v-else)
                | {{ col.title || col.name }}
          // Custom cell slot - allow parent components to override cell rendering
          template(#cell="{ record, rowIndex }")
            slot(
              :name="`column-${col.name}`"
              :record="record"
              :row-index="rowIndex"
              :column="col"
              :is-time-column="isTimeColumn(col)"
              :rendered-value="getRenderedValue(record, col)"
              :show-context-menu="showContextMenu"
              :handle-context-menu="handleContextMenu"
              :ts-view-str="tsViewStr"
              :change-ts-view="changeTsView"
            )
              // Default cell rendering (fallback when no custom slot provided)
              template(v-if="col.name === 'Merged_Column' && mergeColumn")
                // Special rendering for merged column (no per-field context icons)
                .cell-wrapper(:class="{ 'has-merged-expand': !props.wrapLine && isMergedRowExpandable(record) }")
                  .merged-cell-content(:class="getCellContentClass(null)")
                    span.entity-field(v-for="field in record.Merged_Column" :key="field[0]")
                      span.entity-field-text
                        span(v-if="showKeys" style="color: var(--gpt-text-muted)")
                          | {{ field[0] }}:
                        | {{ field[1] }}
                  .cell-actions(v-if="!props.wrapLine && isMergedRowExpandable(record)")
                    a-popover(
                      trigger="click"
                      position="top"
                      :popup-visible="isExpandActive(record, 'Merged_Column')"
                      @popupVisibleChange="(visible) => handleExpandVisibleChange(getCellExpandKey(record, 'Merged_Column'), visible)"
                    )
                      template(#content)
                        .cell-popover-content {{ getMergedRowString(record) }}
                      span.cell-action-icon(:class="{ active: isExpandActive(record, 'Merged_Column') }" @click.stop)
                        icon-up(v-if="isExpandActive(record, 'Merged_Column')" :size="12")
                        icon-down(v-else :size="12")
              template(v-else-if="isTimeColumn(col)")
                .cell-wrapper
                  .cell-content.timestamp-cell-content
                    a-tooltip(
                      v-if="!tsCellDetail"
                      placement="top"
                      :content="tsViewStr ? $t('dashboard.showTimestamp') : $t('dashboard.formatTimestamp')"
                    )
                      span.timestamp-cell(style="cursor: pointer" @click="changeTsView") {{ renderTs(record, col.name) }}
                    template(v-else)
                      // Only the selected tsColumn triggers detail view in tsCellDetail mode
                      span.timestamp-cell.ts-cell-detail-link(
                        v-if="props.tsColumn?.name && col.name === props.tsColumn.name"
                        @click="handleTsCellClick(record, rowIndex)"
                      ) {{ renderTs(record, col.name) }}
                      span.timestamp-cell(v-else) {{ renderTs(record, col.name) }}
                  .cell-actions(v-if="showContextMenu && !mergeColumn")
                    span.cell-action-icon(
                      :class="{ active: isContextMenuActive(record, col.name) }"
                      @click.stop="(event) => handleContextMenu(record, col.name, event)"
                    )
                      svg.icon-12
                        use(href="#menu")
              template(v-else)
                .cell-wrapper
                  .cell-content(:class="getCellContentClass(record[col.name])")
                    span {{ record[col.name] }}
                  .cell-actions(v-if="showContextMenu || (!props.wrapLine && isCellExpandable(record[col.name]))")
                    a-popover(
                      v-if="!props.wrapLine && isCellExpandable(record[col.name])"
                      trigger="click"
                      position="top"
                      :popup-visible="isExpandActive(record, col.name)"
                      @popupVisibleChange="(visible) => handleExpandVisibleChange(getCellExpandKey(record, col.name), visible)"
                    )
                      template(#content)
                        .cell-popover-content {{ getCellString(record[col.name]) }}
                      span.cell-action-icon(:class="{ active: isExpandActive(record, col.name) }" @click.stop)
                        icon-up(v-if="isExpandActive(record, col.name)" :size="12")
                        icon-down(v-else :size="12")
                    span.cell-action-icon(
                      v-if="showContextMenu"
                      :class="{ active: isContextMenuActive(record, col.name) }"
                      @click.stop="(event) => handleContextMenu(record, col.name, event)"
                    )
                      svg.icon-12
                        use(href="#menu")
                  .cell-copy-button(
                    v-if="canShowCopyButton(record[col.name])"
                    @click.stop="copyCellValue(record[col.name])"
                  )
                    svg.icon-14
                      use(href="#copy-new")

// Context menu
a-dropdown#td-context(
  v-model:popup-visible="contextMenuVisible"
  trigger="contextMenu"
  :style="{ position: 'fixed', top: `${contextMenuPosition?.y ?? 0}px`, left: `${contextMenuPosition?.x ?? 0}px`, zIndex: 9999 }"
  @clickoutside="hideContextMenu"
  @popupVisibleChange="(visible) => { if (!visible) hideContextMenu() }"
  @select="handleMenuClick"
) 
  template(#content)
    a-doption(value="copy") Copy Field Value
    a-doption(v-if="!wrapLine && showContextMenu && hasRowDetailListener" value="inspect") {{ $t('common.inspectValue') }}
    a-dsubmenu(v-if="filterOptions.length > 0" trigger="hover") Filter
      template(#content)
        a-doption(v-for="op in filterOptions" :key="op" :value="`filter_${op}`") {{ op }} value
</template>

<script setup lang="ts">
  import {
    ref,
    computed,
    getCurrentInstance,
    nextTick,
    onBeforeUnmount,
    onMounted,
    shallowRef,
    useAttrs,
    watch,
  } from 'vue'
  import { useElementSize } from '@vueuse/core'
  import { dateTypes } from '@/views/dashboard/config'
  import type { ColumnType, TSColumn } from '@/types/query'
  import { useDateTimeFormat } from '@/hooks'
  import { Message } from '@arco-design/web-vue'
  import i18n from '@/locale'
  import tableEmptyIcon from '@/assets/images/table-empty.svg?url'

  defineOptions({
    inheritAttrs: false,
  })

  interface TableData {
    [key: string]: any
  }

  interface Props {
    // Data
    data: TableData[]
    columns: ColumnType[]

    // Table configuration
    class?: string | object

    // Column mode handling
    columnMode?: 'separate' | 'merged' | 'merged-with-keys'
    displayedColumns?: string[]

    // Timestamp handling
    tsColumn?: TSColumn | null
    /** When true, clicking the timestamp cell emits tsCellClick instead of toggling format */
    tsCellDetail?: boolean

    // Context menu
    showContextMenu?: boolean

    // Table styling options for dynamic classes
    wrapLine?: boolean

    // Enhanced cell behavior
    enableCellCopy?: boolean

    /** Global or page-local row index to highlight when detail drawer is open */
    activeRowKey?: number | null
  }

  const props = withDefaults(defineProps<Props>(), {
    data: () => [],
    columns: () => [],
    class: '',
    columnMode: 'separate',
    displayedColumns: () => [],
    tsColumn: null,
    tsCellDetail: false,
    showContextMenu: true,
    wrapLine: false,
    enableCellCopy: false,
    activeRowKey: null,
  })

  const attrs = useAttrs()
  const attrsRecord = attrs as Record<string, any>
  const hasVirtualListProps = computed(() => !!attrsRecord['virtual-list-props'])
  const columnResizableEnabled = computed(() => {
    if (!Object.prototype.hasOwnProperty.call(attrsRecord, 'column-resizable')) {
      return false
    }
    const raw = attrsRecord['column-resizable']
    if (raw === '' || raw === true || raw === undefined) {
      return true
    }
    if (raw === false || raw === 'false') {
      return false
    }
    return Boolean(raw)
  })
  // Non-virtual: one table + container scroll + sticky th (true natural column widths).
  const useStickySingleTable = computed(() => !hasVirtualListProps.value)

  // ── Virtual-list mode constraints (Arco virtual-list-props) ──────────────
  // Arco's virtual list uses a FIXED row height for all rows. Unlike
  // react-window's VariableSizeList (used by Grafana's logs panel), it does
  // NOT support per-row variable heights. This imposes two hard constraints
  // on the entire table layout:
  //
  // 1. Fixed row height → cells must NOT wrap or grow vertically.
  //    `.cell-content` defaults to `white-space: nowrap` so that multi-line
  //    content (e.g. log messages with \n) is collapsed to a single line.
  //    Otherwise a `pre-wrap` cell would expand its row beyond the fixed
  //    height, causing scroll jitter / row overlap in the virtual scroller.
  //    Users can opt into wrapping via the `wrapLine` prop, but this is only
  //    safe when the parent is NOT using virtual-list-props (or accepts the
  //    visual artifacts).
  //
  // 2. Column widths must be known BEFORE render (Arco positions cells via
  //    absolute offsets). `table-layout: auto` does not work — the browser
  //    cannot measure natural widths of off-screen rows. So column widths are
  //    estimated from data (char-count heuristic) rather than measured from
  //    the DOM as in the non-virtual path. The sum of column widths must stay
  //    within the virtual list's clientWidth to avoid a phantom horizontal
  //    scrollbar; see `availableTableWidth` and the buffer logic below.
  //
  // To support true variable-height log rows (multi-line, wrapped), the
  // virtual list implementation itself would need to be replaced with one
  // that supports per-row sizing (e.g. react-window VariableSizeList with
  // canvas-based height estimation + ResizeObserver correction, as Grafana
  // does). That is a larger architectural change outside the scope of this
  // component.
  // Detect whether the parent has bound a @row-select listener.
  // Declared emits are filtered out of attrs, so we read the raw vnode props.
  const hasRowDetailListener = computed(() => !!getCurrentInstance()?.vnode.props?.onRowSelect)

  const emit = defineEmits(['filterConditionAdd', 'rowSelect', 'tsCellClick'])

  // Timestamp display state
  const tsViewStr = ref(true) // true for formatted, false for raw timestamp

  // Use timezone-aware date formatting
  const { formatDateTimeWithMs } = useDateTimeFormat()

  // Column mode logic
  const mergeColumn = computed(() => props.columnMode !== 'separate')
  const showKeys = computed(() => props.columnMode === 'merged-with-keys')

  // Cap for a single column after measure / proportional assign.
  const COLUMN_MAX_WIDTH = 600
  // Virtual-list (and virtual merged mode): primary timestamp column fixed px.
  const TIME_COLUMN_FIXED_WIDTH = 200
  const columnWidths = ref<Record<string, number>>({})
  const widthsLocked = ref(false)
  let lockWidthsTimer: ReturnType<typeof setTimeout> | null = null

  const containerClasses = computed(() => ({
    'sticky-scroll': useStickySingleTable.value,
    'natural-column-widths': useStickySingleTable.value && columnResizableEnabled.value && !widthsLocked.value,
    'widths-locked': useStickySingleTable.value && columnResizableEnabled.value && widthsLocked.value,
  }))

  // Dynamic table classes computation
  const tableClassesDynamic = computed(() => {
    const baseClasses = {
      'wrap_table': props.wrapLine,
      'single_column': props.columnMode !== 'separate',
      'multiple_column': props.columnMode === 'separate',
      'virtual-list-active': hasVirtualListProps.value,
    }

    // Merge with any additional classes passed via props
    if (typeof props.class === 'string') {
      return { ...baseClasses, [props.class]: true }
    }
    if (typeof props.class === 'object') {
      return { ...baseClasses, ...props.class }
    }

    return baseClasses
  })

  // Table container ref for width calculation and height calculation
  const tableContainer = ref<HTMLElement>()
  // tableWidth is the container border-box width. In virtual-list mode the
  // real rendering area is smaller: .arco-virtual-list reserves space for the
  // vertical scrollbar / scrollbar-gutter (overflow:auto + scrollbar-gutter:
  // stable). Column widths are distributed against tableWidth, so if the sum
  // equals tableWidth the table is wider than the actual client area by the
  // scrollbar amount → a phantom horizontal scrollbar appears. This is an
  // inherent limitation of Arco's fixed-height virtual list: widths must be
  // pre-computed (no table-layout:auto), and the container width we measure
  // from the outside does not match the inner available width exactly.
  const { width: tableWidth } = useElementSize(tableContainer)

  // Timestamp utilities
  function isTimeColumn(column: ColumnType) {
    return dateTypes.indexOf(column.data_type) > -1
  }

  // ---------------------------------------------------------------------------
  // Table layout / column-width conclusions (keep in sync with CSS below)
  //
  // Ordinary mode (no virtual-list-props) — natural widths:
  //   - Single table + container scroll + sticky th (useStickySingleTable).
  //   - Phase 1 (.natural-column-widths): no column :width; table-layout:auto;
  //     size to header/body content (cap 600px). min-width:100% only when the
  //     table would be narrower than the container.
  //   - Phase 2 (.widths-locked): measure DOM → lock explicit px on each column;
  //     table-layout:fixed. Total may exceed viewport → horizontal scroll on
  //     .data-table-container. Do NOT scale columns up just to fill the screen.
  //   - Merged / single-column: same measure+lock for ts + Merged_Column (Data).
  //
  // Virtual-list mode (logs etc.) — fit screen, never wider than container:
  //   - No horizontal scroll (overflow-x hidden) so header and virtual body stay
  //     aligned; column widths must sum to ~container width.
  //   - Separate: sample content length (MAX_CONTENT_SAMPLE_ROWS); longest column
  //     omits explicit width (flex leftover); others get proportional width with
  //     min 150 / max COLUMN_MAX_WIDTH; every timestamp column (primary + other
  //     time cols) uses TIME_COLUMN_FIXED_WIDTH. Time cells use ellipsis under
  //     .virtual-list-active (overflow:visible would bleed into neighbors).
  //   - Merged: ts = TIME_COLUMN_FIXED_WIDTH; Data (Merged_Column) takes the rest.
  //   - Arco column-resizable is unsupported with virtual-list — do not enable.
  // ---------------------------------------------------------------------------
  const MAX_CONTENT_SAMPLE_ROWS = 100

  function getCellString(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  // Cell expand popover helpers (Grafana-style):
  // - Short multi-word text wraps vertically in the popover.
  // - Long text is fully shown in the popover to avoid extremely tall rows.
  const EXPAND_POPOVER_MAX_LENGTH = 140

  function isExpandPopoverWrapText(value: unknown) {
    const str = getCellString(value)
    return str.length > 0 && str.length <= EXPAND_POPOVER_MAX_LENGTH && /\s/.test(str)
  }

  function isExpandPopoverOverflowText(value: unknown) {
    return getCellString(value).length > EXPAND_POPOVER_MAX_LENGTH
  }

  function getCellContentClass(value: unknown) {
    if (props.wrapLine) {
      return { 'wrap-lines': true }
    }
    return {}
  }

  function isCellExpandable(value: unknown) {
    return !props.wrapLine && (isExpandPopoverWrapText(value) || isExpandPopoverOverflowText(value))
  }

  function getMergedRowString(record: TableData) {
    const fields = record.Merged_Column as [string, unknown][] | undefined
    if (!fields?.length) {
      return ''
    }
    return fields
      .map(([key, value]) => (showKeys.value ? `${key}: ${getCellString(value)}` : getCellString(value)))
      .join(' ')
  }

  function isMergedRowExpandable(record: TableData) {
    return isCellExpandable(getMergedRowString(record))
  }

  function getColumnContentMaxLength(columnName: string, rows: TableData[], limit = MAX_CONTENT_SAMPLE_ROWS): number {
    let max = 0
    const count = Math.min(rows.length, limit)
    for (let i = 0; i < count; i += 1) {
      const str = getCellString(rows[i]?.[columnName])
      if (str.length > max) {
        max = str.length
      }
    }
    return max
  }

  function getColumnContentLengths(
    columns: ColumnType[],
    rows: TableData[],
    limit = MAX_CONTENT_SAMPLE_ROWS
  ): Record<string, number> {
    const lengths: Record<string, number> = {}
    columns.forEach((column) => {
      lengths[column.name] = getColumnContentMaxLength(column.name, rows, limit)
    })
    return lengths
  }

  function findMaxLenCol(columns: ColumnType[], rows: TableData[]): string {
    const lengths = getColumnContentLengths(columns, rows)
    let max = 0
    let maxName = ''

    Object.keys(lengths).forEach((key) => {
      if (lengths[key] > max) {
        max = lengths[key]
        maxName = key
      }
    })

    return maxName
  }

  // Virtual-list column width: proportional allocation by content char-length.
  // Unlike the non-virtual path (which measures real DOM pixel widths after
  // render), the virtual list requires widths BEFORE render (Arco positions
  // cells via absolute offsets; table-layout:auto cannot measure off-screen
  // rows). So we estimate from data — a char-count heuristic, not DOM
  // measurement. The sum of allocated widths targets `containerWidth`
  // (tableWidth), but the actual available width is smaller (scrollbar/gutter),
  // so the longest column is left without a width (flex) to absorb the
  // difference and avoid exceeding the viewport.
  function getVirtualListColumnWidth(currLen: number, totalLen: number, containerWidth: number) {
    let width = (Math.floor((currLen / Math.max(totalLen, 1)) * 1000) / 1000) * containerWidth
    width = Math.max(150, width)
    width = Math.min(COLUMN_MAX_WIDTH, width)
    return width
  }

  /**
   * Build explicit px widths for virtual-list separate mode.
   * Returns null when container width is not ready yet (caller must not remount
   * with missing widths — Arco virtual-list ignores later :width updates).
   */
  function buildVirtualListColumnWidths(
    columns: ColumnType[],
    rows: TableData[],
    containerWidth: number
  ): Record<string, number | undefined> | null {
    if (!containerWidth || columns.length === 0) {
      return null
    }

    const contentLengths = getColumnContentLengths(columns, rows)
    const totalContentLen = Object.values(contentLengths).reduce((acc, len) => acc + len, 0)
    const maxLenName = findMaxLenCol(columns, rows)
    const widths: Record<string, number | undefined> = {}

    columns.forEach((column) => {
      if (column.name === maxLenName) {
        widths[column.name] = undefined
        return
      }
      if (column.name === props.tsColumn?.name || isTimeColumn(column)) {
        widths[column.name] = TIME_COLUMN_FIXED_WIDTH
      } else {
        widths[column.name] = getVirtualListColumnWidth(
          contentLengths[column.name] || 0,
          totalContentLen,
          containerWidth
        )
      }
    })

    return widths
  }

  // Visible columns (without width) for width calculation
  const visibleColumns = computed<ColumnType[]>(() => {
    if (mergeColumn.value) {
      return []
    }

    let tmpColumns = props.columns.slice()
    if (props.tsColumn) {
      tmpColumns = tmpColumns.filter((c) => c.name !== props.tsColumn.name)
      tmpColumns.unshift({
        name: props.tsColumn.name,
        data_type: props.tsColumn.data_type || 'timestamp',
        title: props.tsColumn.name,
      } as ColumnType)
    }

    return props.displayedColumns.length > 0
      ? tmpColumns.filter((c) => props.displayedColumns.indexOf(c.name) > -1)
      : tmpColumns
  })

  const columnsKey = computed(() => visibleColumns.value.map((c) => c.name).join(','))
  const tableSizeAttr = computed(() => String(attrsRecord.size || 'medium'))

  // Virtual-list: widths must be ready BEFORE a-table mounts. Store them in a ref
  // and only bump remount key after a successful recalculation for the new columnsKey.
  const virtualColumnWidths = ref<Record<string, number | undefined>>({})
  const virtualWidthsReadyForKey = ref('')
  const virtualRemountEpoch = ref(0)

  function recalculateVirtualColumnWidths() {
    if (!hasVirtualListProps.value || mergeColumn.value) {
      return
    }

    const key = columnsKey.value
    const widths = buildVirtualListColumnWidths(visibleColumns.value, props.data, tableWidth.value)
    if (!widths) {
      return
    }

    virtualColumnWidths.value = widths
    const keyChanged = virtualWidthsReadyForKey.value !== key
    virtualWidthsReadyForKey.value = key
    if (keyChanged) {
      virtualRemountEpoch.value += 1
    }
  }

  watch(
    [columnsKey, tableWidth, () => props.data, () => props.displayedColumns, mergeColumn],
    () => {
      recalculateVirtualColumnWidths()
    },
    { immediate: true, deep: true }
  )

  // Ordinary: remount only on columnMode (measure/lock handles width via layoutResetKey).
  // Virtual-list: remount when visible columns change AND widths for that set are ready
  // (epoch bumps only after recalculateVirtualColumnWidths succeeds).
  const tableRenderKey = computed(() =>
    hasVirtualListProps.value
      ? `${props.columnMode}|${virtualWidthsReadyForKey.value}|e${virtualRemountEpoch.value}`
      : props.columnMode
  )

  // Re-measure natural widths when columns / wrap / compact size / mode change.
  const layoutResetKey = computed(() => {
    if (!useStickySingleTable.value) return ''
    if (mergeColumn.value) {
      return `merged|${props.tsColumn?.name || ''}|${props.wrapLine}|${tableSizeAttr.value}`
    }
    return `${columnsKey.value}|${props.wrapLine}|${tableSizeAttr.value}`
  })

  function columnsForWidthLock(): ColumnType[] {
    if (mergeColumn.value) {
      const arr: ColumnType[] = []
      if (props.tsColumn) {
        arr.push({
          name: props.tsColumn.name,
          title: props.tsColumn.name,
          data_type: props.tsColumn.data_type || 'timestamp',
        } as ColumnType)
      }
      arr.push({
        name: 'Merged_Column',
        title: 'Data',
        data_type: 'merged',
      } as ColumnType)
      return arr
    }
    return visibleColumns.value
  }

  function getCellPaddingX(el: Element): number {
    const style = window.getComputedStyle(el)
    return (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
  }

  function measureCellNaturalWidth(el: HTMLElement): number {
    const layoutW = el.getBoundingClientRect().width
    const inner =
      (el.querySelector(
        '.arco-table-th-item-title, .arco-table-th-item, .cell-content, .timestamp-cell, .merged-cell-content, .arco-table-cell, .arco-table-td-content'
      ) as HTMLElement | null) || el
    const contentW = Math.max(inner.scrollWidth, inner.offsetWidth) + getCellPaddingX(el)
    // ceil + buffer: Arco col sets width=min=max; 1px short triggers header ellipsis.
    return Math.ceil(Math.max(layoutW, contentW)) + 4
  }

  function measureVisibleColumnWidths(columns: ColumnType[]): Record<string, number> | null {
    const root = tableContainer.value
    if (!root || columns.length === 0) {
      return null
    }

    const table = root.querySelector('.arco-table-element')
    if (!table) {
      return null
    }

    const isDataCell = (el: Element) => {
      if (
        el.classList.contains('arco-table-operation') ||
        el.classList.contains('arco-table-selection-col') ||
        el.classList.contains('arco-table-expand-col')
      ) {
        return false
      }
      return window.getComputedStyle(el).display !== 'none'
    }

    const headerCells = Array.from(table.querySelectorAll('thead tr:first-child > th')).filter(
      isDataCell
    ) as HTMLElement[]

    if (headerCells.length < columns.length) {
      return null
    }

    const firstRow = table.querySelector('tbody tr:not(.arco-table-tr-empty)')
    const bodyCells = firstRow ? (Array.from(firstRow.children).filter(isDataCell) as HTMLElement[]) : []

    const measured: Record<string, number> = {}
    columns.forEach((column, index) => {
      let width = measureCellNaturalWidth(headerCells[index])
      if (bodyCells[index]) {
        width = Math.max(width, measureCellNaturalWidth(bodyCells[index]))
      }
      measured[column.name] = Math.min(COLUMN_MAX_WIDTH, Math.max(40, width))
    })
    return measured
  }

  function clearLockWidthsSchedule() {
    if (lockWidthsTimer != null) {
      clearTimeout(lockWidthsTimer)
      lockWidthsTimer = null
    }
  }

  function lockMeasuredColumnWidths() {
    if (!useStickySingleTable.value || !columnResizableEnabled.value) {
      return
    }
    const columns = columnsForWidthLock()
    if (columns.length === 0) {
      widthsLocked.value = false
      return
    }

    const measured = measureVisibleColumnWidths(columns)
    if (!measured) {
      return
    }
    columnWidths.value = measured
    widthsLocked.value = true
  }

  function scheduleLockWidthsAfterRender() {
    if (!useStickySingleTable.value || !columnResizableEnabled.value) {
      columnWidths.value = {}
      widthsLocked.value = false
      return
    }
    clearLockWidthsSchedule()
    columnWidths.value = {}
    widthsLocked.value = false
    nextTick(() => {
      lockWidthsTimer = setTimeout(() => {
        lockWidthsTimer = null
        lockMeasuredColumnWidths()
      }, 50)
    })
  }

  watch(
    layoutResetKey,
    (key) => {
      if (!key) {
        clearLockWidthsSchedule()
        columnWidths.value = {}
        widthsLocked.value = false
        return
      }
      if (!columnResizableEnabled.value) {
        clearLockWidthsSchedule()
        columnWidths.value = {}
        widthsLocked.value = false
        return
      }
      scheduleLockWidthsAfterRender()
    },
    { immediate: true }
  )

  // Re-measure once data first arrives (empty → rows) so body cells are included.
  watch(
    () => (useStickySingleTable.value ? props.data.length > 0 : false),
    (hasData, hadData) => {
      if (!columnResizableEnabled.value) return
      if (hasData && !hadData && layoutResetKey.value) {
        scheduleLockWidthsAfterRender()
      }
    }
  )

  const lockedTableWidthPx = computed(() => {
    if (!useStickySingleTable.value || !widthsLocked.value) {
      return undefined
    }
    const total = Object.values(columnWidths.value).reduce((sum, width) => sum + width, 0)
    return total > 0 ? total : undefined
  })

  function onColumnResize(dataIndex: string, width: number) {
    if (!useStickySingleTable.value || !columnResizableEnabled.value || !dataIndex || !(width > 0)) {
      return
    }
    columnWidths.value = {
      ...columnWidths.value,
      [dataIndex]: Math.round(width),
    }
    widthsLocked.value = true
  }

  function getSemanticThClass(column: ColumnType) {
    return column.semantic_type?.toLowerCase()
  }

  type TableColumn = ColumnType & { width?: number; cellClass?: string }

  // Tag first/last columns with edge classes so CSS can give them wider
  // padding for alignment with surrounding panels. Using Arco's cellClass /
  // headerCellClass props (not CSS :first-child/:last-child) because Arco
  // renders hidden operation/selection columns before the data columns,
  // making :first-child match the wrong element.
  function withEdgeCellClass(columns: TableColumn[]): TableColumn[] {
    if (columns.length === 0) return columns
    return columns.map((col, index) => ({
      ...col,
      cellClass: [
        col.cellClass,
        index === 0 ? 'cell-edge-left' : '',
        index === columns.length - 1 ? 'cell-edge-right' : '',
      ]
        .filter(Boolean)
        .join(' '),
    }))
  }

  // Assign column :width per layout conclusions above.
  const processedColumns = computed((): TableColumn[] => {
    if (!mergeColumn.value) {
      // Separate mode
      if (hasVirtualListProps.value) {
        // Prefer widths from recalculateVirtualColumnWidths (ready before remount).
        const ready = virtualWidthsReadyForKey.value === columnsKey.value
        const stored = virtualColumnWidths.value
        return withEdgeCellClass(
          visibleColumns.value.map((column) => {
            if (ready && Object.prototype.hasOwnProperty.call(stored, column.name)) {
              const width = stored[column.name]
              return width !== undefined ? { ...column, width } : { ...column }
            }
            return { ...column }
          })
        )
      }

      // Ordinary: omit width until lock; then measured natural px snapshot.
      return withEdgeCellClass(
        visibleColumns.value.map((column) => {
          const { width: _omit, ...rest } = column as TableColumn
          const locked = columnWidths.value[column.name]
          return locked !== undefined ? { ...rest, width: locked } : rest
        })
      )
    }

    // Merged: virtual → fixed ts + flexible Data; ordinary → measure+lock.
    const arr: TableColumn[] = []
    if (props.tsColumn) {
      const locked = columnWidths.value[props.tsColumn.name]
      let width: number | undefined
      if (hasVirtualListProps.value) {
        width = TIME_COLUMN_FIXED_WIDTH
      } else if (locked !== undefined) {
        width = locked
      }
      arr.push({
        name: props.tsColumn.name,
        title: props.tsColumn.name,
        data_type: props.tsColumn.data_type || 'timestamp',
        ...(width !== undefined ? { width } : {}),
      })
    }
    const mergedLocked = columnWidths.value.Merged_Column
    arr.push({
      name: 'Merged_Column',
      title: 'Data',
      data_type: 'merged',
      ...(!hasVirtualListProps.value && mergedLocked !== undefined ? { width: mergedLocked } : {}),
    })
    return withEdgeCellClass(arr)
  })

  const tablePassThroughProps = computed(() => {
    const { scroll: attrsScroll, ...restAttrs } = attrsRecord

    if (hasVirtualListProps.value) {
      const extraScroll = typeof attrsScroll === 'object' && attrsScroll ? attrsScroll : {}
      return {
        loading: false,
        size: 'medium',
        ...restAttrs,
        scroll: {
          ...extraScroll,
        },
      }
    }

    // Non-virtual: single table, container scrolls; no Arco scroll / custom scrollbar.
    return {
      loading: false,
      size: 'medium',
      ...restAttrs,
      scrollbar: false,
    }
  })

  // Data fields for merged mode
  const dataFields = computed(() => {
    if (!props.tsColumn) {
      return props.displayedColumns
    }
    return props.displayedColumns.filter((field) => field !== props.tsColumn.name)
  })

  // Helper function for getting entry fields in merged mode
  const getEntryFields = (record: any) => {
    const copyRecord = { ...record }
    delete copyRecord.index
    Object.keys(copyRecord).forEach((k) => {
      if (dataFields.value.indexOf(k) === -1) {
        delete copyRecord[k]
      }
    })
    return Object.entries(copyRecord)
  }

  // Computed data based on mode
  const processedData = computed(() => {
    if (!mergeColumn.value) {
      // Separate mode: use original data
      return props.data.map((record, index) => {
        return {
          ...record,
          __rowIndex: index,
        }
      })
    }

    // Merged mode: transform data to include merged column
    return props.data.map((record, index) => {
      const transformedRecord = { ...record, __rowIndex: index } as any

      // Create the merged data field from all non-timestamp fields
      const entryFields = getEntryFields(record).filter((value) => value[1] !== null && value[1] !== undefined)
      transformedRecord.Merged_Column = entryFields

      return transformedRecord
    })
  })

  function changeTsView() {
    tsViewStr.value = !tsViewStr.value
  }

  function handleTsCellClick(record: TableData, rowIndex: number) {
    emit('tsCellClick', record, rowIndex)
  }

  function renderTs(record: any, columnName: string) {
    const timestamp = record[columnName]

    if (!timestamp) return timestamp

    if (tsViewStr.value) {
      // Show formatted timestamp
      const column = processedColumns.value.find((col) => col.name === columnName)
      if (!column) return timestamp

      // Use timezone-aware formatting with milliseconds
      return formatDateTimeWithMs(timestamp, column.data_type) || timestamp
    }

    // Show raw timestamp number
    return timestamp
  }

  function getRenderedValue(record: any, column: ColumnType) {
    if (isTimeColumn(column)) {
      return renderTs(record, column.name)
    }
    return record[column.name]
  }

  function canShowCopyButton(value: unknown) {
    return props.enableCellCopy && value !== null && value !== undefined
  }

  function cellTextForCopy(value: unknown) {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2)
      } catch {
        return '[Unsupported Object]'
      }
    }
    return String(value)
  }

  async function copyCellValue(value: unknown) {
    const text = cellTextForCopy(value)
    if (!text) return

    try {
      await navigator.clipboard.writeText(text)
      Message.success(i18n.global.t('copied'))
    } catch (error) {
      console.error('Failed to copy cell value:', error)
    }
  }

  // No pagination or column management - pure table functionality

  // Context menu functionality
  const contextMenuVisible = ref(false)
  const contextMenuPosition = ref({ x: 0, y: 0 })
  const filterOptions = shallowRef([])
  const triggerCell = ref()

  // Virtual-list cell expand popover state (single open at a time)
  const expandedPopoverKey = ref<string | null>(null)

  // Keep the context-menu trigger icon visible while its dropdown is open,
  // even if the mouse has moved onto the dropdown itself.
  const activeContextMenuKey = ref<string | null>(null)

  function getRowIndex(record: TableData) {
    if (typeof record.__globalRowIndex === 'number') {
      return record.__globalRowIndex
    }
    return record.__rowIndex ?? 0
  }

  function getRowClass(record: TableData) {
    if (props.activeRowKey === null || props.activeRowKey === undefined) {
      return ''
    }
    return getRowIndex(record) === props.activeRowKey ? 'data-table-row-active' : ''
  }

  function getCellKey(record: TableData, columnName: string) {
    return `${record.__rowIndex ?? 0}-${columnName}`
  }

  function getCellExpandKey(record: TableData, columnName: string) {
    return getCellKey(record, columnName)
  }

  function isContextMenuActive(record: TableData, columnName: string) {
    return activeContextMenuKey.value === getCellKey(record, columnName)
  }

  function isExpandActive(record: TableData, columnName: string) {
    return expandedPopoverKey.value === getCellExpandKey(record, columnName)
  }

  function handleExpandVisibleChange(key: string, visible: boolean) {
    expandedPopoverKey.value = visible ? key : null
  }

  // Close the cell expand popover on any internal scroll so it doesn't float
  // away from its trigger row.
  function closeExpandPopover() {
    expandedPopoverKey.value = null
  }

  onMounted(() => {
    nextTick(() => {
      tableContainer.value?.addEventListener('scroll', closeExpandPopover, { passive: true, capture: true })
    })
  })

  onBeforeUnmount(() => {
    clearLockWidthsSchedule()
    tableContainer.value?.removeEventListener('scroll', closeExpandPopover, { capture: true })
  })

  function handleContextMenu(record: TableData, columnName: string, event: Event) {
    if (!props.showContextMenu) {
      return
    }

    const rect = (event.target as Element).getBoundingClientRect()
    triggerCell.value = [record, columnName]
    activeContextMenuKey.value = getCellKey(record, columnName)
    event.preventDefault()

    // Set available filter options based on column type
    const column = props.columns.find((col) => col.name === columnName)
    if (column) {
      if (column.data_type && column.data_type.toLowerCase() === 'json') {
        filterOptions.value = []
      } else if (isTimeColumn(column)) {
        filterOptions.value = ['>=', '<=']
      } else {
        filterOptions.value = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE']
      }
    }

    contextMenuPosition.value = { x: rect.left, y: rect.bottom }
    contextMenuVisible.value = true
  }

  function hideContextMenu() {
    contextMenuVisible.value = false
    activeContextMenuKey.value = null
  }

  async function handleMenuClick(value: string | number | Record<string, any>) {
    const action = String(value)
    if (!triggerCell.value) {
      return
    }
    const [record, columnName] = triggerCell.value

    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(record[columnName])
        console.log('Copied to clipboard:', record[columnName])
      } catch (error) {
        console.error('Failed to copy to clipboard:', error)
      }
    } else if (action === 'inspect') {
      emit('rowSelect', record, record.__rowIndex ?? 0)
    } else if (action.startsWith('filter')) {
      const operator = action.split('_')[1]
      emit('filterConditionAdd', { columnName, operator, value: record[columnName] })
    }
    hideContextMenu()
  }
</script>

<style lang="less" scoped>
  // Data table container - full height layout with fixed header
  .data-table-container {
    height: 100%; // Always fill parent height
    overflow: hidden; // Prevent container overflow (virtual-list / default)

    // Cell horizontal padding — tuned via CSS variables in one place.
    // Inner cells use --gpt-cell-px; first/last columns use --gpt-cell-edge-px
    // so the table edges stay aligned with surrounding panels.
    // Edge classes are applied via Arco's cellClass/headerCellClass props
    // (see withEdgeCellClass) because :first-child/:last-child would match
    // Arco's hidden operation/selection columns instead of the first/last
    // data column.
    --gpt-cell-px: 10px;
    --gpt-cell-edge-px: 16px;

    :deep(.arco-table-cell) {
      padding-left: var(--gpt-cell-px);
      padding-right: var(--gpt-cell-px);
    }
    :deep(.cell-edge-left .arco-table-cell) {
      padding-left: var(--gpt-cell-edge-px);
    }
    :deep(.cell-edge-right .arco-table-cell) {
      padding-right: var(--gpt-cell-edge-px);
    }

    // Non-virtual: single table scrolls here; sticky th pins header.
    &.sticky-scroll {
      overflow: auto;

      :deep(.arco-table-wrapper),
      :deep(.arco-table-container),
      :deep(.arco-table-content),
      :deep(.arco-table-content-scroll),
      :deep(.arco-table-body) {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }

      :deep(.arco-scrollbar),
      :deep(.arco-scrollbar-track) {
        display: none;
      }

      :deep(.arco-table-th) {
        position: sticky;
        top: 0;
        z-index: 10;
        background-color: var(--gpt-table-head-bg) !important;
        background-clip: padding-box;
        overflow: visible;
      }

      :deep(.arco-table-th .arco-table-cell),
      :deep(.arco-table-th .arco-table-th-item) {
        background-color: var(--gpt-table-head-bg);
      }

      :deep(.arco-table-column-handle) {
        z-index: 11;
        width: 10px;
        right: -5px;
      }
    }

    // Table wrapper height management
    :deep(.arco-table-wrapper) {
      height: 100%;
    }

    :deep(.arco-scrollbar-track-direction-vertical) {
      background: transparent;
      border-right: 0;
      border-left: 0;
    }

    :deep(.arco-scrollbar-thumb-direction-vertical .arco-scrollbar-thumb-bar) {
      width: 8px;
      margin: 0;
      background-color: var(--gpt-scrollbar-thumb-color);
      border-radius: var(--gpt-scrollbar-thumb-radius);
    }

    :deep(.arco-scrollbar-thumb-direction-vertical:hover .arco-scrollbar-thumb-bar),
    :deep(.arco-scrollbar-thumb-dragging .arco-scrollbar-thumb-bar) {
      background-color: var(--color-neutral-6);
    }

    :deep(.arco-virtual-list) {
      &::-webkit-scrollbar {
        width: 8px;
        background: transparent;
      }

      &::-webkit-scrollbar-track {
        background: transparent;
        border: 0;
        box-shadow: none;
      }

      &::-webkit-scrollbar-thumb {
        background-color: var(--gpt-scrollbar-thumb-color);
        border-radius: var(--gpt-scrollbar-thumb-radius);
      }

      &::-webkit-scrollbar-thumb:hover {
        background-color: var(--color-neutral-6);
      }
    }

    // Row hover background is provided by Arco Table's built-in hoverable styles
    // via the theme variable --gpt-table-row-hover-bg; no override needed here.

    :deep(.data-table-row-active td) {
      background-color: var(--gpt-nav-active-bg) !important;
    }

    :deep(.data-table-row-active td:first-child) {
      box-shadow: inset 3px 0 0 var(--gpt-nav-active-indicator);
    }
  }

  // Empty state: do not flex the td — breaks colspan centering.
  :deep(.arco-table-tr-empty .arco-table-td) {
    text-align: center;
  }

  :deep(.data-table-empty .arco-empty-description) {
    font-family: var(--font-mono);
    font-size: var(--gpt-font-lg);
  }

  .data-table-empty-icon {
    width: 52px;
    height: 52px;
  }
  // Context menu positioning
  #td-context {
    position: absolute;
    z-index: 999999;
  }

  // Cell action icons (context menu + expand) — shared base
  .cell-action-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    color: var(--gpt-main-purple);
    background: var(--color-bg-2);
    border-radius: 3px;
    box-shadow: 0 0 2px 2px var(--color-bg-2);
    cursor: pointer;
    transition: transform 0.1s ease, background-color 0.1s ease, color 0.1s ease, box-shadow 0.1s ease;

    svg {
      color: currentColor;
    }

    &:hover,
    &.active {
      transform: scale(1.15);
      box-shadow: 0 0 2px 2px var(--color-bg-2), inset 0 0 0 1px var(--gpt-main-purple);
    }
  }

  // Absolute-positioned action group (regular cells)
  .cell-actions {
    position: absolute;
    right: -15px;
    top: 4px;
    display: none;
    align-items: center;
    gap: 6px;
    z-index: 10;
  }

  :deep(.arco-table-cell:hover) .cell-actions,
  :deep(.arco-table-td:hover) .cell-actions,
  .cell-wrapper:hover > .cell-actions,
  .cell-actions:has(.cell-action-icon.active) {
    display: flex;
  }

  :deep(.arco-table-td) {
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
  }
  :deep(.arco-table-tr .arco-table-operation:first-child) {
    display: none;
  }
  :deep(.arco-table-selection-radio-col) {
    display: none;
  }
  :deep(.arco-drawer-container) {
    left: auto;
    width: 800px;
    overflow: hidden;
  }
  .clickable {
    cursor: pointer;
  }
  .cell-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    cursor: default;
  }
  .cell-content {
    // nowrap is REQUIRED by the virtual-list fixed-row-height constraint
    // (see the block comment near `hasVirtualListProps`). Multi-line content
    // (e.g. log messages containing \n) is collapsed to a single line here;
    // users view the full content via the expand popover (pre-wrap). The
    // `wrap-lines` class (applied when props.wrapLine is true) switches to
    // `pre-wrap` to show newlines inline — but this is only safe in
    // non-virtual mode where row height is not fixed by the scroller.
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    word-break: normal;
    user-select: text;
  }

  // Ordinary mode: time cells may stay visible when columns are naturally wide.
  // Virtual-list overrides below — overflow:visible there bleeds into neighbors.
  .timestamp-cell-content {
    overflow: visible;
    text-overflow: unset;
  }

  :deep(.arco-table-td-content:has(.timestamp-cell-content)) {
    overflow: visible;
    text-overflow: unset;
  }

  // Virtual-list packs columns tightly; clip secondary (and primary) time cells.
  // Keep clipping on hover too — global td:hover overflow:visible would otherwise
  // let formatted timestamps spill into the next column.
  .virtual-list-active {
    .timestamp-cell-content {
      display: block;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .timestamp-cell {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :deep(.arco-table-td-content:has(.timestamp-cell-content)) {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    :deep(.arco-table-td:hover:has(.timestamp-cell-content)),
    :deep(.arco-table-td:hover .arco-table-td-content:has(.timestamp-cell-content)) {
      overflow: hidden;
    }
  }

  // Show cell action buttons on hover. The popover itself is body-mounted and
  // closed on scroll, so table overflow rules do not clip it.
  :deep(.arco-table-td:hover) {
    overflow: visible;
  }

  :deep(.arco-table-td:hover .arco-table-td-content) {
    overflow: visible;
  }

  // Merged / single-column: whole Data line ellipsis when overflowing.
  .merged-cell-content {
    display: block;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: text;
  }

  .entity-field {
    display: inline;
    margin-right: 10px;
    white-space: nowrap;
  }

  .entity-field-text {
    white-space: nowrap;
  }

  .merged-cell-content.wrap-lines {
    overflow: visible;
    text-overflow: unset;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .merged-cell-content.wrap-lines .entity-field,
  .merged-cell-content.wrap-lines .entity-field-text {
    white-space: inherit;
    word-break: inherit;
  }

  .cell-popover-content {
    max-width: 600px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .cell-content.wrap-lines {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .cell-copy-button {
    position: absolute;
    bottom: 2px;
    right: -15px;
    width: 16px;
    height: 16px;
    display: none;
    align-items: center;
    justify-content: center;

    border-radius: 3px;
    z-index: 10;
    cursor: pointer;
    transition: all 0.1s ease;
  }
  :deep(.arco-table-cell:hover) .cell-copy-button {
    display: flex;
  }
  .cell-copy-button:hover {
    transform: scale(1.15);
  }
  .builder-type .clickable {
    cursor: pointer;
  }
  :deep(.arco-drawer) {
    border: 1px solid var(--gpt-border-default);
  }

  // Ordinary natural phase: content-sized columns (max 600); min-width 100% if narrow.
  // Disable ellipsis while measuring — overflow:hidden would shrink below intrinsic
  // text width and locking that would truncate headers.
  .data-table-container.natural-column-widths {
    :deep(.arco-table-element) {
      table-layout: auto !important;
      width: max-content !important;
      min-width: 100%;
    }

    :deep(.arco-table-th),
    :deep(.arco-table-tr:not(.arco-table-tr-empty) .arco-table-td) {
      max-width: 600px;
    }

    :deep(.arco-table-th),
    :deep(.arco-table-tr:not(.arco-table-tr-empty) .arco-table-td),
    :deep(.arco-table-th-item),
    :deep(.arco-table-th-item-title),
    :deep(.arco-table-td-content),
    :deep(.cell-content),
    :deep(.merged-cell-content) {
      overflow: visible !important;
      text-overflow: clip !important;
    }
  }

  // After lock: fixed layout + explicit table width so Arco col resize is visible.
  .data-table-container.widths-locked {
    :deep(.arco-table-element) {
      table-layout: fixed !important;
      width: var(--data-table-locked-width, max-content) !important;
      min-width: 100%;
    }
  }

  // Virtual-list: keep table ≤ container (no overflow-x). Horizontal scroll would
  // misalign sticky header vs virtual body; widths must fit the screen.
  .multiple_column.virtual-list-active,
  .single_column.virtual-list-active {
    :deep(.arco-scrollbar-track-direction-horizontal) {
      display: none;
    }

    :deep(.arco-scrollbar-container),
    :deep(.arco-table-body) {
      overflow-x: hidden !important;
    }

    :deep(.arco-table-wrapper) {
      overflow-x: hidden;
    }

    :deep(.arco-virtual-list) {
      overflow-x: hidden !important;
      scrollbar-gutter: stable;

      &::-webkit-scrollbar:horizontal {
        height: 0;
      }

      > .arco-table-element {
        width: 100%;
        table-layout: fixed;
      }
    }
  }

  .multiple_column,
  .single_column {
    width: 100%;

    :deep(.arco-table-td .arco-table-td-content) {
      max-width: 100%;
      min-width: 0;
    }
  }

  :deep(.arco-table-th) {
    position: relative;
    // Must be visible: Arco resize handle sits at right:-4px.
    overflow: visible;
    text-overflow: ellipsis;
  }

  :deep(.arco-table-th-item),
  :deep(.arco-table-td-content) {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :deep(.arco-table-th:not(:last-child)::after) {
    content: '';
    position: absolute;
    top: 8px;
    right: 0;
    bottom: 8px;
    width: 1px;
    background: var(--gpt-border-strong);
  }

  :deep(.arco-table-td),
  :deep(.arco-table-th) {
    white-space: nowrap;
  }
  .wrap_table :deep(.arco-table-td),
  .wrap_table :deep(.arco-table-th) {
    white-space: wrap;
  }

  .multiple_column,
  .single_column {
    :deep(.arco-table-td-content) {
      position: relative;
      width: 100%;
    }

    :deep(.arco-table-td-content:has(.has-merged-expand)) {
      padding-right: 15px;
    }
  }
  :deep(.arco-table-size-mini).multiple_column,
  :deep(.arco-table-size-mini).single_column {
    :deep(.arco-table-td-content) {
      padding-right: 12px;
    }

    :deep(.arco-table-td-content:has(.cell-actions)) {
      padding-right: 18px;
    }

    :deep(.arco-table-td-content:has(.cell-actions .cell-action-icon + .cell-action-icon)) {
      padding-right: 36px;
    }

    :deep(.arco-table-td-content:has(.has-merged-expand)) {
      padding-right: 12px;
    }

    .cell-actions {
      top: 3px;
    }
  }
  :deep(.arco-table-size-mini) .cell-action-icon {
    width: 12px;
    height: 12px;
  }
</style>
