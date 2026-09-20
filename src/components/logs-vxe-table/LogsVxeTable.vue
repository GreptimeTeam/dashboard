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
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import { useElementSize } from '@vueuse/core'
  import { VxeGrid, VxeUI } from 'vxe-table'
  import 'vxe-table/lib/style.css'
  import type { ColumnType, TSColumn } from '@/types/query'

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

  /** Soft cap for separate (multi-column) mode — align with legacy DataTable. */
  const COLUMN_MAX_WIDTH = 600

  interface TableData {
    [key: string]: any
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
      columnMode?: 'separate' | 'merged' | 'merged-with-keys'
      loading?: boolean
      size?: 'small' | 'mini' | 'medium' | 'large'
      showHeader?: boolean
      activeRowKey?: number | null
      linkColumn?: string
      height?: number
      /** When true: wrap cells and use dynamic row height (VXE showOverflow false). */
      wrapLine?: boolean
    }>(),
    {
      data: () => [],
      columns: () => [],
      displayedColumns: () => [],
      tsColumn: null,
      columnMode: 'separate',
      loading: false,
      size: 'medium',
      showHeader: true,
      activeRowKey: null,
      linkColumn: '',
      height: 0,
      wrapLine: false,
    }
  )

  const emit = defineEmits<{
    (e: 'reachEnd'): void
    (e: 'tsCellClick', row: TableData, rowIndex: number): void
    (e: 'rowClick', row: TableData, rowIndex: number): void
    (e: 'columnLinkClick', columnName: string, value: string): void
  }>()

  const rootEl = ref<HTMLElement | null>(null)
  const gridRef = ref<VxeGridInstance | null>(null)
  const { height: measuredHeight } = useElementSize(rootEl)

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
    // Fixed height is required for equal-height + showOverflow truncate mode.
    // Omit height when wrapping so VXE can size rows from content.
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
      // Virtual Y needs an explicit pass to measure wrapped cell heights.
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
    // Off while wrapping: off-screen columns would not contribute to row-height measure.
    enabled: props.columnMode === 'separate' && !props.wrapLine,
    gt: 0,
  }))

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

  function buildMergedMessage(row: TableData, fields: string[]): string {
    const showKeys = props.columnMode === 'merged-with-keys'
    return fields
      .map((key) => (showKeys ? `${key}: ${getCellString(row[key])}` : getCellString(row[key])))
      .filter(Boolean)
      .join(' ')
  }

  const visibleFieldNames = computed(() => {
    const tsName = props.tsColumn?.name
    let names = props.displayedColumns.length > 0 ? props.displayedColumns.slice() : props.columns.map((c) => c.name)
    if (tsName) {
      names = names.filter((n) => n !== tsName)
    }
    return names
  })

  /**
   * Pre-stringify cell values so Vxe never renders raw objects
   * (TypeError: Cannot convert object to primitive value).
   */
  const tableData = computed(() => {
    const merge = props.columnMode !== 'separate'
    const fields = visibleFieldNames.value
    const tsName = props.tsColumn?.name

    return props.data.map((record, index) => {
      const rowIndex = typeof record.__rowIndex === 'number' ? record.__rowIndex : index
      if (merge) {
        const out: TableData = { __rowIndex: rowIndex }
        if (tsName) {
          out[tsName] = getCellString(record[tsName])
        }
        out.__merged_message = buildMergedMessage(record, fields)
        return out
      }

      const out: TableData = { __rowIndex: rowIndex }
      if (tsName) {
        out[tsName] = getCellString(record[tsName])
      }
      fields.forEach((name) => {
        out[name] = getCellString(record[name])
      })
      return out
    })
  })

  /**
   * Use minWidth:'auto' (not width:'auto') so VXE fit can grow columns when
   * content sum is narrower than the viewport.
   * Separate mode soft-caps columns at COLUMN_MAX_WIDTH (except the last, so
   * fit leftover can still fill the viewport). Merged mode has no maxWidth.
   */
  function contentColumn(field: string, title: string, extra: Record<string, unknown> = {}) {
    return {
      field,
      title,
      minWidth: 'auto',
      showOverflow: props.wrapLine ? false : 'title',
      ...extra,
    }
  }

  const vxeColumns = computed(() => {
    const cols: Record<string, unknown>[] = []
    const tsName = props.tsColumn?.name
    const merge = props.columnMode !== 'separate'

    if (merge) {
      if (tsName) {
        cols.push(contentColumn(tsName, tsName))
      }
      cols.push(contentColumn('__merged_message', 'message'))
      return cols
    }

    const separateFields: { field: string; title: string; extra?: Record<string, unknown> }[] = []
    if (tsName) {
      separateFields.push({ field: tsName, title: tsName })
    }
    visibleFieldNames.value.forEach((name) => {
      const meta = props.columns.find((c) => c.name === name)
      const isLink = props.linkColumn && name === props.linkColumn
      separateFields.push({
        field: name,
        title: meta?.title || name,
        extra: isLink ? { className: 'logs-vxe-link-col' } : undefined,
      })
    })

    separateFields.forEach((item, index) => {
      const isLast = index === separateFields.length - 1
      cols.push(
        contentColumn(item.field, item.title, {
          ...(item.extra || {}),
          // Last column stays uncapped so VXE fit can absorb leftover width.
          ...(isLast ? {} : { maxWidth: COLUMN_MAX_WIDTH }),
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

  // Refresh layout when columns / data / wrap mode change.
  watch(
    () =>
      [
        props.columnMode,
        props.displayedColumns.join(','),
        props.columns.map((c) => c.name).join(','),
        props.data.length,
        props.wrapLine,
      ] as const,
    () => {
      recalculateColumnWidths()
    },
    { immediate: true }
  )

  function onCellClick({ row, column }: { row: TableData; column: { field?: string } }) {
    const rowIndex = typeof row.__rowIndex === 'number' ? row.__rowIndex : -1
    const original = rowIndex >= 0 ? props.data[rowIndex] || row : row
    const field = column?.field
    if (field && props.tsColumn?.name && field === props.tsColumn.name) {
      emit('tsCellClick', original, rowIndex)
      return
    }
    if (field && props.linkColumn && field === props.linkColumn) {
      emit('columnLinkClick', field, getCellString(original[field]))
      return
    }
    emit('rowClick', original, rowIndex)
  }
</script>

<style lang="less" scoped>
  .logs-vxe-table {
    height: 100%;
    width: 100%;
    min-height: 0;
    overflow: hidden;

    :deep(.vxe-table),
    :deep(.vxe-grid) {
      --vxe-ui-table-header-background-color: var(--color-fill-2, #f2f3f5);
      --vxe-ui-table-row-hover-background-color: var(--color-fill-1, #f7f8fa);
      --vxe-ui-font-color: var(--color-text-1, #1d2129);
      --vxe-ui-table-border-color: var(--color-border-2, #e5e6eb);
      font-size: 12px;
    }

    :deep(.logs-vxe-row-active) {
      background-color: var(--color-primary-light-1, #e8f3ff) !important;
    }

    :deep(.logs-vxe-link-col .vxe-cell) {
      color: var(--color-primary-6, #165dff);
      cursor: pointer;
    }

    &--wrap {
      :deep(.vxe-body--column .vxe-cell) {
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.4;
      }
    }
  }
</style>
