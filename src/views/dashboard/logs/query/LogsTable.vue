<template lang="pug">
#log-table-container(ref="tableContainer")
  LogsVxeTable(
    :data="data"
    :columns="columns"
    :displayed-columns="displayedColumns"
    :ts-column="tsColumn"
    :ts-cell-detail="tsCellDetail"
    :column-mode="columnMode"
    :loading="loading"
    :has-more="hasMore"
    :loading-more="loadingMore"
    :size="size"
    :show-header="showHeader"
    :wrap-line="wrapLine"
    :virtual="virtual"
    :show-context-menu="sqlMode === 'builder'"
    :active-row-key="detailVisible ? selectedRowKey : null"
    :link-column="traceIdColumn"
    :class="dataTableClass"
    @reach-end="emit('reachEnd')"
    @ts-cell-click="handleTsClick"
    @column-link-click="handleTraceClick"
    @filter-condition-add="handleFilterConditionAdd"
  )
  LogDetail(
    v-if="rowDetail"
    v-model:visible="detailVisible"
    :selected-row-key="selectedRowKey"
    :curr-row="selectedRecord"
    :rows="data"
    :columns="columns"
    :popup-container="detailPopupContainer"
    @update:selected-row-key="selectedRowKey = $event"
  )
</template>

<script setup lang="ts" name="LogTableData">
  import { ref, computed, defineAsyncComponent } from 'vue'
  import type { ColumnType, TSColumn } from '@/types/query'
  import LogDetail from './LogDetail.vue'

  const LogsVxeTable = defineAsyncComponent(() => import('@/components/logs-vxe-table/LogsVxeTable.vue'))

  interface TableData {
    [key: string]: any
  }

  const props = withDefaults(
    defineProps<{
      wrapLine: boolean
      size: 'small' | 'mini' | 'medium' | 'large'
      data: TableData[]
      columns: ColumnType[]
      sqlMode: string
      tsColumn: TSColumn | null
      columnMode: 'separate' | 'merged' | 'merged-with-keys'
      displayedColumns: string[]
      loading?: boolean
      /** More rows can be fetched by scrolling (footer affordance + auto load). */
      hasMore?: boolean
      /** A load-more request is in flight. */
      loadingMore?: boolean
      /** Disable row virtualization (small previews). */
      virtual?: boolean
      showHeader?: boolean
      /** LogDetail drawer mount target (nested drawers need a non-clipped ancestor). */
      detailPopupContainer?: string
      /** When set, this column's values are links that emit traceClick. */
      traceIdColumn?: string
      /** Timestamp click opens the row detail drawer. Off for overview previews. */
      rowDetail?: boolean
    }>(),
    {
      wrapLine: false,
      size: 'medium',
      data: () => [],
      columns: () => [],
      sqlMode: 'editor',
      tsColumn: null,
      columnMode: 'separate',
      displayedColumns: () => [],
      loading: false,
      hasMore: false,
      loadingMore: false,
      virtual: true,
      showHeader: true,
      detailPopupContainer: '#log-table-container',
      traceIdColumn: '',
      rowDetail: true,
    }
  )

  const emit = defineEmits(['filterConditionAdd', 'rowSelect', 'reachEnd', 'traceClick'])

  const selectedRowKey = ref<number | null>(null)
  const selectedRecord = computed(() => props.data[selectedRowKey.value])
  const detailVisible = ref(false)

  const tsCellDetail = computed(() => props.rowDetail && !!props.tsColumn)

  const dataTableClass = computed(() => ({
    'builder_type': props.sqlMode === 'builder',
    'logs-table--headerless': !props.showHeader,
  }))

  const handleTraceClick = (_columnName: string, value: string) => {
    if (!value) {
      return
    }
    emit('traceClick', value)
  }

  const handleTsClick = (row: TableData, rowIndex: number) => {
    if (!props.rowDetail) return
    const key = typeof row.__rowIndex === 'number' ? row.__rowIndex : rowIndex
    selectedRowKey.value = key
    emit('rowSelect', row)
    detailVisible.value = true
  }

  const handleFilterConditionAdd = (event) => {
    emit('filterConditionAdd', event)
  }
</script>

<style lang="less" scoped>
  #log-table-container {
    height: 100%;
    display: flex;
    flex-direction: column;

    :deep(.logs-vxe-table) {
      height: 100%;
      flex: 1;
      min-height: 0;
    }
  }
</style>
