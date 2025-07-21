<template lang="pug">
.data-table-container(ref="tableContainer")
  a-table(
    :key="columnMode"
    row-key="__rowIndex"
    :data="processedData"
    :loading="loading"
    :pagination="false"
    :bordered="false"
    :stripe="false"
    :class="tableClassesDynamic"
    :scroll="scrollConfig"
    :size="size"
    :virtual-list-props="virtualListProps"
    :row-selection="rowSelection"
  )
    template(#empty)
      a-empty(description="No data")
    template(#loading)
      a-spin(dot)

    // Define columns using the straightforward approach
    template(#columns)
      template(v-for="col in processedColumns" :key="col.name")
        a-table-column(:width="col.width" :data-index="col.name" :title="col.title || col.name")
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
                  a-space(size="mini" :style="{ cursor: 'pointer' }" @click="changeTsView")
                    svg.icon-12
                      use(href="#time-index")
                    | {{ col.name }}
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
                  span(v-if="showKeys" style="color: var(--color-text-3)")
                    | {{ field[0] }}:
                  | {{ field[1] }}
                  svg.td-config-icon(
                    v-if="showContextMenu"
                    @click="(event) => handleContextMenu(record, field[0], event)"
                  )
                    use(href="#menu")
              template(v-else-if="isTimeColumn(col)")
                a-tooltip(
                  placement="top"
                  :content="tsViewStr ? $t('dashboard.showTimestamp') : $t('dashboard.formatTimestamp')"
                )
                  span(style="cursor: pointer" @click="changeTsView") {{ renderTs(record, col.name) }}
                svg.td-config-icon(
                  v-if="showContextMenu"
                  @click="(event) => handleContextMenu(record, col.name, event)"
                )
                  use(href="#menu")
              template(v-else)
                span {{ record[col.name] }}
                svg.td-config-icon(
                  v-if="showContextMenu"
                  @click="(event) => handleContextMenu(record, col.name, event)"
                )
                  use(href="#menu")

// Context menu
a-dropdown#td-context(
  v-model:popup-visible="contextMenuVisible"
  trigger="contextMenu"
  :style="{ position: 'fixed', top: `${contextMenuPosition.y}px`, left: `${contextMenuPosition.x}px`, zIndex: 9999 }"
  @clickoutside="hideContextMenu"
  @select="handleMenuClick"
) 
  template(#content)
    a-doption(value="copy") Copy Field Value
    a-dsubmenu(trigger="hover") Filter
      template(#content)
        a-doption(v-for="op in filterOptions" :key="op" :value="`filter_${op}`") {{ op }} value
</template>

<script setup lang="ts">
  import { ref, computed, shallowRef } from 'vue'
  import { useElementSize } from '@vueuse/core'
  import dayjs from 'dayjs'
  import convertTimestampToMilliseconds from '@/utils/datetime'

  interface TSColumn {
    name: string
    data_type?: string
  }

  interface Column {
    name: string
    data_type: string
    title?: string
  }

  interface TableData {
    [key: string]: any
  }

  interface Props {
    // Data
    data: TableData[]
    columns: Column[]
    loading?: boolean

    // Table configuration
    size?: 'small' | 'mini' | 'medium' | 'large'
    class?: string | object
    scrollConfig?: object
    virtualListProps?: object
    rowSelection?: object

    // Column mode handling
    columnMode?: 'separate' | 'merged' | 'merged-with-keys'
    displayedColumns?: string[]

    // Timestamp handling
    tsColumn?: TSColumn | null

    // Context menu
    showContextMenu?: boolean

    // Table styling options for dynamic classes
    wrapLine?: boolean
    compact?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {
    data: () => [],
    columns: () => [],
    loading: false,
    size: 'medium',
    class: '',
    scrollConfig: () => ({ y: '100%' }),
    virtualListProps: undefined,
    rowSelection: undefined,
    columnMode: 'separate',
    displayedColumns: () => [],
    tsColumn: null,
    showContextMenu: true,
    wrapLine: false,
    compact: false,
  })

  const emit = defineEmits(['filterConditionAdd', 'rowSelect'])

  // Timestamp display state
  const tsViewStr = ref(true) // true for formatted, false for raw timestamp

  // Column mode logic
  const mergeColumn = computed(() => props.columnMode !== 'separate')
  const showKeys = computed(() => props.columnMode === 'merged-with-keys')

  // Dynamic table classes computation
  const tableClassesDynamic = computed(() => {
    const baseClasses = {
      'wrap_table': props.wrapLine,
      'single_column': props.columnMode !== 'separate',
      'multiple_column': props.columnMode === 'separate',
      'compact': props.compact,
      'virtual-list-active': !!props.virtualListProps, // Add class when virtual list is active
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
  const { width: tableWidth, height: tableHeight } = useElementSize(tableContainer)

  // Timestamp utilities
  function isTimeColumn(column: Column) {
    return column.data_type.toLowerCase().includes('timestamp')
  }

  // Width calculation utilities
  function findMaxLenCol(row: any) {
    let max = 0
    let maxName = ''
    Object.keys(row).forEach((k) => {
      if (String(row[k]).length > max) {
        max = String(row[k]).length
        maxName = k
      }
    })
    return maxName
  }

  function getWidth(currLen: number, totalLen: number, containerWidth: number) {
    let width = (Math.floor((currLen / totalLen) * 1000) / 1000) * containerWidth
    width = Math.max(150, width)
    width = Math.min(600, width)
    return width
  }

  // Computed columns based on mode
  const processedColumns = computed(() => {
    if (!mergeColumn.value) {
      // Separate mode: filter and arrange columns
      let tmpColumns = props.columns.slice()
      if (props.tsColumn) {
        tmpColumns = tmpColumns.filter((c) => c.name !== props.tsColumn.name)
        tmpColumns.unshift({
          name: props.tsColumn.name,
          data_type: props.tsColumn.data_type || 'timestamp',
          title: props.tsColumn.name,
        } as Column)
      }
      tmpColumns = tmpColumns.filter((c) => props.displayedColumns?.indexOf(c.name) > -1)

      // Only calculate widths when virtual list is active
      if (props.virtualListProps) {
        // Virtual list mode: calculate widths based on content
        const row = props.data[0]
        if (!row || !tableWidth.value) {
          return tmpColumns.map((column) => ({
            ...column,
          }))
        }

        const totalStrLen = Object.keys(row).reduce((acc, curr) => {
          acc += String(row[curr]).length
          return acc
        }, 0)

        const maxLenName = findMaxLenCol(row)

        return tmpColumns.map((column) => {
          let width

          if (row && column.name !== maxLenName) {
            if (column.name === props.tsColumn?.name) {
              width = 230
            } else {
              width = getWidth(String(row[column.name]).length, totalStrLen, tableWidth.value)
            }
          }

          return {
            ...column,
            width,
          }
        })
      }

      // Non-virtual list mode: let CSS handle all widths
      return tmpColumns.map((column) => ({
        ...column,
      }))
    }

    // Merged mode: create timestamp + merged column
    const arr = []
    if (props.tsColumn) {
      arr.push({
        name: props.tsColumn.name,
        title: props.tsColumn.name,
        data_type: props.tsColumn.data_type || 'timestamp',
        width: 220,
      } as Column)
    }
    arr.push({
      name: 'Merged_Column',
      title: 'Data',
      data_type: 'merged',
      width: 'auto',
    } as Column)
    return arr
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

  function renderTs(record: any, columnName: string) {
    const timestamp = record[columnName]
    if (!timestamp) return timestamp

    if (tsViewStr.value) {
      // Show formatted timestamp
      const column = processedColumns.value.find((col) => col.name === columnName)
      if (!column) return timestamp

      // Use universal conversion function
      const ms = convertTimestampToMilliseconds(timestamp, column.data_type)
      return dayjs(ms).format('YYYY-MM-DD HH:mm:ss.SSS')
    }

    // Show raw timestamp number
    return timestamp
  }

  function getRenderedValue(record: any, column: Column) {
    if (isTimeColumn(column)) {
      return renderTs(record, column.name)
    }
    return record[column.name]
  }

  // No pagination or column management - pure table functionality

  // Context menu functionality
  const contextMenuVisible = ref(false)
  const contextMenuPosition = ref({ x: 0, y: 0 })
  const filterOptions = shallowRef([])
  const triggerCell = ref()

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
      if (isTimeColumn(column)) {
        filterOptions.value = ['>=', '<=']
      } else {
        filterOptions.value = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE']
      }
    }

    contextMenuPosition.value = { x: rect.left, y: rect.y }
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
    height: 100%; // Always fill parent height
    overflow: hidden; // Prevent container overflow

    // Table wrapper height management
    :deep(.arco-table-wrapper) {
      height: 100%;
    }
  }

  :deep(.arco-table-tr-empty .arco-table-td) {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  // Context menu positioning
  #td-context {
    position: absolute;
    z-index: 999999;
  }

  // Menu icon styling
  .td-config-icon {
    margin-left: 3px;
    cursor: pointer;
    visibility: hidden;
    width: 12px;
    height: 12px;
    color: var(--color-primary);
  }

  // Show menu icon on hover when context menu is enabled
  :deep(.arco-table-cell:hover .cell-content .td-config-icon) {
    visibility: visible;
  }

  // Merged column styling
  .entity-field {
    margin-right: 10px;
  }

  .entity-field:hover .td-config-icon {
    visibility: visible;
  }

  :deep(.arco-table-th) {
    background-color: var(--color-fill-2);
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
  #log-table-container {
    position: relative;
  }
  :deep(.arco-drawer-container) {
    left: auto;
    width: 800px;
    overflow: hidden;
  }
  .clickable {
    cursor: pointer;
  }
  .builder-type .clickable {
    cursor: pointer;
  }
  :deep(.arco-drawer) {
    border: 1px solid var(--color-neutral-3);
  }
  .multiple_column {
    :deep(.arco-virtual-list > .arco-table-element) {
      width: 100%;
    }
    width: 100%;
    :deep(.arco-table-td-content) {
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
  :deep(.arco-table-element) {
    font-family: 'Roboto Mono', monospace;
  }

  :deep(.arco-table-td),
  :deep(.arco-table-th) {
    white-space: nowrap;
  }
  .wrap_table :deep(.arco-table-td),
  .wrap_table :deep(.arco-table-th) {
    white-space: wrap;
  }
  :deep(.arco-table-size-medium .arco-table-cell) {
    padding: 7px 10px;
  }
  .entity-field {
    margin-right: 10px;
  }

  #td-context {
    position: absolute;
    z-index: 999999;
  }
  .td-config-icon {
    margin-left: 3px;
    cursor: pointer;
    visibility: hidden;
    width: 12px;
    height: 12px;
    color: var(--color-primary);
  }
  .multiple_column {
    :deep(.arco-table-td-content) {
      position: relative;
      width: auto;
      padding-right: 15px;
    }
    .td-config-icon {
      position: absolute;
      right: 0;
      top: 5px;
    }
  }
  .compact.multiple_column {
    :deep(.arco-table-td-content) {
      padding-right: 12px;
    }
    .td-config-icon {
      top: 4px;
    }
  }
  .compact .td-config-icon {
    width: 9px;
    height: 9px;
  }
  .multiple_column :deep(.arco-table-cell:hover) .td-config-icon {
    visibility: visible;
  }
  .single_column .entity-field:hover .td-config-icon {
    visibility: visible;
  }
  .builder-type.multiple_column :deep(.arco-table-cell:hover) .td-config-icon {
    visibility: visible;
  }
  .builder-type.single_column .entity-field:hover .td-config-icon {
    visibility: visible;
  }
</style>
