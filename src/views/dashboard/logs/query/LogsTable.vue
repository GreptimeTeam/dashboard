<template lang="pug">
#log-table-container(ref="tableContainer")
  DataTable(
    :data="data"
    :columns="columns"
    :column-mode="columnMode"
    :displayed-columns="displayedColumns"
    :loading="false"
    :size="size"
    :wrap-line="wrapLine"
    :compact="isCompact"
    :virtual-list-props="{ height: virtualListHeight, buffer: 36 }"
    :row-selection="rowSelection"
    :ts-column="tsColumn"
    :show-context-menu="sqlMode === 'builder'"
    :class="{ builder_type: sqlMode === 'builder' }"
    @filter-condition-add="handleFilterConditionAdd"
    @row-select="$emit('rowSelect', $event)"
  )
    // Custom slot for timestamp column 
    template(v-if="tsColumn" #[`column-${tsColumn.name}`]="{ record, renderedValue, rowIndex }")
      .clickable-ts(@click="() => handleTsClick(record, rowIndex)") {{ renderedValue }}

  LogDetail(
    v-model:visible="detailVisible"
    :selected-row-key="selectedRowKey"
    :curr-row="selectedRecord"
    :rows="data"
    @update:selected-row-key="selectedRowKey = $event"
  )
</template>

<script setup lang="ts" name="LogTableData">
  import { ref, computed, watch, shallowRef } from 'vue'
  import { useElementSize, useLocalStorage } from '@vueuse/core'
  import DataTable from '@/components/data-table/index.vue'
  import LogDetail from './LogDetail.vue'
  import type { ColumnType, TSColumn } from './types'

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
    }
  )

  const emit = defineEmits(['filterConditionAdd', 'rowSelect'])

  // Local state for row selection
  const selectedRowKey = ref<number | null>(null)
  const selectedRecord = computed(() => {
    return props.data[selectedRowKey.value]
  })

  const tableContainer = ref(null)
  const { height } = useElementSize(tableContainer)

  const rowSelection = ref({
    type: 'radio' as const,
    checkStrictly: false,
    selectedRowKeys: computed(() => [selectedRowKey.value]),
  })

  const detailVisible = ref(false)

  const handleTsClick = (row, rowIndex) => {
    selectedRowKey.value = rowIndex
    emit('rowSelect', row)
    detailVisible.value = true
  }

  const isCompact = useLocalStorage('logquery-table-compact', false)
  const headerHeight = computed(() => {
    return isCompact.value ? 25 : 38
  })

  // Enhanced virtual list height calculation with debugging
  const virtualListHeight = computed(() => {
    const containerHeight = height.value
    const header = headerHeight.value
    const calculatedHeight = containerHeight - header

    // Ensure minimum height and fallback
    return calculatedHeight
  })

  const handleFilterConditionAdd = (event) => {
    emit('filterConditionAdd', event)
  }
</script>

<style lang="less" scoped>
  #log-table-container {
    height: 100%;
    display: flex;
    flex-direction: column;

    // Ensure the DataTable component fills the container
    :deep(.data-table-container) {
      height: 100%;
      flex: 1;
    }
  }

  .clickable-ts {
    cursor: pointer;
    color: var(--color-primary-6);
    text-decoration: underline;

    &:hover {
      color: var(--color-primary-5);
    }
  }
</style>
