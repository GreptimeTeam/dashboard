<template lang="pug">
.logs-vxe-table(ref="rootEl" :class="{ 'logs-vxe-table--wrap': wrapLine }")
  component(
    :key="wrapLine ? 'wrap' : 'nowrap'"
    ref="gridRef"
    border
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
  import { computed, h, nextTick, ref, shallowRef, watch } from 'vue'
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
    getColumns?: () => { field?: string; renderWidth?: number; visible?: boolean }[]
    getColumnWidth?: (field: string) => number
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
    }
  )

  const emit = defineEmits<{
    (e: 'reachEnd'): void
    (e: 'tsCellClick', row: TableData, rowIndex: number): void
    (e: 'columnLinkClick', columnName: string, value: string): void
    (e: 'filterConditionAdd', payload: { columnName: string; operator: string; value: unknown }): void
    (e: 'virtualColumnsClipped', visible: boolean): void
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

  function openContextMenu(row: TableData, columnName: string, event: MouseEvent) {
    if (!showFilterMenu.value) {
      return
    }
    const original = getOriginalRow(row)
    triggerCell.value = [original, columnName]
    event.preventDefault()
    event.stopPropagation()

    const column = props.columns.find((col) => col.name === columnName)
    if (column) {
      if (column.data_type && column.data_type.toLowerCase() === 'json') {
        filterOptions.value = []
      } else if (isTimeColumn(column) || props.tsColumn?.name === columnName) {
        filterOptions.value = ['>=', '<=']
      } else {
        filterOptions.value = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE']
      }
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
    if (!showFilterMenu.value) {
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

  function updateClippedHint() {
    if (props.columnMode !== 'separate') {
      emit('virtualColumnsClipped', false)
      return
    }
    const api = resolveGridApi()
    const containerW = rootEl.value?.clientWidth || measuredWidth.value
    if (!api || !(containerW > 0)) {
      return
    }

    let total = 0
    if (typeof api.getColumns === 'function') {
      const seen = new Set<string>()
      ;(api.getColumns() || []).forEach((col) => {
        if (!col?.field || col.visible === false || seen.has(col.field)) {
          return
        }
        seen.add(col.field)
        const w = typeof api.getColumnWidth === 'function' ? api.getColumnWidth(col.field) : col.renderWidth || 0
        total += w > 0 ? w : col.renderWidth || 0
      })
    }

    emit('virtualColumnsClipped', total > containerW + 1)
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
      updateClippedHint()
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

    if (merge) {
      if (tsName) {
        cols.push(
          contentColumn(tsName, tsName, {
            className: getTimeColumnClassNames(true, true),
            width: TIME_COLUMN_FIXED_WIDTH,
            slots: { default: renderSeparateCell, header: () => renderTsHeader(tsName) },
          })
        )
      }
      cols.push(
        contentColumn('__merged_message', 'message', {
          minWidth: 'auto',
          slots: { default: renderMergedCell },
        })
      )
      return cols
    }

    getSeparateFields().forEach((item) => {
      const classNames = [getTimeColumnClassNames(item.isTs, item.isTime), item.isLink ? 'logs-vxe-link-col' : '']
        .filter(Boolean)
        .join(' ')
      const rule = columnWidthRules.value[item.field] || {}
      cols.push(
        contentColumn(item.field, item.title, {
          ...(classNames ? { className: classNames } : {}),
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

  function onScroll(params: { isY?: boolean; scrollTop?: number; scrollHeight?: number; bodyHeight?: number }) {
    const { isY, scrollTop, scrollHeight, bodyHeight } = params
    if (!isY || scrollTop == null || scrollHeight == null || bodyHeight == null) {
      return
    }
    const remaining = scrollHeight - scrollTop - bodyHeight
    if (remaining <= 64) {
      if (reachEndArmed) {
        reachEndArmed = false
        emit('reachEnd')
      }
    } else if (remaining > 120) {
      reachEndArmed = true
    }
  }

  watch(
    () => props.data.length,
    () => {
      reachEndArmed = true
    }
  )

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
      --vxe-ui-table-border-color: var(--color-border-2, #e5e6eb);
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
    }

    :deep(.logs-vxe-link),
    :deep(.logs-vxe-link-col .logs-vxe-link) {
      color: var(--color-primary-6, #165dff);
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
