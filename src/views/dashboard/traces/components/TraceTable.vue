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

  DataTable(
    :data="paginatedResults"
    :columns="visibleColumns"
    :loading="loading"
    :table-classes="{ trace_table: true }"
    :column-mode="'separate'"
    :displayed-columns="displayedColumns"
    :ts-column="{ name: 'timestamp', data_type: 'TimestampNanosecond' }"
    :editor-type="editorType"
    @filter-condition-add="$emit('filterConditionAdd', $event)"
  )
    // Custom slot for trace ID columns to make them clickable
    template(#column-traceid="{ record, showContextMenu, handleContextMenu }")
      a-link(@click="handleTraceClick(record.traceid)") {{ record.traceid }}
      svg.td-config-icon(v-if="showContextMenu" @click="(event) => handleContextMenu(record, 'traceid', event)")
        use(href="#menu")

    template(#column-trace_id="{ record, showContextMenu, handleContextMenu }")
      a-link(@click="handleTraceClick(record.trace_id)") {{ record.trace_id }}
      svg.td-config-icon(v-if="showContextMenu" @click="(event) => handleContextMenu(record, 'trace_id', event)")
        use(href="#menu")
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useLocalStorage } from '@vueuse/core'
  import { useRouter } from 'vue-router'
  import { IconSettings } from '@arco-design/web-vue/es/icon'
  import DataTable from '@/components/data-table/index.vue'
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
    editorType: {
      type: String,
      default: 'builder',
    },
  })

  const emit = defineEmits(['filterConditionAdd'])
  const router = useRouter()

  // Default columns to show for traces (when no selection is made)
  const defaultTraceColumns = ['trace_id', 'service_name', 'span_name', 'timestamp', 'duration_nano']

  // Column visibility state with localStorage persistence
  const displayedColumns = useLocalStorage<string[]>('trace-displayed-columns', [])

  // Pagination and results info for title
  const pageSize = ref(20)
  const currentPage = ref(1)
  const totalResults = computed(() => props.data.length)

  // Computed paginated results
  const paginatedResults = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    return props.data.slice(start, end)
  })

  watchEffect(() => {
    console.log('paginatedResults', paginatedResults.value)
  })

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

  // Reset pagination when data changes
  watch(
    () => props.data,
    () => {
      currentPage.value = 1
    }
  )

  // Handle trace ID link click
  function handleTraceClick(traceId: string) {
    router.push({
      name: 'dashboard-TraceDetail',
      params: { id: traceId },
      query: { table: props.tableName },
    })
  }
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

  // Custom trace table styling can be added here if needed
  :deep(.trace_table) {
    // Any trace-specific table styles
  }

  .td-config-icon {
    margin-left: 3px;
    cursor: pointer;
    visibility: hidden;
    width: 12px;
    height: 12px;
    color: var(--color-primary);
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
