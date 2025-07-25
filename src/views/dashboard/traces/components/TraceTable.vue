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
      a-trigger(v-if="columns.length" trigger="click" :unmount-on-close="false")
        a-button(type="text" style="color: var(--color-text-2)")
          template(#icon)
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

  DataTable(
    :data="paginatedResults"
    :columns="visibleColumns"
    :loading="loading"
    :column-mode="'separate'"
    :displayed-columns="displayedColumns"
    :ts-column="{ name: 'timestamp', data_type: 'TimestampNanosecond' }"
    :class="{ builder_type: queryState.editorType === 'builder', trace_table: true }"
    @filter-condition-add="$emit('filterConditionAdd', $event)"
  )
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
  import type { PropType } from 'vue'
  import type { QueryState } from '@/types/query'

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
    queryState: {
      type: Object as PropType<QueryState>,
      default: () => ({}),
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
      query: { table: props.queryState.table },
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

  .td-config-icon {
    margin-left: 3px;
    cursor: pointer;
    visibility: hidden;
    width: 12px;
    height: 12px;
    color: var(--color-primary);
  }
</style>
