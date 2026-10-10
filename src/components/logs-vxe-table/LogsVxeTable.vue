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
    :virtual-y-config="virtualYConfig"
    :virtual-x-config="virtualXConfig"
    :show-header="showHeader"
    :row-class-name="rowClassName"
    @scroll="loadMore.onScroll"
    @cell-click="onCellClick"
  )
    // vxe-table 4.7+ splits Loading into vxe-pc-ui; without VxeLoading registered,
    // :loading=true warns unless a #loading slot is provided.
    template(#loading)
      .logs-vxe-loading
        a-spin
    template(#empty)
      span.logs-vxe-empty {{ t('logsQuery.nodata') }}
  // Load-more affordance (Grafana-like footer): appears once the user reaches the
  // end of the loaded rows. Clicking it or scrolling on both load the next page.
  .logs-vxe-load-more(
    v-if="loadMore.showLoadMoreBar.value"
    role="button"
    :class="{ 'is-loading': loadingMore }"
    :style="{ bottom: `${loadMore.scrollXOffset.value}px` }"
    :aria-busy="loadingMore ? 'true' : 'false'"
    @click="loadMore.requestLoadMore"
  )
    a-spin(v-if="loadingMore" :size="14")
    svg.logs-vxe-load-more__icon(v-else)
      use(href="#down")
    span.logs-vxe-load-more__text
      | {{ loadingMore ? t('drilldown.logs.loadingMore') : t('logsQuery.loadMoreHint') }}
  a-popover(
    v-model:popup-visible="cellDetailVisible"
    trigger="click"
    position="top"
    popup-container="body"
    content-class="logs-vxe-cell-detail-popover"
  )
    .logs-vxe-cell-detail-anchor(aria-hidden="true" :style="cellDetailAnchorStyle")
    template(#content)
      .logs-vxe-cell-detail
        .logs-vxe-cell-detail__title {{ cellDetail?.title }}
        pre.logs-vxe-cell-detail__content {{ cellDetail?.content }}
  a-dropdown#logs-vxe-td-context(
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
  import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useElementSize } from '@vueuse/core'
  import { VxeGrid } from 'vxe-table'
  import 'vxe-table/lib/style.css'
  import type { ColumnType, TSColumn } from '@/types/query'
  import useLogsTimeFormat from './composables/use-logs-time-format'
  import useLogsCellDetail from './composables/use-logs-cell-detail'
  import useLogsContextMenu from './composables/use-logs-context-menu'
  import useLogsLoadMore from './composables/use-logs-load-more'
  import getCellString from './utils/cell-text'
  import { areWidthRulesEqual, computeColumnWidthRules } from './utils/column-widths'
  import { buildDisplayRows, getSeparateFields, getVisibleFieldNames, isTimeColumn } from './utils/table-data'
  import { buildVxeColumns } from './utils/vxe-columns'
  import type { ColumnWidthRule, TableData } from './types'

  /** Rows sampled for the content-width heuristic (first page is enough). */
  const CONTENT_SAMPLE_ROWS = 100

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
      virtual?: boolean
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
      filterMenuKind: 'sql-builder',
      hasMore: false,
      loadingMore: false,
      virtual: true,
    }
  )

  const emit = defineEmits<{
    (e: 'reachEnd'): void
    (e: 'tsCellClick', row: TableData, rowIndex: number): void
    (e: 'columnLinkClick', columnName: string, value: string): void
    (e: 'filterConditionAdd', payload: { columnName: string; operator: string; value: unknown }): void
  }>()

  const { t } = useI18n()
  const { tsViewStr, formatTsDisplay, changeTsView, renderTsHeader } = useLogsTimeFormat()

  const rootEl = ref<HTMLElement | null>(null)
  const gridRef = ref<VxeGridInstance | null>(null)
  const { height: measuredHeight, width: measuredWidth } = useElementSize(rootEl)

  const tableHeight = computed(() => {
    if (props.height > 0) {
      return props.height
    }
    return Math.max(0, measuredHeight.value)
  })

  /** Prefer measured px; fall back to 100% so first paint is not blank. */
  const gridHeight = computed(() => (tableHeight.value > 0 ? tableHeight.value : '100%'))

  /** false = allow wrap + dynamic row height; 'ellipsis' = truncate without a native title. */
  const tableShowOverflow = computed(() => (props.wrapLine ? false : 'ellipsis'))

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

  const virtualYConfig = computed(() => ({
    enabled: props.virtual,
    gt: 0,
  }))

  const virtualXConfig = computed(() => ({
    enabled: props.columnMode === 'separate' && !props.wrapLine,
    gt: 0,
  }))

  // ---------------------------------------------------------------------------
  // Table data + columns
  // ---------------------------------------------------------------------------
  const fieldsInput = computed(() => ({
    columns: props.columns,
    displayedColumns: props.displayedColumns,
    tsColumn: props.tsColumn,
    linkColumn: props.linkColumn,
  }))

  const tableData = computed(() =>
    buildDisplayRows({
      ...fieldsInput.value,
      data: props.data,
      columnMode: props.columnMode,
      textOf: (value, column) => formatTsDisplay(value, column),
    })
  )

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

  const columnWidthRules = ref<Record<string, ColumnWidthRule>>({})

  /**
   * Keep the same object when nothing changed: a new `columns` prop array makes
   * VXE rebuild columns and drop the user's manual resize.
   */
  function refreshColumnWidthRules() {
    if (props.columnMode !== 'separate') {
      if (!areWidthRulesEqual(columnWidthRules.value, {})) {
        columnWidthRules.value = {}
      }
      return
    }
    const fields = getSeparateFields(fieldsInput.value)
    const naturalLengths: Record<string, number> = {}
    fields.forEach((item) => {
      naturalLengths[item.field] = getColumnNaturalCharLength(item.field, item.title, item.isTime)
    })
    const next = computeColumnWidthRules(fields, naturalLengths)
    if (!areWidthRulesEqual(columnWidthRules.value, next)) {
      columnWidthRules.value = next
    }
  }

  const vxeColumns = computed(() =>
    buildVxeColumns({
      columnMode: props.columnMode,
      columns: props.columns,
      displayedColumns: props.displayedColumns,
      tsColumn: props.tsColumn,
      linkColumn: props.linkColumn,
      tsCellDetail: props.tsCellDetail,
      wrapLine: props.wrapLine,
      widthRules: columnWidthRules.value,
      renderSeparateCell,
      renderMergedCell,
      renderTsHeader,
    })
  )

  // ---------------------------------------------------------------------------
  // Interaction: context menu, links, cell detail
  // ---------------------------------------------------------------------------
  function getOriginalRow(row: TableData): TableData {
    const rowIndex = typeof row.__rowIndex === 'number' ? row.__rowIndex : -1
    if (rowIndex >= 0 && props.data[rowIndex]) {
      return props.data[rowIndex]
    }
    return row
  }

  function isTimeField(field: string): boolean {
    return props.tsColumn?.name === field || isTimeColumn(props.columns.find((c) => c.name === field))
  }

  const contextMenu = useLogsContextMenu({
    enabled: showFilterMenu,
    columns: () => props.columns,
    isTimeField,
    getOriginalRow,
    filterMenuKind: () => props.filterMenuKind,
    onFilter: (payload) => emit('filterConditionAdd', payload),
  })

  const cellDetailApi = useLogsCellDetail({
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
    return h(
      'span',
      {
        class: 'logs-vxe-cell-action',
        title: 'Filter / Copy',
        onClick: (event: MouseEvent) => contextMenu.openContextMenu(row, field, event),
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
    const parts = (params.row.__merged_parts as { key: string; text: string; isLink: boolean }[] | undefined) || []
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

  function rowClassName({ row }: { row: TableData }) {
    const key = typeof row.__rowIndex === 'number' ? row.__rowIndex : null
    if (key != null && props.activeRowKey === key) {
      return 'logs-vxe-row-active'
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
      changeTsView()
      return
    }
    // Secondary time columns only toggle the format (legacy changeTsView parity).
    if (field && isTimeColumn(props.columns.find((c) => c.name === field))) {
      changeTsView()
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

  // ---------------------------------------------------------------------------
  // Grid api + width recalcs
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Load more
  // ---------------------------------------------------------------------------
  const loadMore = useLogsLoadMore({
    rootEl,
    rowHeight: () => rowHeight.value,
    hasMore: () => props.hasMore,
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

  onBeforeUnmount(() => {
    rootEl.value?.removeEventListener('wheel', loadMore.markScrollIntent)
    rootEl.value?.removeEventListener('touchmove', loadMore.markScrollIntent)
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

  // The scrollbar only exists once the grid is laid out — re-measure when the
  // footer appears so it never covers the horizontal scrollbar.
  watch(loadMore.showLoadMoreBar, (visible) => {
    if (visible) {
      nextTick(loadMore.syncScrollXOffset)
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
  .logs-vxe-table {
    height: 100%;
    width: 100%;
    min-height: 0;
    overflow: hidden;
    position: relative;

    .logs-vxe-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.6);
    }

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

    :deep(.vxe-body--column.logs-vxe-detail-cell) {
      cursor: default;
    }

    :deep(.vxe-body--column.logs-vxe-detail-cell--overflow) {
      cursor: pointer;

      &:hover {
        box-shadow: inset 0 0 0 1px var(--color-primary-light-2, #bedaff);
      }
    }

    .logs-vxe-cell-detail-anchor {
      position: fixed;
      z-index: -1;
      margin: 0;
      opacity: 0;
      pointer-events: none;
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

<style lang="less">
  .logs-vxe-cell-detail-popover {
    max-width: 600px;
    padding: 10px;

    .logs-vxe-cell-detail {
      display: flex;
      min-width: 220px;
      flex-direction: column;
      gap: 6px;
    }

    .logs-vxe-cell-detail__title {
      color: var(--color-text-2, #4e5969);
      font-size: 12px;
      font-weight: 600;
      word-break: break-word;
    }

    .logs-vxe-cell-detail__content {
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
</style>
