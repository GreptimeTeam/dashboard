<template lang="pug">
.data-grid(
  ref="rootEl"
  :class="{ 'data-grid--wrap': wrapLine, 'data-grid--paged': paginationEnabled, 'data-grid--auto-height': !fillHeight }"
  :style="cellTypographyStyle"
)
  .dg-grid-host(ref="gridHostEl")
    component(
      :key="wrapLine ? 'wrap' : 'nowrap'"
      ref="gridRef"
      border="default"
      fit
      size="mini"
      :is="VxeGrid"
      :show-overflow="tableShowOverflow"
      :show-header-overflow="tableHeaderOverflow"
      :height="gridHeight"
      :data="displayData"
      :columns="vxeColumns"
      :loading="loading"
      :row-config="rowConfig"
      :column-config="columnConfig"
      :virtual-y-config="virtualYConfig"
      :virtual-x-config="virtualXConfig"
      :scrollbar-config="scrollbarConfig"
      :resizable-config="{ isDblclickAutoWidth: true }"
      :show-header="showHeader"
      :row-class-name="rowClassName"
      @scroll="loadMore.onScroll"
      @cell-click="onCellClick"
      @data-rendered="onDataRendered"
      @column-resizable-change="onColumnResizeChange"
    )
      // vxe-table 4.7+ splits Loading into vxe-pc-ui; without VxeLoading registered,
      // :loading=true warns unless a #loading slot is provided.
      template(#loading)
        .dg-loading
          a-spin
      template(#empty)
        a-empty.dg-empty(description="No data")
          template(#image)
            img.dg-empty-icon(alt="" :src="tableEmptyIcon")
    .dg-load-more(
      v-if="loadMore.showLoadMoreBar.value"
      role="button"
      :class="{ 'is-loading': loadingMore }"
      :style="{ bottom: `${loadMore.scrollXOffset.value}px` }"
      :aria-busy="loadingMore ? 'true' : 'false'"
      @click="loadMore.requestLoadMore"
    )
      a-spin(v-if="loadingMore" :size="14")
      svg.dg-load-more__icon(v-else)
        use(href="#down")
      span.dg-load-more__text
        | {{ loadingMore ? t('drilldown.logs.loadingMore') : t('logsQuery.loadMoreHint') }}
  DataGridPager(
    v-if="paginationEnabled && paginationPlacement === 'bottom'"
    :total="pagination.totalRows.value"
    :current="pagination.currentPage.value"
    :page-size="pagination.pageSize.value"
    :page-size-options="paginationOptions.pageSizeOptions"
    :simple="paginationOptions.simple"
    @update:current="onPageChange"
    @update:page-size="onPageSizeChange"
  )
  a-popover(
    v-model:popup-visible="cellDetailVisible"
    trigger="click"
    position="top"
    popup-container="body"
    content-class="dg-cell-detail-popover"
  )
    .dg-cell-detail-anchor(aria-hidden="true" :style="cellDetailAnchorStyle")
    template(#content)
      .dg-cell-detail
        .dg-cell-detail__title {{ cellDetail?.title }}
        pre.dg-cell-detail__content {{ cellDetail?.content }}
  a-dropdown#dg-td-context(
    v-model:popup-visible="contextMenu.contextMenuVisible.value"
    trigger="contextMenu"
    :style="contextMenu.contextMenuStyle.value"
    @clickoutside="contextMenu.hideContextMenu"
    @popup-visible-change="contextMenu.onContextMenuVisibleChange"
    @select="contextMenu.handleMenuClick"
  )
    template(#content)
      a-doption(value="copy") Copy Field Value
      a-dsubmenu(v-if="contextMenu.filterOptions.value.length > 0" trigger="hover") Filter
        template(#content)
          a-doption(v-for="op in contextMenu.filterOptions.value" :key="op" :value="`filter_${op}`") {{ op }} value
</template>

<script setup lang="ts">
  import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDebounceFn, useElementSize } from '@vueuse/core'
  import { VxeGrid } from 'vxe-table'
  import 'vxe-table/lib/style.css'
  import type { ColumnType, TSColumn } from '@/types/query'
  import { isJsonDataType } from '@/utils/json-display'
  import tableEmptyIcon from '@/assets/images/table-empty.svg?url'
  import useTimeFormat from './composables/use-time-format'
  import useCellDetail from './composables/use-cell-detail'
  import useContextMenu from './composables/use-context-menu'
  import useLoadMore from './composables/use-load-more'
  import usePagination, {
    DEFAULT_PAGE_SIZE,
    DEFAULT_PAGE_SIZE_OPTIONS,
    type PaginationOptions,
  } from './composables/use-pagination'
  import DataGridPager from './DataGridPager.vue'
  import { formatCellText, renderJsonHeader, renderSemanticHeader } from './renderers'
  import {
    COLUMN_MAX_WIDTH,
    areWidthRulesEqual,
    computeColumnWidthRules,
    type LeftoverStrategy,
  } from './utils/column-widths'
  import { buildDisplayRows, getSeparateFields, isTimeColumn } from './utils/table-data'
  import { buildVxeColumns } from './utils/vxe-columns'
  import type { TableData } from './types'

  type VxeColumnInfo = { field?: string; renderWidth: number; renderAutoWidth: number }

  type VxeGridInstance = {
    recalculate?: (refull?: boolean) => Promise<void> | void
    recalcRowHeight?: (rowOrId: unknown) => Promise<void> | void
    getTableColumn?: () => { visibleColumn: VxeColumnInfo[] }
    scrollTo?: (scrollLeft: number, scrollTop: number) => Promise<void> | void
  }

  const props = withDefaults(
    defineProps<{
      data: TableData[]
      columns: ColumnType[]
      displayedColumns?: string[]
      tsColumn?: TSColumn | null
      /** Row-detail mode: the timestamp cell is a link (parity with tsCellDetail). */
      tsCellDetail?: boolean
      /**
       * When false: keep timestamp accent styling, but disable format/raw toggle
       * (no header tooltip, no pointer cursor, cell click does not flip format).
       * Use for APIs that already return readable timestamps (e.g. slow-query).
       */
      tsToggle?: boolean
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
      /** Drilldown chips (`=~`) vs Logs Query SQL builder (`LIKE`). */
      filterMenuKind?: 'sql-builder' | 'drilldown'
      /**
       * More rows can be fetched: enables the load-more footer + auto load.
       * Parents must freeze the Search/Run time window and keyset inside it on
       * `reachEnd` — never rewrite toolbar time from scroll (see log-keyset-window).
       */
      hasMore?: boolean
      /** A load-more request is in flight. */
      loadingMore?: boolean
      /** Disable row virtualization (small previews render every row). */
      virtual?: boolean | 'auto'
      virtualThreshold?: number
      leftoverStrategy?: LeftoverStrategy
      columnResizable?: boolean
      enableCellCopy?: boolean
      /** Client-side pagination. Mutually exclusive with hasMore load-more. */
      pagination?: boolean | PaginationOptions
      page?: number
      pageSize?: number
      /**
       * When false, the grid sizes to its content and the page scrolls
       * (e.g. Flow `gpt-table-page`). Default fills the parent panel height.
       */
      fillHeight?: boolean
    }>(),
    {
      data: () => [],
      columns: () => [],
      displayedColumns: () => [],
      tsColumn: null,
      tsCellDetail: false,
      tsToggle: true,
      columnMode: 'separate',
      loading: false,
      size: 'medium',
      showHeader: true,
      activeRowKey: null,
      linkColumn: '',
      height: 0,
      wrapLine: false,
      showContextMenu: false,
      filterMenuKind: 'sql-builder',
      hasMore: false,
      loadingMore: false,
      virtual: 'auto',
      virtualThreshold: 50,
      leftoverStrategy: 'last-column',
      columnResizable: true,
      enableCellCopy: false,
      pagination: false,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      fillHeight: true,
    }
  )

  const emit = defineEmits<{
    (e: 'reachEnd'): void
    (e: 'tsCellClick', row: TableData, rowIndex: number): void
    (e: 'columnLinkClick', columnName: string, value: string): void
    (e: 'filterConditionAdd', payload: { columnName: string; operator: string; value: unknown }): void
    (e: 'update:page', page: number): void
    (e: 'update:pageSize', size: number): void
    (e: 'pageChange', page: number, pageSize: number): void
  }>()

  const { t } = useI18n()
  const slots = useSlots()
  const { tsViewStr, formatTsDisplay, changeTsView, renderTsHeader } = useTimeFormat()

  const rootEl = ref<HTMLElement | null>(null)
  const gridHostEl = ref<HTMLElement | null>(null)
  const gridRef = ref<VxeGridInstance | null>(null)
  // Measure the grid host — not `.data-grid` — so a bottom pager does not
  // inflate `:height` and clip VXE's horizontal scrollbar under overflow:hidden.
  const { height: hostHeight } = useElementSize(gridHostEl)

  const paginationEnabled = computed(() => props.pagination !== false)
  const paginationOptions = computed(() => {
    const raw = props.pagination
    if (!raw || raw === true) {
      return {
        pageSize: props.pageSize || DEFAULT_PAGE_SIZE,
        pageSizeOptions: DEFAULT_PAGE_SIZE_OPTIONS,
        placement: 'bottom' as const,
        simple: false,
      }
    }
    return {
      pageSize: raw.pageSize ?? props.pageSize ?? DEFAULT_PAGE_SIZE,
      pageSizeOptions: raw.pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS,
      placement: raw.placement ?? 'bottom',
      simple: raw.simple ?? false,
    }
  })
  const paginationPlacement = computed(() => paginationOptions.value.placement)

  const pagination = usePagination({
    enabled: () => paginationEnabled.value,
    data: () => props.data,
    pageSize: () => paginationOptions.value.pageSize,
    activeRowKey: () => props.activeRowKey,
  })

  watch(
    () => props.page,
    (page) => {
      if (paginationEnabled.value && page > 0 && page !== pagination.currentPage.value) {
        pagination.setPage(page)
      }
    },
    { immediate: true }
  )

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

  function onPageChange(page: number) {
    pagination.setPage(page)
    emit('update:page', page)
    emit('pageChange', page, pagination.pageSize.value)
    nextTick(() => resolveGridApi()?.scrollTo?.(0, 0))
  }

  function onPageSizeChange(size: number) {
    pagination.setPageSize(size)
    emit('update:pageSize', size)
    emit('update:page', 1)
    emit('pageChange', 1, size)
    nextTick(() => resolveGridApi()?.scrollTo?.(0, 0))
  }

  const tableHeight = computed(() => {
    if (props.height > 0) {
      return props.height
    }
    return Math.max(0, hostHeight.value)
  })

  /** Prefer measured px; fall back to 100% so first paint is not blank. */
  const gridHeight = computed(() => {
    if (!props.fillHeight) {
      return undefined
    }
    return tableHeight.value > 0 ? tableHeight.value : '100%'
  })

  /** false = allow wrap + dynamic row height; 'ellipsis' = truncate without a native title. */
  const tableShowOverflow = computed(() => (props.wrapLine ? false : 'ellipsis'))
  /** Headers always ellipsis — wrapLine only applies to the body. */
  const tableHeaderOverflow = 'ellipsis'

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

  /**
   * Density via VXE CSS vars (grid uses size="mini"). Uniform cell padding —
   * VXE's --vxe-ui-table-cell-padding-mini is one value for all sides.
   * medium: 14/22/7 → 36px rows.
   */
  const CELL_TYPOGRAPHY = {
    mini: { font: 12, line: 18, pad: 5 },
    small: { font: 14, line: 22, pad: 5 },
    medium: { font: 14, line: 22, pad: 7 },
    large: { font: 14, line: 22, pad: 11 },
  } as const

  const cellTypographyStyle = computed(() => {
    const typography = CELL_TYPOGRAPHY[props.size] ?? CELL_TYPOGRAPHY.medium
    return {
      '--vxe-ui-font-family': 'var(--font-family-base)',
      '--vxe-ui-font-size-mini': `${typography.font}px`,
      '--vxe-ui-table-cell-padding-mini': `${typography.pad}px`,
      '--vxe-ui-table-row-line-height': `${typography.line}px`,
      '--vxe-ui-table-row-height-mini': `${rowHeight.value}px`,
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
    resizable: props.columnResizable && props.columnMode === 'separate',
  }))

  const showFilterMenu = computed(() => props.showContextMenu && props.columnMode === 'separate')

  /**
   * Row virtualization is decided by row count (`gt`), not by an app-level
   * "virtual vs not" flag: a 20-row page and a 20-row preview are the same table
   * for layout purposes, and a 100-row page benefits from virtual scrolling just
   * as much as an unpaginated result. `virtual: false` stays as an explicit
   * opt-out for tiny previews that rely on plain document flow.
   */
  const virtualYConfig = computed(() => ({
    enabled: props.virtual !== false,
    gt: props.virtualThreshold,
  }))

  /**
   * VXE scrolls via `.vxe-table--scroll-*-handle` (native body bars are hidden).
   * Pin size + visible so the handle track opens on overflow (macOS overlay
   * bars otherwise report 0 and the track never appears).
   */
  const SCROLLBAR_SIZE = 14
  const scrollbarConfig = {
    width: SCROLLBAR_SIZE,
    height: SCROLLBAR_SIZE,
    x: { visible: true },
    y: { visible: true },
  }

  const fieldsInput = computed(() => ({
    columns: props.columns,
    displayedColumns: props.displayedColumns,
    tsColumn: props.tsColumn,
    linkColumn: props.linkColumn,
  }))

  /**
   * Slice first, then format. Building display rows for the full result set
   * (old PaginatedDataTable did the opposite) made Traces with thousands of
   * rows × many columns freeze on every reactive pass.
   */
  const pageSourceData = computed(() => {
    if (!paginationEnabled.value) {
      return props.data
    }
    const start = (pagination.currentPage.value - 1) * pagination.pageSize.value
    return props.data.slice(start, start + pagination.pageSize.value).map((row, index) => ({
      ...row,
      __rowIndex: start + index,
    }))
  })

  const displayData = computed(() => {
    // Read tsViewStr here so toggling format always rebuilds display strings
    // (merged + separate). Default-arg reads inside formatTsDisplay are easy to miss.
    // tsToggle=false → always raw (API already readable / no format switch).
    const tsFormatted = props.tsToggle ? tsViewStr.value : false
    return buildDisplayRows({
      ...fieldsInput.value,
      data: pageSourceData.value,
      columnMode: props.columnMode,
      textOf: (value, column) => formatTsDisplay(value, column, tsFormatted),
    })
  })

  const layoutFields = computed(() => {
    if (props.columnMode !== 'separate') {
      return [props.tsColumn?.name, '__merged_message'].filter((f): f is string => Boolean(f))
    }
    return getSeparateFields(fieldsInput.value).map((item) => item.field)
  })

  /** Columns marked `flex: true` absorb leftover viewport width (minWidth). */
  const flexFields = computed(() =>
    props.columns.filter((column) => Boolean((column as ColumnType & { flex?: boolean }).flex)).map((c) => c.name)
  )

  const hideJsonNullsByColumn = ref<Record<string, boolean>>({})

  function isTimeField(field: string): boolean {
    return props.tsColumn?.name === field || isTimeColumn(props.columns.find((c) => c.name === field))
  }

  function resolveColumn(field: string): ColumnType | undefined {
    return (
      props.columns.find((column) => column.name === field) ||
      (props.tsColumn?.name === field
        ? ({
            name: field,
            data_type: props.tsColumn.data_type || 'timestamp',
            title: field,
          } as ColumnType)
        : undefined)
    )
  }

  /**
   * Advance widths as a fraction of the cell font size, measured on 14px Geist:
   *
   *   lowercase / punctuation  7.2px  (0.52em)
   *   digits / uppercase       8.8px  (0.63em)   ← hex ids, enums, timestamps
   *   CJK / full-width        13.9px  (1.00em)
   *
   * A single factor cannot cover all three: fitting lowercase made 32-char trace
   * ids clip, fitting ids wasted ~30% on timestamp columns. Ratios scale with the
   * font so `size="mini"` (12px) also works.
   */
  const NARROW_CHAR_RATIO = 0.52
  const WIDE_CHAR_RATIO = 0.63
  const CJK_CHAR_RATIO = 1
  /** Uniform cell pad × 2 (+4px buffer); edge columns add extra via CSS. */
  const ESTIMATED_CELL_PADDING_PX = 18
  /**
   * Extra room for slot decorations: context-menu icon (12px) + flex gap (4px) +
   * slack. Slot content can be wider than its text (buttons, icons), and the slot
   * renderer caps itself at 100% width, so under-allocating clips it.
   */
  /** Floor for slot columns: pills and single buttons fit at this width. */
  const SLOT_MIN_WIDTH_PX = 120
  const SLOT_DECORATION_PX = 28
  const ESTIMATED_MAX_WIDTH_PX = 600
  const ESTIMATED_MIN_WIDTH_PX = 60
  /**
   * Header weight 600 is slightly wider than body ratios. Keep a small overshoot
   * (legacy DataTable virtual used `8*len+32`, typically a few px over DOM).
   */
  const HEADER_WEIGHT_SLACK = 1.08
  /**
   * Floor for time columns: formatted `YYYY-MM-DD HH:mm:ss.SSS` (~176px text at
   * 14px Geist) + cell pad + first/last edge pad (dg-edge-*-16px). Legacy 200px
   * clipped the last column; 190px page widths clipped every time column.
   */
  const TIME_COLUMN_MIN_WIDTH_PX = 220
  /** Canonical formatted sample so empty / null rows still size for the toggle. */
  const TIME_FORMAT_SAMPLE = '2020-12-31 23:59:59.999'
  /** Pill padding (L+R) on `.gpt-semantic-th`. */
  const HEADER_PILL_PAD_PX = 12
  /** JSON header dropdown affordance. */
  const HEADER_JSON_ACTION_PX = 14
  /** Matches legacy `measureCellNaturalWidth` +4 anti-ellipsis buffer. */
  const WIDTH_ELLIPSIS_BUFFER_PX = 4
  // Full-width ranges: CJK, Hangul, Hiragana/Katakana, full-width forms.
  const CJK_CHARS = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/g
  const WIDE_CHARS = /[0-9A-Z]/g

  /** Content width estimate in px for one cell string (no DOM reads). */
  function estimateTextWidthPx(text: string, fontSizePx: number): number {
    const cjk = text.match(CJK_CHARS)?.length ?? 0
    const wide = text.match(WIDE_CHARS)?.length ?? 0
    const narrow = Math.max(0, text.length - cjk - wide)
    const em = narrow * NARROW_CHAR_RATIO + wide * WIDE_CHAR_RATIO + cjk * CJK_CHAR_RATIO
    return Math.ceil(em * fontSizePx + ESTIMATED_CELL_PADDING_PX)
  }

  /**
   * Header floor: title text (+ light pill chrome). Same for empty and non-empty —
   * body cells can only widen further. Time columns keep the legacy 200px floor.
   */
  function estimateHeaderWidthPx(field: string, meta: ColumnType | undefined, fontSizePx: number): number {
    if (isTimeField(field)) {
      return TIME_COLUMN_MIN_WIDTH_PX
    }
    const title = meta?.title || field
    let px = Math.ceil(estimateTextWidthPx(title, fontSizePx) * HEADER_WEIGHT_SLACK)
    if (meta && isJsonDataType(meta.data_type)) {
      px += HEADER_PILL_PAD_PX + HEADER_JSON_ACTION_PX
    } else if (meta?.semantic_type) {
      px += HEADER_PILL_PAD_PX
    }
    return px
  }

  /**
   * Per-column widths derived from the display strings — no DOM reads.
   *
   * Widths used to come from VXE's `calcColumnAutoWidth`, which is
   * O(columns × cells) because it queries the whole table once per column
   * (232 columns spent ~2.7s in a single long task). Estimating from the
   * already-stringified rows costs one string scan per column.
   */
  /**
   * Widths the user dragged, kept for this component's lifetime only.
   *
   * Deliberately **not** persisted: column sets are derived from query results and
   * differ per table/query, so stored widths go stale quickly and would accumulate
   * one entry per table. Keeping them in memory is enough to stop a column rebuild
   * (page change, visibility toggle, new result set) from snapping back.
   */
  const userWidths = ref<Record<string, number>>({})

  function estimateColumnWidths(): Record<string, number> {
    const fields = layoutFields.value
    const rows = displayData.value
    const sourceRows = pageSourceData.value
    const fontSize = CELL_TYPOGRAPHY[props.size]?.font ?? 14
    const widths: Record<string, number> = {}
    fields.forEach((field) => {
      // Columns with a parent slot carry decorations (link buttons, context-menu
      // icons, gaps) that raw text width does not account for — and their content
      // may not be text at all (pills, action buttons), in which case content is
      // only the header. Floor them so controls are never clipped.
      const hasSlot = Boolean(slots[`column-${field}`])
      const decoration = hasSlot ? SLOT_DECORATION_PX : 0
      const floor = hasSlot ? SLOT_MIN_WIDTH_PX : ESTIMATED_MIN_WIDTH_PX
      const meta = resolveColumn(field)

      // Flex absorbers only need a floor — leftover viewport fills the rest.
      // Measuring full SQL / long text as minWidth would force horizontal scroll.
      const isFlex = Boolean((meta as (ColumnType & { flex?: boolean }) | undefined)?.flex)
      let contentPx = estimateHeaderWidthPx(field, meta, fontSize)
      if (!isFlex) {
        if (isTimeField(field)) {
          // Always cover the formatted sample — empty/null cells and undersized
          // page `width` hints must not leave the column too narrow for the toggle.
          contentPx = Math.max(contentPx, estimateTextWidthPx(TIME_FORMAT_SAMPLE, fontSize))
          // Size for BOTH raw and formatted text so the format toggle does not
          // shrink/clip the column.
          for (let i = 0; i < sourceRows.length; i += 1) {
            const value = sourceRows[i][field]
            const raw = formatTsDisplay(value, meta, false)
            const formatted = formatTsDisplay(value, meta, true)
            contentPx = Math.max(
              contentPx,
              estimateTextWidthPx(raw, fontSize),
              estimateTextWidthPx(formatted, fontSize)
            )
          }
        } else {
          // Widest body string wins — *not* the longest one (digit-heavy ids are
          // wider than lowercase of the same length).
          for (let i = 0; i < rows.length; i += 1) {
            const text = rows[i][field]
            if (typeof text === 'string') {
              contentPx = Math.max(contentPx, estimateTextWidthPx(text, fontSize))
            }
          }
        }
      }

      const estimated = isFlex
        ? Math.max(floor, contentPx + decoration + WIDTH_ELLIPSIS_BUFFER_PX)
        : Math.min(ESTIMATED_MAX_WIDTH_PX, Math.max(floor, contentPx + decoration + WIDTH_ELLIPSIS_BUFFER_PX))
      // A width the user dragged always wins over the estimate.
      widths[field] = userWidths.value[field] ?? estimated
    })
    return widths
  }

  const columnWidthRules = ref<ReturnType<typeof computeColumnWidthRules>>({})

  // Column virtualization is always safe: widths never depend on the DOM,
  // so off-screen columns don't need to be rendered to be sized.
  const virtualXConfig = computed(() => ({
    enabled: props.columnMode === 'separate' && layoutFields.value.length > 8,
    gt: 0,
  }))

  watch(
    () =>
      [
        layoutFields.value.join('\0'),
        displayData.value,
        props.size,
        props.leftoverStrategy,
        flexFields.value.join('\0'),
      ] as const,
    () => {
      const next = computeColumnWidthRules(
        layoutFields.value,
        estimateColumnWidths(),
        props.leftoverStrategy,
        flexFields.value
      )
      if (!areWidthRulesEqual(columnWidthRules.value, next)) {
        columnWidthRules.value = next
      }
    },
    { immediate: true }
  )

  function getOriginalRow(row: TableData): TableData {
    const rowIndex = typeof row.__rowIndex === 'number' ? row.__rowIndex : -1
    if (rowIndex >= 0 && props.data[rowIndex]) {
      return props.data[rowIndex]
    }
    return row
  }

  function isHideJsonNulls(columnName: string): boolean {
    return hideJsonNullsByColumn.value[columnName] !== false
  }

  function toggleHideJsonNulls(columnName: string) {
    hideJsonNullsByColumn.value = {
      ...hideJsonNullsByColumn.value,
      [columnName]: !isHideJsonNulls(columnName),
    }
  }

  const contextMenu = useContextMenu({
    enabled: showFilterMenu,
    columns: () => props.columns,
    isTimeField,
    getOriginalRow,
    filterMenuKind: () => props.filterMenuKind,
    onFilter: (payload) => emit('filterConditionAdd', payload),
  })

  const cellDetailApi = useCellDetail({
    rootEl,
    columnMode: () => props.columnMode,
  })
  const {
    cellDetail,
    cellDetailVisible,
    cellDetailAnchorStyle,
    scheduleCellDetail,
    closeCellDetail,
    clearDetailHoverCell,
    isDetailCellTarget,
  } = cellDetailApi

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
    // Same glyph as table-query sidebar (`table-menu`: #extra + rotate-90).
    return h(
      'span',
      {
        class: 'dg-cell-action',
        title: 'Filter / Copy',
        onClick: (event: MouseEvent) => contextMenu.openContextMenu(row, field, event),
      },
      [h('svg', { 'class': 'icon-14 rotate-90', 'aria-hidden': 'true' }, [h('use', { href: '#extra' })])]
    )
  }

  function renderHeader(column: ColumnType, _field: string, title: string) {
    if (isTimeColumn(column) || props.tsColumn?.name === column.name) {
      return renderTsHeader(title, { toggle: props.tsToggle })
    }
    if (isJsonDataType(column.data_type)) {
      return renderJsonHeader(column, {
        hideNulls: isHideJsonNulls(column.name),
        onToggleHideNulls: () => toggleHideJsonNulls(column.name),
      })
    }
    if (column.semantic_type) {
      return renderSemanticHeader(column)
    }
    // Plain titles need a block element for text-overflow; a raw string
    // in the header slot won't ellipsis under col--ellipsis alone.
    return h('span', { class: 'dg-header-title' }, title)
  }

  function renderSeparateCell(params: { row: TableData; column: { field?: string } }) {
    const { row, column } = params
    const field = column?.field || ''
    const meta = resolveColumn(field)
    // Time columns: format from the original row so the header toggle is visible
    // even when the grid slot does not re-run through displayData alone.
    const text = isTimeField(field)
      ? formatTsDisplay(getOriginalRow(row)[field], meta, props.tsToggle ? undefined : false)
      : formatCellText(row[field], meta, isHideJsonNulls(field))
    const isLink = Boolean(props.linkColumn && field === props.linkColumn)

    const textNode = isLink
      ? h(
          'button',
          {
            type: 'button',
            class: 'dg-link',
            onClick: (event: MouseEvent) => onLinkClick(field, text, event),
          },
          text
        )
      : h('span', { class: 'dg-cell-text' }, text)

    return h('div', { class: 'dg-cell-inner' }, [textNode, renderActionIcon(row, field)])
  }

  function renderMergedCell(params: { row: TableData }) {
    const parts = (params.row.__merged_parts as { key: string; text: string; isLink: boolean }[] | undefined) || []
    const showKeys = props.columnMode === 'merged-with-keys'
    const nodes = parts.flatMap((part, index) => {
      const pieces: ReturnType<typeof h>[] = []
      if (index > 0) {
        pieces.push(h('span', ' '))
      }
      if (showKeys) {
        pieces.push(h('span', { class: 'dg-merged-key' }, `${part.key}: `))
      }
      if (part.isLink) {
        pieces.push(
          h(
            'button',
            {
              type: 'button',
              class: 'dg-link',
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
    // Wrap in `.dg-cell-text` so nowrap + ellipsis apply — bare spans inside the
    // flex slot are hard-clipped by VXE with no `...`.
    return h('div', { class: 'dg-cell-inner dg-merged-cell' }, [h('span', { class: 'dg-cell-text' }, nodes)])
  }

  function hasColumnSlot(field: string) {
    return Boolean(slots[`column-${field}`])
  }

  function renderColumnSlot(params: { row: TableData; column: { field?: string } }) {
    const { row, column } = params
    const field = column?.field || ''
    const slot = slots[`column-${field}`]
    if (!slot) {
      return renderSeparateCell(params)
    }
    const meta = resolveColumn(field) || ({ name: field, data_type: '', title: field } as ColumnType)
    const original = getOriginalRow(row)
    const rowIndex = typeof row.__rowIndex === 'number' ? row.__rowIndex : 0
    return h('div', { class: 'dg-cell-inner' }, [
      slot({
        record: original,
        rowIndex,
        column: meta,
        renderedValue: formatCellText(row[field], meta, isHideJsonNulls(field)),
        showContextMenu: showFilterMenu.value,
        handleContextMenu: (record: TableData, columnName: string, event: Event) =>
          contextMenu.openContextMenu(record, columnName, event),
      }),
      renderActionIcon(row, field),
    ])
  }

  const vxeColumns = computed(() => {
    const cols = buildVxeColumns({
      columnMode: props.columnMode,
      columns: props.columns,
      displayedColumns: props.displayedColumns,
      tsColumn: props.tsColumn,
      linkColumn: props.linkColumn,
      tsCellDetail: props.tsCellDetail,
      tsToggle: props.tsToggle,
      wrapLine: props.wrapLine,
      widthRules: columnWidthRules.value,
      renderSeparateCell,
      renderMergedCell,
      renderHeader,
      hasColumnSlot,
      renderColumnSlot,
    })
    // New array when format toggles so VXE refreshes header + time cell slots.
    return tsViewStr.value ? cols : cols.map((col) => ({ ...col }))
  })

  function rowClassName({ row }: { row: TableData }) {
    const key = typeof row.__rowIndex === 'number' ? row.__rowIndex : null
    if (key != null && props.activeRowKey === key) {
      return 'dg-row-active'
    }
    return ''
  }

  function onCellClick({ row, column, $event }: { row: TableData; column: { field?: string }; $event?: MouseEvent }) {
    const rowIndex = typeof row.__rowIndex === 'number' ? row.__rowIndex : -1
    const original = getOriginalRow(row)
    const field = column?.field
    if (field && props.tsColumn?.name && field === props.tsColumn.name) {
      if (props.tsCellDetail) {
        emit('tsCellClick', original, rowIndex)
        return
      }
      if (props.tsToggle) {
        changeTsView()
      }
      return
    }
    if (field && isTimeColumn(props.columns.find((c) => c.name === field))) {
      if (props.tsToggle) {
        changeTsView()
      }
      return
    }
    if (isDetailCellTarget($event)) {
      return
    }
    if (props.columnMode === 'separate') {
      if (field && !isTimeField(field) && field !== props.linkColumn && row[field]) {
        scheduleCellDetail(row, field, $event)
      }
      return
    }
    if (field === '__merged_message' && row.__merged_message) {
      scheduleCellDetail(row, field, $event)
    }
  }

  /** Wrapped rows need real heights; virtual scroll estimates the rest. */
  async function recalcRowHeights() {
    if (!props.wrapLine || displayData.value.length === 0) {
      return
    }
    const api = resolveGridApi()
    if (!api || typeof api.recalcRowHeight !== 'function') {
      return
    }
    await nextTick()
    const sample = displayData.value.slice(0, Math.min(displayData.value.length, 100))
    await Promise.resolve(api.recalcRowHeight(sample))
  }

  const loadMore = useLoadMore({
    rootEl,
    rowHeight: () => rowHeight.value,
    hasMore: () => props.hasMore && !paginationEnabled.value,
    loadingMore: () => props.loadingMore,
    wrapLine: () => props.wrapLine,
    data: () => props.data,
    request: () => emit('reachEnd'),
    onScrollActivity: () => {
      closeCellDetail()
      clearDetailHoverCell()
    },
  })

  onMounted(() => {
    loadMore.checkViewportFilled()
    rootEl.value?.addEventListener('wheel', loadMore.markScrollIntent, { passive: true })
    rootEl.value?.addEventListener('touchmove', loadMore.markScrollIntent, { passive: true })
  })

  // ── User column resize ──────────────────────────────────────────────────────
  // VXE emits `column-resizable-change` continuously while dragging. Rebuilding the
  // column set mid-drag cancels VXE's resize handle (the trap the old Arco table fell
  // into), so collect the values and commit once the drag goes quiet.
  const pendingResize = new Map<string, number>()
  let resizeCommitTimer: ReturnType<typeof setTimeout> | null = null

  function commitColumnResize() {
    resizeCommitTimer = null
    if (pendingResize.size === 0) {
      return
    }
    const next = { ...userWidths.value }
    pendingResize.forEach((px, field) => {
      next[field] = px
    })
    pendingResize.clear()
    userWidths.value = next
  }

  function onColumnResizeChange(params: { column?: { field?: string }; resizeWidth?: number }) {
    const field = params?.column?.field
    const width = Number(params?.resizeWidth)
    if (!field || !Number.isFinite(width) || width <= 0) {
      return
    }
    pendingResize.set(field, Math.round(width))
    if (resizeCommitTimer) {
      clearTimeout(resizeCommitTimer)
    }
    resizeCommitTimer = setTimeout(commitColumnResize, 250)
  }

  onBeforeUnmount(() => {
    rootEl.value?.removeEventListener('wheel', loadMore.markScrollIntent)
    rootEl.value?.removeEventListener('touchmove', loadMore.markScrollIntent)
    if (resizeCommitTimer) {
      clearTimeout(resizeCommitTimer)
      resizeCommitTimer = null
    }
  })

  watch(
    () => props.data.length,
    () => {
      loadMore.checkViewportFilled()
    }
  )

  watch(
    () => [props.hasMore, props.loadingMore] as const,
    () => {
      loadMore.checkViewportFilled()
    },
    { immediate: true }
  )

  watch(loadMore.showLoadMoreBar, (visible) => {
    if (visible) {
      nextTick(loadMore.syncScrollXOffset)
    }
  })

  // Columns get their widths from the data (no DOM measurement), so a result set
  // change only needs to re-run the row-height pass for wrapped rows.
  function onDataRendered() {
    recalcRowHeights()
  }

  watch(
    () => [props.data[0], props.wrapLine] as const,
    () => {
      if (props.wrapLine) {
        nextTick(recalcRowHeights)
      }
    },
    { immediate: true }
  )

  watch(
    () =>
      [props.data, props.data.length, props.columns, props.displayedColumns, props.columnMode, props.tsColumn] as const,
    () => {
      closeCellDetail()
      clearDetailHoverCell()
    }
  )
</script>

<style lang="less" scoped>
  .data-grid {
    height: 100%;
    width: 100%;
    min-height: 0;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;

    &--auto-height {
      height: auto;
      overflow: visible;

      .dg-grid-host {
        flex: none;
        overflow: visible;
      }
    }

    .dg-grid-host {
      position: relative;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .dg-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.6);
    }

    .dg-empty-icon {
      width: 52px;
      height: 52px;
    }

    :deep(.dg-empty .arco-empty-description) {
      font-family: var(--font-mono);
      font-size: var(--gpt-font-lg, 14px);
    }

    :deep(.vxe-table),
    :deep(.vxe-grid) {
      // Brand → VXE theme vars. Density (--vxe-ui-font-size-mini,
      // cell-padding-mini, row-line-height, row-height-mini) comes from
      // cellTypographyStyle on the root. Header font-color must be set here:
      // VXE resolves it at :root from --vxe-ui-font-color before it reaches us.
      --vxe-ui-table-header-background-color: var(--gpt-table-head-bg, #eeecf0);
      // Match table-query data-view (`.arco-table-th { color: primary }`), not
      // the lighter Arco theme default (`@table-color-text-header-cell: secondary`).
      --vxe-ui-table-header-font-color: var(--gpt-text-primary, #473460);
      --vxe-ui-table-header-font-weight: 600;
      --vxe-ui-table-row-hover-background-color: var(--gpt-table-row-hover-bg, rgba(112, 47, 237, 0.08));
      --vxe-ui-table-row-current-background-color: var(--gpt-nav-active-bg, rgba(112, 47, 237, 0.1));
      --vxe-ui-font-color: var(--gpt-text-primary, #473460);
      --vxe-ui-table-border-color: var(--gpt-border-subtle, rgba(71, 52, 96, 0.05));
      --vxe-ui-table-resizable-drag-line-color: var(--gpt-main-dark, #473460);
      // Match scrollbarConfig so the scroll-handle track has a non-zero size.
      --vxe-ui-table-view-scrollbar-width: 14px;
      --vxe-ui-table-view-scrollbar-height: 14px;
    }

    // Active row: bg mirrors --vxe-ui-table-row-current-background-color;
    // 3px inset has no VXE equivalent.
    :deep(.dg-row-active) {
      background-color: var(--vxe-ui-table-row-current-background-color) !important;
    }

    :deep(.dg-row-active > .vxe-body--column:first-child) {
      box-shadow: inset 3px 0 0 var(--gpt-nav-active-indicator, #702fed);
    }

    :deep(.dg-cell-inner) {
      position: relative;
      display: flex;
      align-items: center;
      min-width: 0;
      width: 100%;
      gap: 4px;
    }

    :deep(.vxe-body--column.dg-detail-cell) {
      cursor: default;
    }

    // Clipped cells are openable (click → popup). The only affordance is the pointer
    // cursor: a per-cell hover ring reads as a selection and doesn't match the rest of
    // the table, whose hover language is the row background.
    :deep(.vxe-body--column.dg-detail-cell--overflow) {
      cursor: pointer;
    }

    .dg-cell-detail-anchor {
      position: fixed;
      z-index: -1;
      margin: 0;
      opacity: 0;
      pointer-events: none;
    }

    :deep(.dg-cell-text) {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :deep(.dg-ts-th) {
      cursor: pointer;
      // Icon + accent text only — no semantic pill background.
      background-color: transparent;
    }

    :deep(.dg-ts-th--static) {
      cursor: default;
    }

    // First/last column edge — align with page/toolbar content; no VXE API.
    :deep(.dg-edge-left > .vxe-cell) {
      padding-left: 16px;
    }

    :deep(.dg-edge-right > .vxe-cell) {
      padding-right: 16px;
    }

    :deep(.dg-link) {
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

    :deep(.dg-merged-key) {
      color: var(--gpt-text-muted);
    }

    :deep(.json-column-th-action) {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      margin-left: 2px;
      border-radius: 2px;
      cursor: pointer;
      color: var(--gpt-text-muted);
      opacity: 0.75;

      &:hover {
        opacity: 1;
        background: var(--color-fill-2);
        color: var(--gpt-text-primary);
      }
    }

    // Load-more footer (Grafana-style): a slim row pinned to the bottom of the
    // viewport, above VXE's horizontal scrollbar.
    .dg-load-more {
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

    .dg-load-more__icon {
      width: 12px;
      height: 12px;
      color: currentColor;
      fill: currentColor;
    }

    // Overlay — does not steal wrap-mode text width on hover. Matches table-query
    // sidebar menu glyph (`#extra` + rotate-90).
    :deep(.dg-cell-action) {
      position: absolute;
      top: 50%;
      right: 2px;
      z-index: 1;
      display: none;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      margin-top: -8px;
      cursor: pointer;
      color: var(--gpt-main-purple, #702fed);
      // Soft plate so the icon stays readable over cell text.
      background: linear-gradient(90deg, transparent, var(--gpt-bg-panel, #fff) 35%);
    }

    // Only the hovered cell shows its action icon (legacy Arco parity) — not the
    // whole hovered row.
    :deep(.vxe-body--column:hover .dg-cell-action) {
      display: inline-flex;
    }

    :deep(.dg-cell-action:hover) {
      color: var(--gpt-brand-900, #473460);
    }

    // VXE default `.vxe-cell { white-space: pre-line; word-break: break-all }`
    // collapses auto-measure (~40px). No VXE var to disable — keep this override.
    :deep(.vxe-header--column .vxe-cell),
    :deep(.vxe-body--column .vxe-cell) {
      white-space: nowrap;
      word-break: normal;
    }

    // Custom header slots are outside `.vxe-cell--title`; let flex children shrink.
    :deep(.vxe-header--column.col--ellipsis .vxe-cell--wrapper) {
      min-width: 0;
    }

    :deep(.vxe-header--column .dg-header-title) {
      display: block;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &--wrap {
      :deep(.vxe-body--column .vxe-cell),
      :deep(.dg-cell-text) {
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.4;
        text-overflow: clip;
        overflow: visible;
      }

      :deep(.dg-cell-action) {
        top: 4px;
        margin-top: 0;
      }
    }
  }
</style>

<style lang="less">
  .dg-cell-detail-popover {
    max-width: 600px;
    padding: 10px;

    .dg-cell-detail {
      display: flex;
      min-width: 220px;
      flex-direction: column;
      gap: 6px;
    }

    .dg-cell-detail__title {
      color: var(--color-text-2, #4e5969);
      font-size: 12px;
      font-weight: 600;
      word-break: break-word;
    }

    .dg-cell-detail__content {
      max-height: 40vh;
      margin: 0;
      overflow: auto;
      color: var(--color-text-1, #1d2129);
      font-family: inherit;
      font-size: 12px;
      line-height: 1.5;
      user-select: text;
      white-space: pre-wrap;
      word-break: break-word;
    }
  }

  .json-column-menu-item {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    min-width: 140px;
  }

  .json-column-menu-check {
    margin-left: auto;
    color: var(--gpt-accent, var(--color-primary));
    font-weight: 600;
  }
</style>
