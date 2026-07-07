<template lang="pug">
.data-table-container(ref="tableContainer")
  a-table(
    :key="columnMode"
    v-bind="tablePassThroughProps"
    row-key="__rowIndex"
    :data="processedData"
    :pagination="false"
    :bordered="false"
    :stripe="false"
    :class="tableClassesDynamic"
  )
    template(#empty)
      a-empty.data-table-empty(description="No data")
        template(#image)
          img.data-table-empty-icon(alt="" :src="tableEmptyIcon")
    template(#loading)
      a-spin(dot)

    // Define columns using the straightforward approach
    template(#columns)
      template(v-for="col in processedColumns" :key="col.name")
        a-table-column(
          :width="col.width"
          :ellipsis="true"
          :data-index="col.name"
          :title="col.title || col.name"
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
                // Special rendering for merged column
                span.entity-field(v-for="field in record.Merged_Column" :key="field[0]")
                  span(v-if="showKeys" style="color: var(--gpt-text-muted)")
                    | {{ field[0] }}:
                  | {{ field[1] }}
                  span.cell-actions-inline(v-if="(!props.wrapLine && isCellExpandable(field[1])) || showContextMenu")
                    a-popover(
                      v-if="!props.wrapLine && isCellExpandable(field[1])"
                      trigger="click"
                      position="top"
                      :popup-visible="isExpandActive(record, field[0])"
                      @popupVisibleChange="(visible) => handleExpandVisibleChange(getCellExpandKey(record, field[0]), visible)"
                    )
                      template(#content)
                        .cell-popover-content {{ getCellString(field[1]) }}
                      span.cell-action-icon(:class="{ active: isExpandActive(record, field[0]) }" @click.stop)
                        icon-up(v-if="isExpandActive(record, field[0])" :size="12")
                        icon-down(v-else :size="12")
                    span.cell-action-icon(
                      v-if="showContextMenu"
                      :class="{ active: isContextMenuActive(record, field[0]) }"
                      @click="(event) => handleContextMenu(record, field[0], event)"
                    )
                      svg.icon-12
                        use(href="#menu")
              template(v-else-if="isTimeColumn(col)")
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
                span.cell-actions-inline(v-if="showContextMenu")
                  span.cell-action-icon(
                    :class="{ active: isContextMenuActive(record, col.name) }"
                    @click="(event) => handleContextMenu(record, col.name, event)"
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
  })

  const attrs = useAttrs()
  const attrsRecord = attrs as Record<string, any>
  const hasVirtualListProps = computed(() => !!attrsRecord['virtual-list-props'])
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

  // Dynamic table classes computation
  const tableClassesDynamic = computed(() => {
    const baseClasses = {
      'wrap_table': props.wrapLine,
      'single_column': props.columnMode !== 'separate',
      'multiple_column': props.columnMode === 'separate',
      'virtual-list-active': hasVirtualListProps.value, // Add class when virtual list is active
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
  const { width: tableWidth } = useElementSize(tableContainer)

  // Timestamp utilities
  function isTimeColumn(column: ColumnType) {
    return dateTypes.indexOf(column.data_type) > -1
  }

  // Column width calculation rules:
  //
  // Both virtual-list and non-virtual-list modes SHARE the content measurement:
  //   - Sample up to MAX_CONTENT_SAMPLE_ROWS rows per column.
  //   - Use the maximum stringified cell length as the column's content weight.
  //
  // They DIFFER in how weights are turned into pixel widths:
  //   - Non-virtual-list: each column gets a base width derived from
  //     max(label.length, contentMaxLen) * 8 + 40 (clamped 150~600). The primary
  //     timestamp column stays fixed at 230px. Remaining columns are scaled up
  //     together to fill the container width. Horizontal scrolling is allowed
  //     when the total width exceeds the container.
  //   - Virtual-list: widths are distributed proportionally by content weight so
  //     the total exactly matches the container width. Horizontal scrolling is
  //     intentionally disabled (overflow-x: hidden) to keep the sticky header
  //     and virtual body aligned; the vertical scrollbar already narrows the
  //     body area, so a separate horizontal scrollbar would cause misalignment.
  //
  // We do NOT fully unify the distribution strategy because estimating the
  // exact scrollbar width across platforms/macOS overlay scrollbars is fragile.
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

  function getColumnWidth(column: ColumnType, rows: TableData[]) {
    if (props.tsColumn?.name === column.name || isTimeColumn(column)) {
      return 230
    }

    const label = String(column.title || column.name)
    const contentMaxLen = getColumnContentMaxLength(column.name, rows)
    const charLen = Math.max(label.length, contentMaxLen)
    return Math.max(150, Math.min(600, charLen * 8 + 40))
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

  function getVirtualListColumnWidth(currLen: number, totalLen: number, containerWidth: number) {
    let width = (Math.floor((currLen / totalLen) * 1000) / 1000) * containerWidth
    width = Math.max(150, width)
    width = Math.min(600, width)
    return width
  }

  // Column width state management
  const columnWidths = ref<Record<string, number>>({})
  const prevContainerWidth = ref<number>(0)
  const lastCalculatedColumnsKey = ref<string>('')

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

  function getColumnsKey(columns: ColumnType[]): string {
    return columns.map((c) => c.name).join(',')
  }

  // Non-virtual-list width distribution: compute a base width for every column
  // (timestamp fixed at 230px), then scale non-timestamp columns up so the sum
  // matches the container width. This guarantees the table fills the container
  // horizontally while still allowing horizontal scrolling if the user later
  // resizes a column wider.
  function calculateColumnWidths(
    columns: ColumnType[],
    rows: TableData[],
    containerWidth: number
  ): Record<string, number> {
    const widths: Record<string, number> = {}
    let fixedColumnName: string | null = null

    columns.forEach((column) => {
      widths[column.name] = getColumnWidth(column, rows)
      // Keep the primary timestamp column at its base width initially;
      // scale the remaining columns to fill the container.
      if (props.tsColumn?.name === column.name) {
        fixedColumnName = column.name
      }
    })

    const total = Object.values(widths).reduce((sum, width) => sum + width, 0)

    if (containerWidth > 0 && total < containerWidth) {
      if (fixedColumnName) {
        const fixedWidth = widths[fixedColumnName]
        const remaining = containerWidth - fixedWidth
        const othersTotal = total - fixedWidth

        if (othersTotal > 0 && remaining > 0) {
          const scale = remaining / othersTotal
          Object.keys(widths).forEach((key) => {
            if (key !== fixedColumnName) {
              widths[key] = Math.max(100, Math.round(widths[key] * scale))
            }
          })
        }
      } else {
        const scale = containerWidth / total
        Object.keys(widths).forEach((key) => {
          widths[key] = Math.max(100, Math.round(widths[key] * scale))
        })
      }
    }

    return widths
  }

  // When the container is resized, keep the relative proportions between
  // columns by scaling all current widths by the same factor.
  function scaleColumnWidths(
    widths: Record<string, number>,
    prevWidth: number,
    newWidth: number
  ): Record<string, number> {
    if (prevWidth <= 0 || newWidth <= 0 || prevWidth === newWidth) {
      return { ...widths }
    }

    const scale = newWidth / prevWidth
    const scaled: Record<string, number> = {}

    Object.keys(widths).forEach((key) => {
      scaled[key] = Math.max(100, Math.round(widths[key] * scale))
    })

    return scaled
  }

  watch(
    [visibleColumns, tableWidth],
    ([columns, width]) => {
      if (width <= 0 || columns.length === 0) {
        prevContainerWidth.value = width
        return
      }

      const key = getColumnsKey(columns)
      if (key !== lastCalculatedColumnsKey.value) {
        columnWidths.value = calculateColumnWidths(columns, props.data, width)
        lastCalculatedColumnsKey.value = key
      } else if (width !== prevContainerWidth.value && prevContainerWidth.value > 0) {
        columnWidths.value = scaleColumnWidths(columnWidths.value, prevContainerWidth.value, width)
      }

      prevContainerWidth.value = width
    },
    { immediate: true }
  )

  function getSemanticThClass(column: ColumnType) {
    return column.semantic_type?.toLowerCase()
  }

  // Computed columns based on mode
  const processedColumns = computed(() => {
    if (!mergeColumn.value) {
      // Separate mode: use visible columns with managed widths
      if (hasVirtualListProps.value) {
        // Virtual list uses proportional distribution based on sampled content
        // lengths. It intentionally does not allow horizontal scrolling, so the
        // layout is handled together with the CSS that hides overflow-x.
        if (!tableWidth.value || visibleColumns.value.length === 0) {
          return visibleColumns.value.map((column) => ({ ...column }))
        }

        const contentLengths = getColumnContentLengths(visibleColumns.value, props.data)
        const totalContentLen = Object.values(contentLengths).reduce((acc, len) => acc + len, 0)
        const maxLenName = findMaxLenCol(visibleColumns.value, props.data)

        return visibleColumns.value.map((column) => {
          let width: number | undefined

          if (column.name !== maxLenName) {
            if (column.name === props.tsColumn?.name) {
              width = 230
            } else {
              width = getVirtualListColumnWidth(contentLengths[column.name] || 0, totalContentLen, tableWidth.value)
            }
          }

          return {
            ...column,
            width,
          }
        })
      }

      return visibleColumns.value.map((column) => ({
        ...column,
        width: columnWidths.value[column.name] ?? getColumnWidth(column, props.data),
      }))
    }

    // Merged mode: create timestamp + merged column
    const arr = []
    if (props.tsColumn) {
      arr.push({
        name: props.tsColumn.name,
        title: props.tsColumn.name,
        data_type: props.tsColumn.data_type || 'timestamp',
        width: columnWidths.value[props.tsColumn.name] ?? 220,
      } as ColumnType)
    }
    arr.push({
      name: 'Merged_Column',
      title: 'Data',
      data_type: 'merged',
    } as ColumnType)
    return arr
  })

  const tableHorizontalScrollX = computed(() => {
    if (mergeColumn.value || hasVirtualListProps.value) {
      return undefined
    }

    const total = processedColumns.value.reduce((sum, column) => sum + Number(column.width || 0), 0)
    return total > 0 ? total : undefined
  })

  const tablePassThroughProps = computed(() => {
    const { scroll: attrsScroll, ...restAttrs } = attrsRecord
    const extraScroll = typeof attrsScroll === 'object' && attrsScroll ? attrsScroll : {}
    const scroll = {
      ...(hasVirtualListProps.value ? {} : { y: '100%' }),
      ...extraScroll,
    }

    if (scroll.x === undefined && tableHorizontalScrollX.value !== undefined) {
      scroll.x = tableHorizontalScrollX.value
    }

    return {
      loading: false,
      size: 'medium',
      ...restAttrs,
      scroll,
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
    overflow: hidden; // Prevent container overflow

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
  }

  :deep(.arco-table-tr-empty .arco-table-td) {
    display: flex;
    justify-content: center;
    align-items: center;
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
    right: 2px;
    top: 4px;
    display: none;
    align-items: center;
    gap: 6px;
    z-index: 10;
  }

  :deep(.arco-table-cell:hover) .cell-actions,
  .cell-actions:has(.cell-action-icon.active) {
    display: flex;
  }

  // Inline action group (merged column + timestamp cells)
  .cell-actions-inline {
    display: none;
    align-items: center;
    gap: 6px;
    margin-left: 4px;
    vertical-align: middle;
  }

  :deep(.arco-table-cell:hover) .cell-actions-inline,
  .entity-field:hover .cell-actions-inline,
  .cell-actions-inline:has(.cell-action-icon.active) {
    display: inline-flex;
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
    cursor: default;
  }
  .cell-content {
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    word-break: normal;
    user-select: text;
  }
  // Show cell action buttons on hover. The popover itself is body-mounted and
  // closed on scroll, so table overflow rules do not clip it.
  :deep(.arco-table-td:hover) {
    overflow: visible;
  }

  :deep(.arco-table-td:hover .arco-table-td-content) {
    overflow: visible;
  }

  // Merged column styling
  .entity-field {
    margin-right: 10px;
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
  // Table layout differences between virtual-list and non-virtual-list:
  //
  // Non-virtual-list: the table element must always be at least as wide as the
  // container (min-width: 100%). When columns are resized wider than the
  // container, Arco's scroll.x makes the table grow and a horizontal scrollbar
  // appears. This is desired for the query-result table.
  //
  // Virtual-list: horizontal scrolling is intentionally disabled because the
  // vertical scrollbar already narrows the body area; a horizontal scrollbar
  // would cause the sticky header and virtual body to misalign. The column
  // widths are distributed proportionally so the table stays at 100% container
  // width and overflow-x is hidden. See the column-width rules above for how
  // content weights are computed.
  .multiple_column:not(.virtual-list-active) :deep(.arco-table-element) {
    min-width: 100% !important;
  }

  .multiple_column.virtual-list-active {
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
      }
    }
  }

  .multiple_column {
    width: 100%;
  }

  :deep(.arco-table-th) {
    position: relative;
    overflow: hidden;
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
  .multiple_column {
    :deep(.arco-table-td-content) {
      position: relative;
      width: 100%;
      padding-right: 15px;
    }

    :deep(.arco-table-td-content:has(.cell-actions)) {
      padding-right: 40px;
    }
  }
  :deep(.arco-table-size-mini).multiple_column {
    :deep(.arco-table-td-content) {
      padding-right: 12px;
    }

    :deep(.arco-table-td-content:has(.cell-actions)) {
      padding-right: 36px;
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
