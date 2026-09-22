<template lang="pug">
.logs-vxe-table(ref="rootEl" :class="{ 'logs-vxe-table--wrap': wrapLine }")
  component(
    :key="wrapLine ? 'wrap' : 'nowrap'"
    ref="gridRef"
    border="inner"
    fit
    size="mini"
    :is="VxeGrid"
    :show-overflow="tableShowOverflow"
    :height="gridHeight"
    :data="tableData"
    :columns="vxeColumns"
    :loading="loading"
    :row-config="rowConfig"
    :column-config="columnConfig"
    :tooltip-config="tooltipConfig"
    :virtual-y-config="virtualYConfig"
    :virtual-x-config="virtualXConfig"
    :show-header="showHeader"
    :row-class-name="rowClassName"
    @scroll="onScroll"
    @cell-click="onCellClick"
  )
    template(#empty)
      span.logs-vxe-empty {{ t('logsQuery.nodata') }}
  // Load-more affordance (Grafana-like footer): appears once the user reaches the
  // end of the loaded rows. Clicking it or scrolling on both load the next page.
  .logs-vxe-load-more(
    v-if="showLoadMoreBar"
    role="button"
    :class="{ 'is-loading': loadingMore }"
    :style="{ bottom: `${scrollXOffset}px` }"
    :aria-busy="loadingMore ? 'true' : 'false'"
    @click="onLoadMoreClick"
  )
    a-spin(v-if="loadingMore" :size="14")
    svg.logs-vxe-load-more__icon(v-else)
      use(href="#down")
    span.logs-vxe-load-more__text
      | {{ loadingMore ? t('drilldown.logs.loadingMore') : t('logsQuery.loadMoreHint') }}
  a-dropdown#logs-vxe-td-context(
    v-model:popup-visible="contextMenuVisible"
    trigger="contextMenu"
    :style="contextMenuStyle"
    @clickoutside="hideContextMenu"
    @popup-visible-change="onContextMenuVisibleChange"
    @select="handleMenuClick"
  )
    template(#content)
      a-doption(value="copy") Copy Field Value
      a-dsubmenu(v-if="filterOptions.length > 0" trigger="hover") Filter
        template(#content)
          a-doption(v-for="op in filterOptions" :key="op" :value="`filter_${op}`") {{ op }} value
</template>

<script setup lang="ts">
  import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useElementSize } from '@vueuse/core'
  import { Tooltip } from '@arco-design/web-vue'
  import { VxeGrid, VxeUI } from 'vxe-table'
  import 'vxe-table/lib/style.css'
  import type { ColumnType, TSColumn } from '@/types/query'
  import { dateTypes } from '@/views/dashboard/config'
  import { useDateTimeFormat } from '@/hooks'

  // show-overflow=true defaults to tooltip mode and requires vxe-tooltip (vxe-pc-ui).
  // Prefer native title tooltips so we do not pull in the full UI kit.
  VxeUI.setConfig({
    table: {
      showOverflow: 'title',
      tooltipConfig: {
        mode: 'title',
      },
    },
  })

  // ---------------------------------------------------------------------------
  // Column widths (parity with the legacy DataTable virtual mode)
  //
  // VXE cannot measure natural widths for our cell slots: the flex wrapper plus
  // `col--ellipsis` always reports the current (fitted) width, so every column
  // collapsed to the same width. Estimate px from sampled text instead and let
  // the widest column absorb the leftover space.
  // ---------------------------------------------------------------------------
  /** Soft cap for separate (multi-column) mode — align with legacy DataTable. */
  const COLUMN_MAX_WIDTH = 600
  const COLUMN_MIN_WIDTH = 60
  /** Timestamp column is fixed px so the time format never squashes. */
  const TIME_COLUMN_FIXED_WIDTH = 200
  /** Rows sampled for the content-width heuristic (first page is enough). */
  const CONTENT_SAMPLE_ROWS = 100
  /** Rough table font advance + th/td horizontal padding (char heuristic, not DOM). */
  const ESTIMATED_CHAR_WIDTH_PX = 8
  const ESTIMATED_CELL_PADDING_PX = 32

  interface TableData {
    [key: string]: any
  }

  type MergedPart = {
    key: string
    text: string
    isLink: boolean
  }

  type VxeGridInstance = {
    recalculate?: (refull?: boolean) => Promise<void> | void
    recalcRowHeight?: (rowOrId: unknown) => Promise<void> | void
  }

  const props = withDefaults(
    defineProps<{
      data: TableData[]
      columns: ColumnType[]
      displayedColumns?: string[]
      tsColumn?: TSColumn | null
      /** Row-detail mode: the timestamp cell is a link (parity with tsCellDetail). */
      tsCellDetail?: boolean
      columnMode?: 'separate' | 'merged' | 'merged-with-keys'
      loading?: boolean
      size?: 'small' | 'mini' | 'medium' | 'large'
      showHeader?: boolean
      activeRowKey?: number | null
      linkColumn?: string
      height?: number
      /** When true: wrap cells and use dynamic row height (VXE showOverflow false). */
      wrapLine?: boolean
      /** Builder mode: show per-cell filter/copy menu (separate only). */
      showContextMenu?: boolean
      /**
       * More rows can be fetched: enables the load-more footer + auto load.
       * Parents must freeze the Search/Run time window and keyset inside it on
       * `reachEnd` — never rewrite toolbar time from scroll (see log-keyset-window).
       */
      hasMore?: boolean
      /** A load-more request is in flight. */
      loadingMore?: boolean
    }>(),
    {
      data: () => [],
      columns: () => [],
      displayedColumns: () => [],
      tsColumn: null,
      tsCellDetail: false,
      columnMode: 'separate',
      loading: false,
      size: 'medium',
      showHeader: true,
      activeRowKey: null,
      linkColumn: '',
      height: 0,
      wrapLine: false,
      showContextMenu: false,
      hasMore: false,
      loadingMore: false,
    }
  )

  const emit = defineEmits<{
    (e: 'reachEnd'): void
    (e: 'tsCellClick', row: TableData, rowIndex: number): void
    (e: 'columnLinkClick', columnName: string, value: string): void
    (e: 'filterConditionAdd', payload: { columnName: string; operator: string; value: unknown }): void
  }>()

  const { formatDateTimeWithMs } = useDateTimeFormat()
  const { t } = useI18n()

  const rootEl = ref<HTMLElement | null>(null)
  const gridRef = ref<VxeGridInstance | null>(null)
  const { height: measuredHeight, width: measuredWidth } = useElementSize(rootEl)

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

  /** true = formatted timestamp, false = raw value (legacy `tsViewStr`). */
  const tsViewStr = ref(true)

  const tableHeight = computed(() => {
    if (props.height > 0) {
      return props.height
    }
    return Math.max(0, measuredHeight.value)
  })

  /** Prefer measured px; fall back to 100% so first paint is not blank. */
  const gridHeight = computed(() => (tableHeight.value > 0 ? tableHeight.value : '100%'))

  /** false = allow wrap + dynamic row height; 'title' = single-line truncate. */
  const tableShowOverflow = computed(() => (props.wrapLine ? false : 'title'))

  const rowHeight = computed(() => {
    switch (props.size) {
      case 'mini':
        return 28
      case 'small':
        return 32
      case 'large':
        return 44
      default:
        return 36
    }
  })

  const rowConfig = computed(() => {
    const base = {
      isHover: true,
      keyField: '__rowIndex',
    }
    if (props.wrapLine) {
      return base
    }
    return { ...base, height: rowHeight.value }
  })

  const columnConfig = computed(() => ({
    resizable: props.columnMode === 'separate',
    autoOptions: {
      isCalcHeader: true,
      isCalcBody: true,
      isCalcFooter: false,
    },
  }))

  const showFilterMenu = computed(() => props.showContextMenu && props.columnMode === 'separate')

  function resolveGridApi(): VxeGridInstance | null {
    const raw = gridRef.value as (VxeGridInstance & { getGrid?: () => VxeGridInstance }) | null
    if (!raw) {
      return null
    }
    if (typeof raw.recalculate === 'function') {
      return raw
    }
    if (typeof raw.getGrid === 'function') {
      return raw.getGrid() || null
    }
    return raw
  }

  function isTimeColumn(column: ColumnType | null | undefined) {
    if (!column?.data_type) {
      return false
    }
    return dateTypes.indexOf(column.data_type) > -1
  }

  function getCellString(value: unknown): string {
    if (value == null) {
      return ''
    }
    if (typeof value === 'string') {
      return value
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value)
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch {
        return Object.prototype.toString.call(value)
      }
    }
    return String(value)
  }

  /**
   * Time cell text. `formatted` follows the header toggle: raw value when off,
   * timezone-aware string when on (legacy `renderTs` + `changeTsView`).
   */
  function formatTsDisplay(
    value: unknown,
    column: ColumnType | TSColumn | null | undefined,
    formatted = tsViewStr.value
  ): string {
    if (value == null || value === '') {
      return ''
    }
    const raw = getCellString(value)
    if (!formatted || !column || !('data_type' in column) || !column.data_type) {
      return raw
    }
    return formatDateTimeWithMs(value as number, column.data_type) || raw
  }

  function changeTsView() {
    tsViewStr.value = !tsViewStr.value
  }

  /** Header pill for time columns — icon + name, click toggles raw/formatted. */
  function renderTsHeader(title: string) {
    return h(
      Tooltip,
      { placement: 'top' },
      {
        content: () => t(tsViewStr.value ? 'dashboard.showTimestamp' : 'dashboard.formatTimestamp'),
        default: () =>
          h('span', { class: ['gpt-semantic-th', 'timestamp', 'logs-vxe-ts-th'], onClick: changeTsView }, [
            h('svg', { class: 'icon-12' }, [h('use', { href: '#time-index' })]),
            h('span', { class: 'gpt-semantic-th-text' }, title),
          ]),
      }
    )
  }

  function getOriginalRow(row: TableData): TableData {
    const rowIndex = typeof row.__rowIndex === 'number' ? row.__rowIndex : -1
    if (rowIndex >= 0 && props.data[rowIndex]) {
      return props.data[rowIndex]
    }
    return row
  }

  function hideContextMenu() {
    contextMenuVisible.value = false
  }

  function onContextMenuVisibleChange(popupVisible: boolean) {
    if (!popupVisible) {
      hideContextMenu()
    }
  }

  /** Time columns have no filter/copy menu (legacy Arco parity). */
  function isTimeField(field: string): boolean {
    return props.tsColumn?.name === field || isTimeColumn(props.columns.find((c) => c.name === field))
  }

  function openContextMenu(row: TableData, columnName: string, event: MouseEvent) {
    if (!showFilterMenu.value || isTimeField(columnName)) {
      return
    }
    const original = getOriginalRow(row)
    triggerCell.value = [original, columnName]
    event.preventDefault()
    event.stopPropagation()

    const column = props.columns.find((col) => col.name === columnName)
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
      emit('filterConditionAdd', { columnName, operator, value: record[columnName] })
    }
    hideContextMenu()
  }

  function onLinkClick(columnName: string, value: string, event: Event) {
    event.stopPropagation()
    const text = value.trim()
    if (!text) {
      return
    }
    emit('columnLinkClick', columnName, text)
  }

  function renderActionIcon(row: TableData, field: string) {
    if (!showFilterMenu.value || isTimeField(field)) {
      return null
    }
    return h(
      'span',
      {
        class: 'logs-vxe-cell-action',
        title: 'Filter / Copy',
        onClick: (event: MouseEvent) => openContextMenu(row, field, event),
      },
      '⋮'
    )
  }

  function renderSeparateCell(params: { row: TableData; column: { field?: string } }) {
    const { row, column } = params
    const field = column?.field || ''
    const text = getCellString(row[field])
    const isLink = Boolean(props.linkColumn && field === props.linkColumn)
    const isTs = Boolean(props.tsColumn?.name && field === props.tsColumn.name)

    const textNode = isLink
      ? h(
          'button',
          {
            type: 'button',
            class: 'logs-vxe-link',
            onClick: (event: MouseEvent) => onLinkClick(field, text, event),
          },
          text
        )
      : h('span', { class: ['logs-vxe-cell-text', isTs ? 'logs-vxe-ts-cell' : ''] }, text)

    return h('div', { class: 'logs-vxe-cell-inner' }, [textNode, renderActionIcon(row, field)])
  }

  function renderMergedCell(params: { row: TableData }) {
    const parts = (params.row.__merged_parts as MergedPart[] | undefined) || []
    const showKeys = props.columnMode === 'merged-with-keys'
    const nodes = parts.flatMap((part, index) => {
      const pieces: ReturnType<typeof h>[] = []
      if (index > 0) {
        pieces.push(h('span', ' '))
      }
      if (showKeys) {
        pieces.push(h('span', { class: 'logs-vxe-merged-key' }, `${part.key}: `))
      }
      if (part.isLink) {
        pieces.push(
          h(
            'button',
            {
              type: 'button',
              class: 'logs-vxe-link',
              onClick: (event: MouseEvent) => onLinkClick(part.key, part.text, event),
            },
            part.text
          )
        )
      } else {
        pieces.push(h('span', part.text))
      }
      return pieces
    })
    return h('div', { class: 'logs-vxe-cell-inner logs-vxe-merged-cell' }, nodes)
  }

  function recalculateColumnWidths() {
    nextTick(async () => {
      const api = resolveGridApi()
      if (!api) {
        return
      }
      await Promise.resolve(api.recalculate?.(true))
      if (props.wrapLine && typeof api.recalcRowHeight === 'function' && props.data.length > 0) {
        const sample = props.data.slice(0, Math.min(props.data.length, 100))
        await Promise.resolve(api.recalcRowHeight(sample))
      }
    })
  }

  const tooltipConfig = {
    mode: 'title' as const,
  }

  const virtualYConfig = computed(() => ({
    enabled: true,
    gt: 0,
  }))

  const virtualXConfig = computed(() => ({
    enabled: props.columnMode === 'separate' && !props.wrapLine,
    gt: 0,
  }))

  const visibleFieldNames = computed(() => {
    const tsName = props.tsColumn?.name
    let names = props.displayedColumns.length > 0 ? props.displayedColumns.slice() : props.columns.map((c) => c.name)
    if (tsName) {
      names = names.filter((n) => n !== tsName)
    }
    return names
  })

  /**
   * Pre-stringify / format cell values so Vxe never renders raw objects.
   * Interactive bits (links, filter icon, merged parts) render via column slots.
   */
  const tableData = computed(() => {
    const merge = props.columnMode !== 'separate'
    const fields = visibleFieldNames.value
    const tsName = props.tsColumn?.name
    const showKeys = props.columnMode === 'merged-with-keys'

    return props.data.map((record, index) => {
      const rowIndex = typeof record.__rowIndex === 'number' ? record.__rowIndex : index
      const out: TableData = { __rowIndex: rowIndex }

      if (tsName) {
        const tsMeta = props.tsColumn || props.columns.find((c) => c.name === tsName)
        out[tsName] = formatTsDisplay(record[tsName], tsMeta)
      }

      if (merge) {
        const parts: MergedPart[] = fields
          .map((key) => ({
            key,
            text: getCellString(record[key]),
            isLink: Boolean(props.linkColumn && key === props.linkColumn),
          }))
          .filter((part) => part.text)
        out.__merged_parts = parts
        out.__merged_message = parts.map((part) => (showKeys ? `${part.key}: ${part.text}` : part.text)).join(' ')
        return out
      }

      fields.forEach((name) => {
        const meta = props.columns.find((c) => c.name === name)
        out[name] = isTimeColumn(meta) ? formatTsDisplay(record[name], meta) : getCellString(record[name])
      })
      return out
    })
  })

  function contentColumn(field: string, title: string, extra: Record<string, unknown> = {}) {
    return {
      field,
      title,
      showOverflow: props.wrapLine ? false : 'title',
      ...extra,
    }
  }

  type ColumnWidthRule = { width?: number; minWidth?: number }

  type SeparateField = {
    field: string
    title: string
    /** Primary timestamp column: clickable, fixed width. */
    isTs: boolean
    /** Date-typed column: cell text is formatted before measuring. */
    isTime: boolean
    isLink: boolean
  }

  /** Separate-mode field list, in render order (timestamp first). */
  function getSeparateFields(): SeparateField[] {
    const tsName = props.tsColumn?.name
    const fields: SeparateField[] = []
    if (tsName) {
      fields.push({ field: tsName, title: tsName, isTs: true, isTime: true, isLink: false })
    }
    visibleFieldNames.value.forEach((name) => {
      const meta = props.columns.find((c) => c.name === name)
      fields.push({
        field: name,
        title: meta?.title || name,
        isTs: false,
        isTime: isTimeColumn(meta),
        isLink: Boolean(props.linkColumn && name === props.linkColumn),
      })
    })
    return fields
  }

  function resolveFieldMeta(field: string): ColumnType | TSColumn | undefined {
    return props.columns.find((c) => c.name === field) || (props.tsColumn?.name === field ? props.tsColumn : undefined)
  }

  /** Natural-width char length: max(header, sampled cell text) — legacy heuristic. */
  function getColumnNaturalCharLength(field: string, title: string, isTime = false): number {
    const meta = resolveFieldMeta(field)
    let max = String(title ?? '').length
    const count = Math.min(props.data.length, CONTENT_SAMPLE_ROWS)
    for (let i = 0; i < count; i += 1) {
      const record = props.data[i]
      const value = record?.[field]
      // Widths always follow the formatted value so toggling does not resize columns.
      const text = isTime || isTimeColumn(meta) ? formatTsDisplay(value, meta, true) : getCellString(value)
      if (text.length > max) {
        max = text.length
      }
    }
    return max
  }

  function estimateColumnWidthPx(charLen: number): number {
    const natural = Math.ceil(charLen * ESTIMATED_CHAR_WIDTH_PX + ESTIMATED_CELL_PADDING_PX)
    return Math.max(COLUMN_MIN_WIDTH, Math.min(COLUMN_MAX_WIDTH, natural))
  }

  /**
   * Explicit widths per column: timestamp fixed, content columns sized by their
   * natural length, widest content column left flexible (minWidth only) so it
   * absorbs the leftover width exactly like the legacy virtual table.
   */
  function computeColumnWidthRules(fields: SeparateField[]): Record<string, ColumnWidthRule> {
    const naturalLengths: Record<string, number> = {}
    fields.forEach((item) => {
      naturalLengths[item.field] = getColumnNaturalCharLength(item.field, item.title, item.isTime)
    })

    let widestField = ''
    let widestLength = -1
    fields.forEach((item) => {
      if (item.isTs) {
        return
      }
      if (naturalLengths[item.field] > widestLength) {
        widestLength = naturalLengths[item.field]
        widestField = item.field
      }
    })

    const rules: Record<string, ColumnWidthRule> = {}
    fields.forEach((item) => {
      if (item.isTs) {
        rules[item.field] = { width: TIME_COLUMN_FIXED_WIDTH }
        return
      }
      const estimated = estimateColumnWidthPx(naturalLengths[item.field] || 0)
      rules[item.field] = item.field === widestField ? { minWidth: estimated } : { width: estimated }
    })
    return rules
  }

  const columnWidthRules = ref<Record<string, ColumnWidthRule>>({})

  function areWidthRulesEqual(a: Record<string, ColumnWidthRule>, b: Record<string, ColumnWidthRule>): boolean {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) {
      return false
    }
    return keysA.every((key) => a[key]?.width === b[key]?.width && a[key]?.minWidth === b[key]?.minWidth)
  }

  /**
   * Keep the same object when nothing changed: a new `columns` prop array makes
   * VXE rebuild columns and drop the user's manual resize.
   */
  function refreshColumnWidthRules() {
    const next = props.columnMode === 'separate' ? computeColumnWidthRules(getSeparateFields()) : {}
    if (!areWidthRulesEqual(columnWidthRules.value, next)) {
      columnWidthRules.value = next
    }
  }

  /**
   * Time-column classes — parity with legacy `.timestamp-cell` (accent color),
   * `.ts-cell-detail-link` (row detail) and the format-toggle affordance.
   */
  function getTimeColumnClassNames(isPrimaryTs: boolean, isTime: boolean): string {
    if (!isPrimaryTs && !isTime) {
      return ''
    }
    const classes = ['logs-vxe-ts-col']
    if (isPrimaryTs) {
      classes.push(props.tsCellDetail ? 'logs-vxe-ts-col--link' : 'logs-vxe-ts-col--toggle')
    } else if (!props.tsCellDetail) {
      classes.push('logs-vxe-ts-col--toggle')
    }
    return classes.join(' ')
  }

  const vxeColumns = computed(() => {
    const cols: Record<string, unknown>[] = []
    const tsName = props.tsColumn?.name
    const merge = props.columnMode !== 'separate'
    /** Legacy DataTable pads the first/last column wider (cell-edge-left/right). */
    const edgeClass = (index: number, total: number) =>
      [index === 0 ? 'logs-vxe-edge-left' : '', index === total - 1 ? 'logs-vxe-edge-right' : '']
        .filter(Boolean)
        .join(' ')

    if (merge) {
      if (tsName) {
        cols.push(
          contentColumn(tsName, tsName, {
            className: [getTimeColumnClassNames(true, true), 'logs-vxe-edge-left'].filter(Boolean).join(' '),
            headerClassName: 'logs-vxe-edge-left',
            width: TIME_COLUMN_FIXED_WIDTH,
            slots: { default: renderSeparateCell, header: () => renderTsHeader(tsName) },
          })
        )
      }
      cols.push(
        contentColumn('__merged_message', 'message', {
          minWidth: 'auto',
          className: 'logs-vxe-edge-right',
          headerClassName: 'logs-vxe-edge-right',
          slots: { default: renderMergedCell },
        })
      )
      return cols
    }

    const fields = getSeparateFields()
    fields.forEach((item, index) => {
      const classNames = [getTimeColumnClassNames(item.isTs, item.isTime), item.isLink ? 'logs-vxe-link-col' : '']
        .filter(Boolean)
        .join(' ')
      const edge = edgeClass(index, fields.length)
      const rule = columnWidthRules.value[item.field] || {}
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
  })

  function rowClassName({ row }: { row: TableData }) {
    const key = typeof row.__rowIndex === 'number' ? row.__rowIndex : null
    if (key != null && props.activeRowKey === key) {
      return 'logs-vxe-row-active'
    }
    return ''
  }

  let reachEndArmed = true
  /** True while the viewport sits at the end of the loaded rows. */
  const nearEnd = ref(false)
  /** VXE horizontal scrollbar height — keeps the footer from covering it. */
  const scrollXOffset = ref(0)
  /** Last wheel offset reported by VXE (virtual scrolling keeps it internally). */
  let lastScrollTop = 0
  /**
   * Distance from the bottom where the footer hint shows up (the list is almost
   * exhausted — Grafana only reveals its footer row at the end of the list).
   */
  const NEAR_END_PX = 120
  /**
   * Distance from the bottom that auto-loads the next page. Kept at "the end is
   * actually reached" so a casual scroll never triggers a fetch — scrolling down
   * must bring the last row fully into view (or the footer must be clicked).
   */
  const AUTO_LOAD_PX = 8
  /** Scrolling this far back up re-arms the auto-load for the next bottom hit. */
  const REARM_PX = 120
  /**
   * Auto-load only counts as deliberate when a wheel/touch gesture drove the
   * scroll into the end zone. Dragging the scrollbar across the last stretch does
   * not trigger a fetch (Grafana keeps that last bit non-committing) — the footer
   * is there to click instead.
   */
  const SCROLL_INTENT_MS = 400
  let lastScrollIntentAt = 0

  function markScrollIntent() {
    lastScrollIntentAt = Date.now()
  }

  const showLoadMoreBar = computed(() => props.hasMore && (props.loadingMore || nearEnd.value))

  function syncScrollXOffset() {
    const el = rootEl.value?.querySelector('.vxe-table--scroll-x-virtual') as HTMLElement | null
    scrollXOffset.value = el ? el.offsetHeight : 0
  }

  /** Total content height in px (fixed row height, or averaged when wrapping). */
  function estimateContentHeight(): number {
    if (!props.wrapLine || !props.data.length) {
      return props.data.length * rowHeight.value
    }
    const rowEls = rootEl.value?.querySelectorAll('.vxe-body--row')
    if (!rowEls?.length) {
      return props.data.length * rowHeight.value
    }
    let total = 0
    rowEls.forEach((el) => {
      total += (el as HTMLElement).offsetHeight
    })
    return (total / rowEls.length) * props.data.length
  }

  function requestLoadMore() {
    // Parents own the "is there more" decision; only avoid stacking requests.
    if (props.loadingMore) {
      return
    }
    reachEndArmed = false
    emit('reachEnd')
  }

  function onScroll(params: { isY?: boolean; scrollTop?: number; scrollHeight?: number; bodyHeight?: number }) {
    const { isY, scrollTop, scrollHeight, bodyHeight } = params
    if (!isY || scrollTop == null || scrollHeight == null || bodyHeight == null) {
      return
    }
    const remaining = scrollHeight - scrollTop - bodyHeight
    lastScrollTop = scrollTop
    nearEnd.value = remaining <= NEAR_END_PX
    if (remaining <= AUTO_LOAD_PX) {
      syncScrollXOffset()
      const deliberate = Date.now() - lastScrollIntentAt <= SCROLL_INTENT_MS
      if (reachEndArmed && deliberate) {
        requestLoadMore()
      }
    } else if (remaining > REARM_PX) {
      reachEndArmed = true
    }
  }

  function onLoadMoreClick() {
    requestLoadMore()
  }

  /**
   * Recompute the end state from real geometry. A page that does not fill the
   * viewport has nothing to scroll, so the footer shows up right away and the user
   * clicks it to continue. Auto-loading stays tied to real scroll events, which
   * keeps repeated appends from feeding themselves.
   */
  function checkViewportFilled() {
    nextTick(() => {
      if (!props.hasMore) {
        nearEnd.value = false
        return
      }
      const bodyEl = rootEl.value?.querySelector('.vxe-table--body-wrapper') as HTMLElement | null
      if (!bodyEl) {
        return
      }
      syncScrollXOffset()
      // VXE virtual scrolling keeps the wheel offset internally, so the wrapper's
      // scrollHeight stays at the viewport height — estimate the content height.
      const remaining = estimateContentHeight() - lastScrollTop - bodyEl.clientHeight
      nearEnd.value = remaining <= NEAR_END_PX
    })
  }

  watch(
    () => props.data.length,
    () => {
      checkViewportFilled()
    }
  )

  watch(
    () => [props.hasMore, props.loadingMore] as const,
    () => {
      if (!props.hasMore) {
        nearEnd.value = false
      }
      checkViewportFilled()
    },
    { immediate: true }
  )

  onMounted(() => {
    checkViewportFilled()
    rootEl.value?.addEventListener('wheel', markScrollIntent, { passive: true })
    rootEl.value?.addEventListener('touchmove', markScrollIntent, { passive: true })
  })

  onBeforeUnmount(() => {
    rootEl.value?.removeEventListener('wheel', markScrollIntent)
    rootEl.value?.removeEventListener('touchmove', markScrollIntent)
  })

  // The scrollbar only exists once the grid is laid out — re-measure when the
  // footer appears so it never covers the horizontal scrollbar.
  watch(showLoadMoreBar, (visible) => {
    if (visible) {
      nextTick(syncScrollXOffset)
    }
  })

  watch(
    () =>
      [
        props.columnMode,
        props.displayedColumns.join(','),
        props.columns.map((c) => c.name).join(','),
        props.data.length,
        props.wrapLine,
        Math.round(measuredWidth.value),
      ] as const,
    () => {
      recalculateColumnWidths()
    },
    { immediate: true }
  )

  // Widths are refreshed on column changes and on a new result set (`data[0]`
  // identity changes) but not on "load more" appends, so widths stay stable.
  watch(
    () =>
      [
        props.columnMode,
        props.displayedColumns.join(','),
        props.columns.map((c) => `${c.name}:${c.title ?? ''}`).join(','),
        props.tsColumn?.name ?? '',
        props.data[0],
      ] as const,
    () => {
      refreshColumnWidthRules()
    },
    { immediate: true }
  )

  function onCellClick({ row, column }: { row: TableData; column: { field?: string } }) {
    const rowIndex = typeof row.__rowIndex === 'number' ? row.__rowIndex : -1
    const original = getOriginalRow(row)
    const field = column?.field
    if (field && props.tsColumn?.name && field === props.tsColumn.name) {
      if (props.tsCellDetail) {
        emit('tsCellClick', original, rowIndex)
        return
      }
      changeTsView()
      return
    }
    // Secondary time columns only toggle the format (legacy changeTsView parity).
    if (field && isTimeColumn(props.columns.find((c) => c.name === field))) {
      changeTsView()
    }
    // Other cells: no row detail (parity with Arco). Links handled in slot click.
  }
</script>

<style lang="less" scoped>
  .logs-vxe-table {
    height: 100%;
    width: 100%;
    min-height: 0;
    overflow: hidden;
    position: relative;

    :deep(.vxe-table),
    :deep(.vxe-grid) {
      // System-theme header (arco-theme.less @table-color-bg-header-cell /
      // @table-color-text-header-cell / @table-font-weight-header-text).
      // `--vxe-ui-table-header-font-color` MUST be set here directly: VXE declares
      // it at :root as `var(--vxe-ui-font-color)`, so it is resolved before it
      // reaches the grid and overriding `--vxe-ui-font-color` has no effect.
      --vxe-ui-table-header-background-color: var(--gpt-table-head-bg, #eeecf0);
      --vxe-ui-table-header-font-color: var(--gpt-text-secondary, #8b7ba8);
      --vxe-ui-table-header-font-weight: 600;
      --vxe-ui-table-row-hover-background-color: var(--color-fill-1, #f7f8fa);
      --vxe-ui-font-color: var(--color-text-1, #1d2129);
      // Row separator — legacy Arco used @table-color-border (= --gpt-border-subtle).
      --vxe-ui-table-border-color: var(--gpt-border-subtle, rgba(71, 52, 96, 0.05));
      // Column resize drag guide (line + width tip) — legacy Arco drew the
      // resizing border with @table-color-border_resizing (= @color-primary-6 →
      // --gpt-main-dark), not VXE's default blue.
      --vxe-ui-table-resizable-drag-line-color: var(--gpt-main-dark, #473460);
      font-size: 12px;
    }

    :deep(.logs-vxe-row-active) {
      background-color: var(--color-primary-light-1, #e8f3ff) !important;
    }

    :deep(.logs-vxe-cell-inner) {
      position: relative;
      display: flex;
      align-items: center;
      min-width: 0;
      width: 100%;
      gap: 4px;
    }

    :deep(.logs-vxe-cell-text) {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    // Timestamp column — parity with global `.timestamp-cell` (dataView.less).
    :deep(.logs-vxe-ts-col) {
      color: var(--gpt-accent-ts);
    }

    // Format toggle — legacy `span.timestamp-cell(style="cursor: pointer")`.
    :deep(.logs-vxe-ts-col--toggle) {
      cursor: pointer;
    }

    // Row-detail timestamp — parity with global `.ts-cell-detail-link`.
    :deep(.logs-vxe-ts-col--link) {
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }
    }

    :deep(.logs-vxe-ts-th) {
      cursor: pointer;
      // Icon + accent text only — no pill background.
      background-color: transparent;
    }

    // Cell horizontal padding — parity with legacy DataTable
    // (`--gpt-cell-px: 10px`, `--gpt-cell-edge-px: 16px` on first/last column).
    :deep(.vxe-body--column > .vxe-cell),
    :deep(.vxe-header--column > .vxe-cell) {
      padding-left: 10px;
      padding-right: 10px;
    }

    :deep(.logs-vxe-edge-left > .vxe-cell) {
      padding-left: 16px;
    }

    :deep(.logs-vxe-edge-right > .vxe-cell) {
      padding-right: 16px;
    }

    :deep(.logs-vxe-link),
    :deep(.logs-vxe-link-col .logs-vxe-link) {
      // Links share the timestamp accent (legacy logs table link color).
      color: var(--gpt-accent-ts);
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      font: inherit;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }

    :deep(.logs-vxe-merged-key) {
      color: var(--gpt-text-muted);
    }

    // Load-more footer (Grafana-style): a slim row pinned to the bottom of the
    // viewport, above VXE's horizontal scrollbar.
    .logs-vxe-load-more {
      position: absolute;
      right: 0;
      left: 0;
      // Above VXE's scrollbars (z-index 7) so the footer stays clickable.
      z-index: 8;
      display: flex;
      gap: var(--gpt-gap-xs, 4px);
      align-items: center;
      justify-content: center;
      height: 26px;
      font-size: var(--gpt-font-base, 12px);
      color: var(--gpt-link-color, #702fed);
      background: var(--gpt-bg-panel, #fff);
      border-top: 1px solid var(--gpt-border-subtle, rgba(71, 52, 96, 0.05));
      cursor: pointer;
      user-select: none;

      // Opaque hover: the tint is composited over the panel color so the rows
      // behind the footer never bleed through.
      &:hover {
        background: linear-gradient(var(--gpt-nav-active-bg), var(--gpt-nav-active-bg)), var(--gpt-bg-panel, #fff);
      }

      &.is-loading {
        color: var(--gpt-text-secondary, #8b7ba8);
        cursor: default;
      }

      &.is-loading:hover {
        background: var(--gpt-bg-panel, #fff);
      }
    }

    .logs-vxe-load-more__icon {
      width: 12px;
      height: 12px;
      color: currentColor;
      fill: currentColor;
    }

    :deep(.logs-vxe-cell-action) {
      display: none;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      cursor: pointer;
      color: var(--color-text-2, #4e5969);
    }

    // Only the hovered cell shows its action icon (legacy Arco parity) — not the
    // whole hovered row.
    :deep(.vxe-body--column:hover .logs-vxe-cell-action) {
      display: inline-flex;
    }

    :deep(.logs-vxe-cell-action:hover) {
      color: var(--color-primary-6, #165dff);
    }

    &--wrap {
      :deep(.vxe-body--column .vxe-cell),
      :deep(.logs-vxe-cell-text) {
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.4;
        text-overflow: clip;
        overflow: visible;
      }
    }
  }
</style>
