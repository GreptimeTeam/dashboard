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
                    span.gpt-semantic-th-text {{ col.name }}
              template(v-else-if="col.semantic_type")
                span.gpt-semantic-th(:class="getSemanticThClass(col)")
                  span.gpt-semantic-th-text {{ col.title || col.name }}
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
                .cell-wrapper
                  a-popover(
                    v-if="!props.wrapLine && isColumnExpandable('Merged_Column')"
                    trigger="click"
                    position="top"
                    :popup-visible="isExpandActive(record, 'Merged_Column')"
                    @popupVisibleChange="(visible) => handleExpandVisibleChange(getCellExpandKey(record, 'Merged_Column'), visible)"
                  )
                    template(#content)
                      .cell-popover-content {{ getMergedRowString(record) }}
                    .merged-cell-content.cell-content--expandable(
                      :class="getCellContentClass(null)"
                      :title="$t('common.inspectValue')"
                    )
                      span.entity-field(v-for="field in record.Merged_Column" :key="field[0]")
                        span.entity-field-text
                          span(v-if="showKeys" style="color: var(--gpt-text-muted)")
                            | {{ field[0] }}:
                          | {{ field[1] }}
                  .merged-cell-content(v-else :class="getCellContentClass(null)")
                    span.entity-field(v-for="field in record.Merged_Column" :key="field[0]")
                      span.entity-field-text
                        span(v-if="showKeys" style="color: var(--gpt-text-muted)")
                          | {{ field[0] }}:
                        | {{ field[1] }}
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
                    span.cell-action-icon(@click.stop="(event) => handleContextMenu(record, col.name, event)")
                      svg.icon-12
                        use(href="#menu")
              template(v-else)
                .cell-wrapper
                  a-popover(
                    v-if="!props.wrapLine && isColumnExpandable(col.name)"
                    trigger="click"
                    position="top"
                    :popup-visible="isExpandActive(record, col.name)"
                    @popupVisibleChange="(visible) => handleExpandVisibleChange(getCellExpandKey(record, col.name), visible)"
                  )
                    template(#content)
                      .cell-popover-content {{ getCellString(record[col.name]) }}
                    .cell-content.cell-content--expandable(
                      :class="getCellContentClass(record[col.name])"
                      :title="$t('common.inspectValue')"
                    )
                      span {{ record[col.name] }}
                  .cell-content(v-else :class="getCellContentClass(record[col.name])")
                    span {{ record[col.name] }}
                  .cell-actions(v-if="showContextMenu")
                    span.cell-action-icon(@click.stop="(event) => handleContextMenu(record, col.name, event)")
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
    a-dsubmenu(v-if="filterOptions.length > 0" trigger="hover") Filter
      template(#content)
        a-doption(v-for="op in filterOptions" :key="op" :value="`filter_${op}`") {{ op }} value
</template>

<script setup lang="ts">
  import { ref, computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useAttrs, watch } from 'vue'
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
  const emit = defineEmits(['filterConditionAdd', 'rowSelect', 'tsCellClick', 'virtualColumnsClipped'])

  // Timestamp display state
  const tsViewStr = ref(true) // true for formatted, false for raw timestamp

  // Use timezone-aware date formatting
  const { formatDateTimeWithMs } = useDateTimeFormat()

  // Column mode logic
  const mergeColumn = computed(() => props.columnMode !== 'separate')
  const showKeys = computed(() => props.columnMode === 'merged-with-keys')

  // Soft cap for ordinary fit + virtual estimates. Ordinary may exceed this when
  // leftover is returned to columns still below their measured natural width.
  const COLUMN_MAX_WIDTH = 600
  // Virtual-list (and virtual merged mode): primary timestamp column fixed px.
  const TIME_COLUMN_FIXED_WIDTH = 200
  // Ordinary: uncapped measured naturals (for fit + expand). Resize may update
  // columnWidths for fit intent; measuredNaturalWidths stays for expand compare.
  const columnWidths = ref<Record<string, number>>({})
  const measuredNaturalWidths = ref<Record<string, number>>({})
  const widthsLocked = ref(false)
  let lockWidthsTimer: ReturnType<typeof setTimeout> | null = null

  // Ordinary: measuring (content-sized) → locked (explicit px + fit).
  const containerClasses = computed(() => ({
    'sticky-scroll': useStickySingleTable.value,
    'natural-column-widths': useStickySingleTable.value && !widthsLocked.value,
    'widths-locked': useStickySingleTable.value && widthsLocked.value,
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
  // Column width rules (keep JS + CSS in sync)
  //
  // ## Ordinary tables (no virtual-list-props)
  //
  // Principle: always size by natural content width; table stays ≥ 100% wide.
  //
  // Pipeline (all ordinary tables, with or without column-resizable):
  //   1. Measure — render with .natural-column-widths (table width:max-content,
  //      overflow visible) and read each column’s scrollWidth from header + up to
  //      MEASURE_SAMPLE_ROWS body cells. Store uncapped naturals in columnWidths.
  //   2. Lock — switch to .widths-locked: table-layout:fixed, each column gets an
  //      explicit :width from displayColumnWidths / fitColumnWidths.
  //   3. Fit (fitColumnWidths) whenever container width is known:
  //        a. Soft-cap every column at COLUMN_MAX_WIDTH (600).
  //        b. If sum < container: give leftover first to columns still below their
  //           true natural width (proportional to deficit) — so a long metrics
  //           series column can grow past 600 when space exists.
  //        c. Any remainder → last column (table fills ≥ 100%).
  //        d. If soft-capped sum still > container → keep those widths; table
  //           width = max(sum, container) → horizontal scroll on the container.
  //
  // Resize: column-resizable updates the base natural for that column; fit runs
  // again. Container resize recomputes fit via tableWidth → displayColumnWidths.
  //
  // Merged / single-column: same pipeline (ts + Merged_Column; Data is last).
  //
  // ## Cell expand (ordinary + virtual)
  //
  // Column-level only: if measured/estimated natural width > fitted/assigned
  // width (+ epsilon), every cell in that column gets the expand popover.
  // No per-cell char-length heuristic — aligns with ellipsis at column grain.
  // wrapLine disables expand; time columns never use expand popover.
  //
  // ## Virtual-list (logs etc.)
  //
  // Cannot measure off-screen rows. Estimate px from sampled text
  // (VIRTUAL_CHAR_WIDTH_PX + padding), cap COLUMN_MAX_WIDTH; timestamp columns
  // use TIME_COLUMN_FIXED_WIDTH. Longest column omits :width to absorb leftover.
  // No horizontal scroll (overflow-x hidden); excess columns clip + hint.
  // Merged: ts fixed; Data takes the rest. column-resizable remounts on pointerup.
  // ---------------------------------------------------------------------------
  const MAX_CONTENT_SAMPLE_ROWS = 100
  // Rough table font advance + th/td horizontal padding (char heuristic, not DOM).
  const VIRTUAL_CHAR_WIDTH_PX = 8
  const VIRTUAL_CELL_PADDING_X = 32
  const MEASURE_SAMPLE_ROWS = 30
  /** natural > fitted + epsilon → column shows ellipsis → expand popup */
  const EXPAND_WIDTH_EPSILON = 1

  function getCellString(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  function getCellKey(record: TableData, columnName: string) {
    return `${record.__rowIndex ?? 0}-${columnName}`
  }

  function getCellExpandKey(record: TableData, columnName: string) {
    return getCellKey(record, columnName)
  }

  function getCellContentClass(value: unknown) {
    if (props.wrapLine) {
      return { 'wrap-lines': true }
    }
    return {}
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

  function getColumnHeaderText(column: ColumnType): string {
    return String(column.title ?? column.name ?? '')
  }

  /** Natural-width char length: max(header, sampled cell text), same idea as DOM measure. */
  function getColumnNaturalCharLength(column: ColumnType, rows: TableData[], limit = MAX_CONTENT_SAMPLE_ROWS): number {
    return Math.max(getColumnHeaderText(column).length, getColumnContentMaxLength(column.name, rows, limit))
  }

  function getColumnNaturalCharLengths(
    columns: ColumnType[],
    rows: TableData[],
    limit = MAX_CONTENT_SAMPLE_ROWS
  ): Record<string, number> {
    const lengths: Record<string, number> = {}
    columns.forEach((column) => {
      lengths[column.name] = getColumnNaturalCharLength(column, rows, limit)
    })
    return lengths
  }

  function findMaxLenCol(columns: ColumnType[], rows: TableData[]): string {
    const lengths = getColumnNaturalCharLengths(columns, rows)
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

  // Virtual-list: estimate natural px from text (cannot measure off-screen rows).
  // Longest column is left without width so leftover container space is absorbed
  // on the rightmost long column (virtual-list cannot leave empty table chrome).
  function estimateVirtualNaturalWidthPx(charLen: number): number {
    return Math.min(COLUMN_MAX_WIDTH, Math.ceil(charLen * VIRTUAL_CHAR_WIDTH_PX + VIRTUAL_CELL_PADDING_X))
  }

  /** Uncapped virtual estimate — used for expand (natural > fitted). */
  function estimateVirtualNaturalWidthPxUncapped(charLen: number): number {
    return Math.ceil(charLen * VIRTUAL_CHAR_WIDTH_PX + VIRTUAL_CELL_PADDING_X)
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

    const naturalLengths = getColumnNaturalCharLengths(columns, rows)
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
        widths[column.name] = estimateVirtualNaturalWidthPx(naturalLengths[column.name] || 0)
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

  // Virtual-list: widths must be ready BEFORE a-table mounts.
  // Arco virtual-list ignores later :width updates and can misalign header/body when
  // columns change without remount. Remount on columnsKey / estimated-width change.
  const virtualColumnWidths = ref<Record<string, number | undefined>>({})
  const virtualWidthsReadyForKey = ref('')
  const virtualRemountEpoch = ref(0)
  const virtualColumnClippedHintVisible = ref(false)
  // User-resized widths (virtual separate mode). Survive re-query; cleared when
  // the visible column set changes.
  const virtualWidthOverrides = ref<Record<string, number>>({})
  let virtualResizePending: { dataIndex: string; width: number } | null = null
  let virtualResizeListening = false

  function areVirtualWidthsEqual(
    a: Record<string, number | undefined>,
    b: Record<string, number | undefined>
  ): boolean {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) {
      return false
    }
    return keysA.every((key) => a[key] === b[key])
  }

  function updateVirtualClippedHint(widths: Record<string, number | undefined>) {
    const explicitSum = Object.values(widths).reduce((sum, w) => sum + (typeof w === 'number' ? w : 0), 0)
    virtualColumnClippedHintVisible.value = explicitSum > tableWidth.value + 1
    emit('virtualColumnsClipped', virtualColumnClippedHintVisible.value)
  }

  function applyVirtualWidthOverrides(widths: Record<string, number | undefined>) {
    const overrides = virtualWidthOverrides.value
    Object.keys(overrides).forEach((name) => {
      if (visibleColumns.value.some((column) => column.name === name)) {
        widths[name] = overrides[name]
      }
    })
  }

  function commitVirtualColumnResize() {
    virtualResizeListening = false
    const pending = virtualResizePending
    virtualResizePending = null
    if (!pending || !hasVirtualListProps.value || mergeColumn.value) {
      return
    }

    virtualWidthOverrides.value = {
      ...virtualWidthOverrides.value,
      [pending.dataIndex]: pending.width,
    }
    virtualColumnWidths.value = {
      ...virtualColumnWidths.value,
      [pending.dataIndex]: pending.width,
    }
    updateVirtualClippedHint(virtualColumnWidths.value)
    // Remount after drag ends — remounting mid-drag cancels Arco's resize handle.
    virtualRemountEpoch.value += 1
  }

  function recalculateVirtualColumnWidths() {
    if (!hasVirtualListProps.value || mergeColumn.value) {
      // In merged mode (or non-virtual mode) we don't calculate virtual widths,
      // so proactively clear the hint state to avoid stale values.
      virtualColumnClippedHintVisible.value = false
      emit('virtualColumnsClipped', false)
      return
    }

    const key = columnsKey.value
    const keyChanged = virtualWidthsReadyForKey.value !== key
    if (keyChanged) {
      virtualWidthOverrides.value = {}
    }

    const widths = buildVirtualListColumnWidths(visibleColumns.value, props.data, tableWidth.value)
    if (!widths) {
      return
    }

    applyVirtualWidthOverrides(widths)

    const widthsChanged = !areVirtualWidthsEqual(virtualColumnWidths.value, widths)

    virtualColumnWidths.value = widths
    updateVirtualClippedHint(widths)

    virtualWidthsReadyForKey.value = key
    // Arco virtual-list ignores later :width updates — remount when columns or
    // estimated widths change (e.g. re-query with same columns, different content).
    if (keyChanged || widthsChanged) {
      virtualRemountEpoch.value += 1
    }
  }

  watch(
    [columnsKey, tableWidth, () => props.data, mergeColumn],
    () => {
      recalculateVirtualColumnWidths()
    },
    { immediate: true }
  )

  // Ordinary: remount only on columnMode (measure/lock handles width via layoutResetKey).
  // Virtual-list: remount when epoch bumps (first width-ready or columnsKey change).
  const tableRenderKey = computed(() =>
    hasVirtualListProps.value ? `${props.columnMode}|e${virtualRemountEpoch.value}` : props.columnMode
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
    const inner =
      (el.querySelector(
        '.arco-table-th-item-title, .arco-table-th-item, .cell-content, .timestamp-cell, .merged-cell-content, .series-cell, .values-cell, .arco-table-cell, .arco-table-td-content'
      ) as HTMLElement | null) || el
    const contentW = Math.max(inner.scrollWidth, inner.offsetWidth) + getCellPaddingX(el)
    // Buffer: Arco col sets width=min=max; 1px short triggers header ellipsis.
    return Math.ceil(contentW) + 4
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

    // Header may be hidden (e.g. metrics); fall back to body-only measure.
    const bodyRows = Array.from(table.querySelectorAll('tbody tr:not(.arco-table-tr-empty)')).slice(
      0,
      MEASURE_SAMPLE_ROWS
    ) as HTMLElement[]

    if (headerCells.length < columns.length && bodyRows.length === 0) {
      return null
    }

    const measured: Record<string, number> = {}
    columns.forEach((column, index) => {
      let width = 40
      if (headerCells[index]) {
        width = Math.max(width, measureCellNaturalWidth(headerCells[index]))
      }
      bodyRows.forEach((row) => {
        const cells = Array.from(row.children).filter(isDataCell) as HTMLElement[]
        if (cells[index]) {
          width = Math.max(width, measureCellNaturalWidth(cells[index]))
        }
      })
      measured[column.name] = Math.max(40, width)
    })
    return measured
  }

  /**
   * Ordinary fit: soft-cap → restore toward natural for capped cols → last takes rest.
   * See “Column width rules” above.
   */
  function fitColumnWidths(
    naturals: Record<string, number>,
    columns: ColumnType[],
    containerW: number
  ): Record<string, number> {
    if (columns.length === 0) {
      return naturals
    }

    const widths: Record<string, number> = {}
    columns.forEach((column) => {
      const natural = naturals[column.name] || 40
      widths[column.name] = Math.min(COLUMN_MAX_WIDTH, natural)
    })

    if (!(containerW > 0)) {
      return widths
    }

    const sum = () => columns.reduce((total, column) => total + (widths[column.name] || 0), 0)
    let leftover = Math.floor(containerW - sum())

    // Give leftover back to columns that were soft-capped (still below natural).
    if (leftover > 0) {
      const needy = columns
        .map((column) => {
          const natural = naturals[column.name] || 40
          const deficit = natural - (widths[column.name] || 0)
          return deficit > 0 ? { name: column.name, deficit } : null
        })
        .filter(Boolean) as { name: string; deficit: number }[]

      const totalDeficit = needy.reduce((total, item) => total + item.deficit, 0)
      if (totalDeficit > 0) {
        let allocated = 0
        needy.forEach((item, index) => {
          const share =
            index === needy.length - 1 ? leftover - allocated : Math.floor((item.deficit / totalDeficit) * leftover)
          const add = Math.min(item.deficit, Math.max(0, share))
          widths[item.name] += add
          allocated += add
        })
        leftover = Math.floor(containerW - sum())
      }
    }

    // Any remainder → last column (table stays ≥ 100%).
    if (leftover > 0) {
      const lastName = columns[columns.length - 1].name
      widths[lastName] = (widths[lastName] || 0) + leftover
    }

    return widths
  }

  function lockMeasuredColumnWidths() {
    if (!useStickySingleTable.value) {
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
    measuredNaturalWidths.value = measured
    columnWidths.value = measured
    widthsLocked.value = true
  }

  function clearLockWidthsSchedule() {
    if (lockWidthsTimer != null) {
      clearTimeout(lockWidthsTimer)
      lockWidthsTimer = null
    }
  }

  function scheduleLockWidthsAfterRender() {
    if (!useStickySingleTable.value) {
      columnWidths.value = {}
      measuredNaturalWidths.value = {}
      widthsLocked.value = false
      return
    }
    clearLockWidthsSchedule()
    columnWidths.value = {}
    measuredNaturalWidths.value = {}
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
        measuredNaturalWidths.value = {}
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
      if (hasData && !hadData && layoutResetKey.value) {
        scheduleLockWidthsAfterRender()
      }
    }
  )

  // Fitted widths for locked ordinary tables (see “Column width rules”).
  const displayColumnWidths = computed(() => {
    if (!widthsLocked.value) {
      return columnWidths.value
    }
    return fitColumnWidths(columnWidths.value, columnsForWidthLock(), tableWidth.value)
  })

  function isVirtualColumnExpandable(columnName: string): boolean {
    if (mergeColumn.value) {
      // Merged Data column: expandable when estimated content needs more than leftover after ts.
      if (columnName !== 'Merged_Column') {
        return false
      }
      const tsW = props.tsColumn ? TIME_COLUMN_FIXED_WIDTH : 0
      const available = Math.max(0, tableWidth.value - tsW)
      let maxLen = 4
      const fields =
        props.displayedColumns.length > 0
          ? props.displayedColumns.filter((name) => name !== props.tsColumn?.name)
          : props.columns.map((c) => c.name).filter((name) => name !== props.tsColumn?.name)
      const sample = props.data.slice(0, MAX_CONTENT_SAMPLE_ROWS)
      sample.forEach((row) => {
        const str = fields
          .map((key) => (showKeys.value ? `${key}: ${getCellString(row[key])}` : getCellString(row[key])))
          .join(' ')
        if (str.length > maxLen) maxLen = str.length
      })
      const natural = estimateVirtualNaturalWidthPxUncapped(maxLen)
      return natural > available + EXPAND_WIDTH_EPSILON
    }

    const ready = virtualWidthsReadyForKey.value === columnsKey.value
    if (!ready) {
      return false
    }

    const columns = visibleColumns.value
    const naturalLengths = getColumnNaturalCharLengths(columns, props.data)
    const natural = estimateVirtualNaturalWidthPxUncapped(naturalLengths[columnName] || 0)
    const assigned = virtualColumnWidths.value[columnName]
    const override = virtualWidthOverrides.value[columnName]

    if (typeof override === 'number') {
      return natural > override + EXPAND_WIDTH_EPSILON
    }
    if (typeof assigned === 'number') {
      return natural > assigned + EXPAND_WIDTH_EPSILON
    }
    // Flexible column (no :width): compare natural to leftover container space.
    const othersSum = columns.reduce((sum, column) => {
      if (column.name === columnName) return sum
      const w = virtualWidthOverrides.value[column.name] ?? virtualColumnWidths.value[column.name]
      return sum + (typeof w === 'number' ? w : 0)
    }, 0)
    const available = Math.max(0, tableWidth.value - othersSum)
    return natural > available + EXPAND_WIDTH_EPSILON
  }

  /**
   * Column expandable when natural content width exceeds fitted/assigned width.
   * Whole column gets expand popup (no per-cell char heuristic).
   */
  function isColumnExpandable(columnName: string): boolean {
    if (props.wrapLine) {
      return false
    }

    // Time columns: format toggle / detail — never expand-popover
    const colMeta =
      columnsForWidthLock().find((c) => c.name === columnName) ||
      visibleColumns.value.find((c) => c.name === columnName) ||
      props.columns.find((c) => c.name === columnName)
    if (colMeta && isTimeColumn(colMeta)) {
      return false
    }
    if (props.tsColumn?.name === columnName) {
      return false
    }

    if (hasVirtualListProps.value) {
      return isVirtualColumnExpandable(columnName)
    }

    if (!widthsLocked.value) {
      return false
    }
    const natural = measuredNaturalWidths.value[columnName]
    const fitted = displayColumnWidths.value[columnName]
    if (!(natural > 0) || !(fitted > 0)) {
      return false
    }
    return natural > fitted + EXPAND_WIDTH_EPSILON
  }

  const lockedTableWidthPx = computed(() => {
    if (!useStickySingleTable.value || !widthsLocked.value) {
      return undefined
    }
    const total = Object.values(displayColumnWidths.value).reduce((sum, width) => sum + width, 0)
    if (!(total > 0)) {
      return undefined
    }
    return Math.max(total, Math.floor(tableWidth.value) || total)
  })

  function onColumnResize(dataIndex: string, width: number) {
    if (!columnResizableEnabled.value || !dataIndex || !(width > 0)) {
      return
    }

    // Virtual-list: Arco only updates the header during drag. Record the latest
    // width and remount on pointerup so body columns catch up.
    if (hasVirtualListProps.value) {
      if (mergeColumn.value) {
        return
      }
      virtualResizePending = { dataIndex, width: Math.round(width) }
      if (!virtualResizeListening) {
        virtualResizeListening = true
        window.addEventListener('pointerup', commitVirtualColumnResize, { once: true })
      }
      return
    }

    if (!useStickySingleTable.value) {
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

      // Ordinary: no :width while measuring; after lock use fitted px (see rules).
      return withEdgeCellClass(
        visibleColumns.value.map((column) => {
          const { width: _omit, ...rest } = column as TableColumn
          const locked = displayColumnWidths.value[column.name]
          return locked !== undefined ? { ...rest, width: locked } : rest
        })
      )
    }

    // Merged: virtual → fixed ts + flexible Data; ordinary → measure+lock.
    const arr: TableColumn[] = []
    if (props.tsColumn) {
      const locked = displayColumnWidths.value[props.tsColumn.name]
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
    const mergedLocked = displayColumnWidths.value.Merged_Column
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
    if (virtualResizeListening) {
      window.removeEventListener('pointerup', commitVirtualColumnResize)
      virtualResizeListening = false
      virtualResizePending = null
    }
  })

  function handleContextMenu(record: TableData, columnName: string, event: Event) {
    if (!props.showContextMenu) {
      return
    }

    const rect = (event.target as Element).getBoundingClientRect()
    triggerCell.value = [record, columnName]
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
    position: relative;
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
      // Do NOT use scrollbar-gutter:stable — it leaves a scrollbar-wide gap on the
      // right when there is no V-scrollbar, so sticky th background does not meet
      // the container edge. When the V-scrollbar appears, ResizeObserver shrinks
      // tableWidth and widths-locked re-runs fitColumnWidths (no phantom
      // H-scrollbar from a stale locked width sum).

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

  // Cell action icons (context menu) — shared base
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

  // Absolute-positioned action group (context menu)
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
  .cell-wrapper:hover > .cell-actions {
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

    // a-popover wraps the trigger; keep truncated content full-width.
    > .arco-trigger,
    > span {
      display: block;
      width: 100%;
      max-width: 100%;
      min-width: 0;
    }
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

  // Truncated cells: click content to expand. Native title provides hover hint.
  .cell-content--expandable {
    cursor: pointer;
  }

  // Time cells: ellipsis when column is narrower than the formatted timestamp.
  // Keep clipping on hover too — global td:hover overflow:visible would otherwise
  // let formatted timestamps spill into the next column.
  .timestamp-cell-content {
    display: block;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    // a-tooltip wraps the value; constrain so ellipsis applies on the span.
    :deep(.arco-trigger),
    > span {
      display: block;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
    }
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

  // Virtual-list packs columns tightly; keep action icons inside the cell.
  .virtual-list-active {
    // Keep action icons inside the cell (right:-15px bleeds into the next column).
    // Vertically center so empty cells don't look sunk relative to the row.
    .cell-wrapper {
      display: flex;
      align-items: center;

      > .arco-trigger,
      > span {
        flex: 1;
        min-width: 0;
      }
    }

    .cell-content {
      flex: 1;
      min-width: 0;
    }

    .cell-actions {
      right: 0;
      top: 50%;
      transform: translateY(-50%);
    }
  }

  // Show cell action buttons on hover. Only lift overflow when actions exist —
  // otherwise long cells (e.g. metrics series) spill into the next column.
  // The popover itself is body-mounted and closed on scroll.
  :deep(.arco-table-td:hover:has(.cell-actions)),
  :deep(.arco-table-td:hover:has(.cell-content--expandable)) {
    overflow: visible;
  }

  :deep(.arco-table-td:hover:has(.cell-actions) .arco-table-td-content),
  :deep(.arco-table-td:hover:has(.cell-content--expandable) .arco-table-td-content) {
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

    &.cell-content--expandable {
      cursor: pointer;
    }
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
    max-height: min(40vh, 320px);
    overflow: auto;
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

  // Measure pass only: content-sized table so scrollWidth == natural width.
  // Final layout is .widths-locked (explicit px from fitColumnWidths).
  .data-table-container.natural-column-widths {
    :deep(.arco-table-element) {
      table-layout: auto !important;
      width: max-content !important;
      min-width: 0 !important;
    }

    :deep(.arco-table-th),
    :deep(.arco-table-tr:not(.arco-table-tr-empty) .arco-table-td),
    :deep(.arco-table-th-item),
    :deep(.arco-table-th-item-title),
    :deep(.arco-table-td-content),
    :deep(.cell-content),
    :deep(.merged-cell-content),
    :deep(.series-cell),
    :deep(.values-cell) {
      overflow: visible !important;
      text-overflow: clip !important;
      max-width: none !important;
    }
  }

  // Locked ordinary table: explicit column widths; width ≥ 100% (see rules).
  .data-table-container.widths-locked {
    :deep(.arco-table-element) {
      table-layout: fixed !important;
      width: var(--data-table-locked-width, 100%) !important;
      min-width: 100% !important;
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

  // Time / semantic headers: tooltip + pill must shrink so label can ellipsis.
  :deep(.arco-table-th-item-title) {
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
  }

  :deep(.arco-table-th-item-title > .arco-trigger) {
    display: block;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
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
  }
  :deep(.arco-table-size-mini).multiple_column,
  :deep(.arco-table-size-mini).single_column {
    :deep(.arco-table-td-content) {
      padding-right: 12px;
    }

    :deep(.arco-table-td-content:has(.cell-actions)) {
      padding-right: 18px;
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
