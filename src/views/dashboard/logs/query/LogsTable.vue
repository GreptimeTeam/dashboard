<template lang="pug">
#log-table-container(ref="tableContainer")
  DataTable(
    :data="data"
    :columns="columns"
    :column-mode="columnMode"
    :displayed-columns="displayedColumns"
    :loading="loading"
    :size="size"
    :wrap-line="wrapLine"
    :virtual-list-props="{ height: virtualListHeight, buffer: 36 }"
    :row-selection="activeRowSelection"
    :selected-keys="exportSelectedKeys"
    :ts-column="tsColumn"
    :ts-cell-detail="tsCellDetail"
    :show-context-menu="sqlMode === 'builder'"
    :class="{ builder_type: sqlMode === 'builder' }"
    @filter-condition-add="handleFilterConditionAdd"
    @row-select="$emit('rowSelect', $event)"
    @ts-cell-click="handleTsClick"
    @update:selected-keys="handleSelectedKeysUpdate"
  )
    template(v-if="$slots['column-level']" #column-level="slotProps")
      slot(name="column-level" v-bind="slotProps")

  LogDetail(
    v-model:visible="detailVisible"
    :selected-row-key="selectedRowKey"
    :curr-row="selectedRecord"
    :rows="data"
    :columns="columns"
    @update:selected-row-key="selectedRowKey = $event"
  )
</template>

<script setup lang="ts" name="LogTableData">
  import { ref, computed } from 'vue'
  import { useElementSize } from '@vueuse/core'
  import type { ColumnType, TSColumn } from '@/types/query'
  import LogDetail from './LogDetail.vue'

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
      exportRowSelection?: Record<string, unknown>
      selectedKeys?: number[]
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
      exportRowSelection: undefined,
      selectedKeys: () => [],
    }
  )

  const emit = defineEmits(['filterConditionAdd', 'rowSelect', 'updateSelectedKeys'])

  const selectedRowKey = ref<number | null>(null)
  const selectedRecord = computed(() => {
    return props.data[selectedRowKey.value]
  })

  const tableContainer = ref(null)
  const { height } = useElementSize(tableContainer)

  const detailRowSelection = ref({
    type: 'radio' as const,
    checkStrictly: false,
    selectedRowKeys: computed(() => [selectedRowKey.value]),
  })

  const activeRowSelection = computed(() => props.exportRowSelection ?? detailRowSelection.value)

  const tsCellDetail = computed(() => !!props.tsColumn && !props.exportRowSelection)

  const exportSelectedKeys = computed(() => (props.exportRowSelection ? props.selectedKeys : undefined))

  const detailVisible = ref(false)

  const handleTsClick = (row: TableData, rowIndex: number) => {
    if (props.exportRowSelection) return
    selectedRowKey.value = rowIndex
    emit('rowSelect', row)
    detailVisible.value = true
  }

  const headerHeight = computed(() => {
    return props.size === 'mini' ? 25 : 38
  })

  const virtualListHeight = computed(() => {
    const containerHeight = height.value
    const header = headerHeight.value
    return containerHeight - header
  })

  const handleFilterConditionAdd = (event) => {
    emit('filterConditionAdd', event)
  }

  const handleSelectedKeysUpdate = (keys: number[]) => {
    if (props.exportRowSelection) {
      emit('updateSelectedKeys', keys)
    }
  }
</script>

<style lang="less" scoped>
  #log-table-container {
    height: 100%;
    display: flex;
    flex-direction: column;

    :deep(.data-table-container) {
      height: 100%;
      flex: 1;
    }
  }
</style>
