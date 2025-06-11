<template lang="pug">
a-card(:bordered="false")
  template(#title)
    .results-header
      span Results
      span.results-count(v-if="totalResults > 0") 
        | ({{ totalResults }} {{ totalResults === 1 ? 'record' : 'records' }}
        template(v-if="totalResults > pageSize")
          | , showing {{ Math.min((currentPage - 1) * pageSize + 1, totalResults) }}-{{ Math.min(currentPage * pageSize, totalResults) }}
        | )
  template(#extra)
    a-space
      a-pagination(
        v-if="totalResults > pageSize"
        v-model:current="currentPage"
        v-model:page-size="pageSize"
        size="small"
        simple
        :total="totalResults"
        :show-total="false"
        :show-jumper="false"
        :show-page-size="true"
        :page-size-options="[10, 20, 50, 100]"
        @change="handlePageChange"
        @page-size-change="handlePageSizeChange"
      )
      a-trigger(v-if="columns.length" trigger="click" :unmount-on-close="false")
        a-button(type="text" style="color: var(--color-text-2)")
          template(#icon)
            icon-settings
          | Columns
        template(#content)
          a-card(style="padding: 10px; min-width: 200px; max-height: 500px; overflow-y: auto")
            .column-controls
              a-space(direction="vertical" size="small")
                a-space
                  a-button(type="text" size="mini" @click="selectAllColumns") Select All
                  a-button(type="text" size="mini" @click="deselectAllColumns") Deselect All
                a-checkbox-group(v-model="displayedColumns" direction="vertical")
                  a-checkbox(v-for="column in columns" :key="column.name" :value="column.name")
                    | {{ column.name }}
  .table-container
    a-table(
      :data="results"
      :loading="loading"
      :pagination="false"
      :bordered="false"
      :stripe="false"
      :class="{ trace_table: true, multiple_column: true }"
      :scroll="{ y: 1400 }"
    )
      template(#empty)
        a-empty(description="No data")
      template(#loading)
        a-spin(dot)
      template(#columns)
        a-table-column(
          v-for="col in visibleColumns"
          :key="col.name"
          :title="col.name"
          :data-index="col.name"
        )
          template(v-if="isTimeColumn(col)" #title)
            a-tooltip(placement="top" :content="tsViewStr ? 'Show raw timestamp' : 'Format timestamp'")
              a-space(size="mini" :style="{ cursor: 'pointer' }" @click="changeTsView")
                svg.icon-12
                  use(href="#time-index")
                | {{ col.name }}
          template(#cell="{ record }")
            template(v-if="col.name === 'traceid' || col.name === 'trace_id'")
              router-link(
                :to="{ name: 'dashboard-TraceDetail', params: { id: record[col.name] }, query: { table: props.tableName } }"
              ) {{ record[col.name] }}
              svg.td-config-icon(
                v-if="sqlMode === 'builder'"
                @click="(event) => handleContextMenu(record, col.name, event)"
              )
                use(href="#menu")
            template(v-else-if="isTimeColumn(col)")
              span(style="cursor: pointer") {{ renderTs(record, col.name) }}
              svg.td-config-icon(
                v-if="sqlMode === 'builder'"
                @click="(event) => handleContextMenu(record, col.name, event)"
              )
                use(href="#menu")
            template(v-else)
              span {{ record[col.name] }}
              svg.td-config-icon(
                v-if="sqlMode === 'builder'"
                @click="(event) => handleContextMenu(record, col.name, event)"
              )
                use(href="#menu")

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
  import { ref, computed, watch, shallowRef } from 'vue'
  import { useLocalStorage } from '@vueuse/core'
  import { IconSettings } from '@arco-design/web-vue/es/icon'
  import dayjs from 'dayjs'
  import type { PropType } from 'vue'

  interface Column {
    name: string
    data_type: string
  }

  interface TableData {
    [key: string]: any
  }

  const props = defineProps({
    data: {
      type: Array as PropType<TableData[]>,
      default: () => [],
    },
    columns: {
      type: Array as PropType<Column[]>,
      default: () => [],
    },
    loading: {
      type: Boolean,
      default: false,
    },
    tableName: {
      type: String,
      default: '',
    },
    sqlMode: {
      type: String,
      default: 'builder',
    },
  })

  const emit = defineEmits(['filterConditionAdd'])

  // Column visibility state with localStorage persistence
  const displayedColumns = useLocalStorage<string[]>('trace-displayed-columns', [])

  // Default columns to show for traces (when no selection is made)
  const defaultTraceColumns = ['trace_id', 'service_name', 'span_name', 'timestamp', 'duration_nano']

  // Pagination state
  const currentPage = ref(1)
  const pageSize = ref(20)

  // Timestamp display state
  const tsViewStr = ref(true) // true for formatted, false for raw timestamp

  // Computed paginated results
  const results = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    return props.data.slice(start, end)
  })

  // Total count for pagination
  const totalResults = computed(() => props.data.length)

  // Computed visible columns based on selection
  const visibleColumns = computed(() => {
    let columnsToShow = []

    if (displayedColumns.value.length === 0) {
      // Show default trace columns if available, otherwise show all
      const availableDefaults = props.columns.filter(
        (col) => defaultTraceColumns.includes(col.name.toLowerCase()) || defaultTraceColumns.includes(col.name)
      )
      columnsToShow = availableDefaults.length > 0 ? availableDefaults : props.columns
    } else {
      columnsToShow = props.columns.filter((col) => displayedColumns.value.includes(col.name))
    }

    // Sort columns to ensure trace_id is always first
    return columnsToShow.sort((a, b) => {
      const isATraceId = a.name === 'trace_id' || a.name === 'traceid'
      const isBTraceId = b.name === 'trace_id' || b.name === 'traceid'

      if (isATraceId && !isBTraceId) return -1
      if (!isATraceId && isBTraceId) return 1

      // Keep original order for other columns
      return 0
    })
  })

  // Timestamp utilities
  function isTimeColumn(column: Column) {
    return column.data_type.toLowerCase().includes('timestamp')
  }

  function changeTsView() {
    tsViewStr.value = !tsViewStr.value
  }

  function renderTs(record: TableData, columnName: string) {
    if (tsViewStr.value) {
      // Format timestamp as readable date
      const timestamp = record[columnName]
      if (timestamp) {
        // Handle different timestamp formats (nanoseconds, microseconds, milliseconds)
        let ms = timestamp
        if (typeof timestamp === 'string') {
          ms = parseInt(timestamp, 10)
        }
        // Convert to milliseconds if it's in nanoseconds or microseconds
        if (ms > 1000000000000000) {
          // nanoseconds
          ms /= 1000000
        } else if (ms > 1000000000000) {
          // microseconds
          ms /= 1000
        }
        return dayjs(ms).format('YYYY-MM-DD HH:mm:ss.SSS')
      }
      return timestamp
    }
    return record[columnName]
  }

  // Column selection functions
  function selectAllColumns() {
    displayedColumns.value = props.columns.map((col) => col.name)
  }

  function deselectAllColumns() {
    displayedColumns.value = []
  }

  // Watch for column changes and update displayed columns if empty
  watch(
    () => props.columns,
    (newColumns) => {
      if (displayedColumns.value.length === 0 && newColumns.length > 0) {
        // Set default selection to common trace fields if they exist
        const defaultColumns = newColumns
          .filter(
            (col) => defaultTraceColumns.includes(col.name.toLowerCase()) || defaultTraceColumns.includes(col.name)
          )
          .map((col) => col.name)

        if (defaultColumns.length > 0) {
          displayedColumns.value = defaultColumns
        } else {
          displayedColumns.value = newColumns.map((col) => col.name)
        }
      }
    }
  )

  // Pagination handlers
  function handlePageChange(page: number) {
    currentPage.value = page
  }

  function handlePageSizeChange(size: number) {
    pageSize.value = size
    currentPage.value = 1 // Reset to first page when page size changes
  }

  // Context menu functionality
  const contextMenuVisible = ref(false)
  const contextMenuPosition = ref({ x: 0, y: 0 })
  const filterOptions = shallowRef([])
  const triggerCell = ref()

  function handleContextMenu(record: TableData, columnName: string, event: Event) {
    if (props.sqlMode !== 'builder') {
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
        // Show success message
        console.log('Copied to clipboard:', record[columnName])
      } catch (error) {
        console.error('Failed to copy to clipboard:', error)
      }
    } else if (action.startsWith('filter')) {
      const operator = action.split('_')[1]
      // Emit filter condition to parent
      emit('filterConditionAdd', columnName, operator, record[columnName])
    }
    hideContextMenu()
  }

  // Reset pagination when data changes
  watch(
    () => props.data,
    () => {
      currentPage.value = 1
    }
  )
</script>

<style lang="less" scoped>
  .results-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: normal;
  }

  .results-count {
    color: var(--color-text-3);
    font-size: 12px;
    font-weight: normal;
  }

  .column-controls {
    min-width: 200px;
  }

  // Table container for flexible height
  .table-container {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  // Context menu positioning
  #td-context {
    position: absolute;
    z-index: 999999;
  }

  // Menu icon styling (matches logs TableData)
  .td-config-icon {
    margin-left: 3px;
    cursor: pointer;
    visibility: hidden;
    width: 12px;
    height: 12px;
    color: var(--color-primary);
  }

  // Table styling to match logs TableData
  :deep(.trace_table) {
    font-family: 'Roboto Mono', monospace;
    height: 100%;

    .arco-table {
      height: 100%;
    }

    .arco-table-container {
      height: 100%;
    }

    .arco-table-element {
      font-family: 'Roboto Mono', monospace;
      height: 100%;
    }

    // Center align empty state
    .arco-table-tr-empty .arco-table-cell {
      justify-content: center;
    }

    .arco-table-td,
    .arco-table-th {
      white-space: nowrap;
    }

    .arco-table-size-medium .arco-table-cell {
      padding: 7px 10px;
    }

    &.multiple_column {
      width: 100%;

      .arco-table-td-content {
        overflow: hidden;
        text-overflow: ellipsis;
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

    // Show menu icon on hover when in builder mode
    &.multiple_column .arco-table-cell:hover .td-config-icon {
      visibility: visible;
    }
  }

  :deep(.arco-card) {
    border-radius: 0;
    border-bottom: none;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;

    .arco-card-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 0;
    }
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
</style>
