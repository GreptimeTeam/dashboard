<template lang="pug">
.query-result-table-container(ref="tableContainer" :id="containerId")
  PaginatedDataTable(v-bind="paginatedTableAttrs" @ts-cell-click="handleTsClick")

  LogDetail(
    v-model:visible="detailVisible"
    :popup-container="popupContainerSelector"
    :selected-row-key="selectedRowKey"
    :curr-row="selectedRecord"
    :rows="fullRows"
    :columns="columns"
    @update:selected-row-key="selectedRowKey = $event"
  )
</template>

<script lang="ts" setup>
  import { computed, ref, useAttrs } from 'vue'
  import type { ColumnType } from '@/types/query'
  import LogDetail from '@/views/dashboard/logs/query/LogDetail.vue'

  defineOptions({
    inheritAttrs: false,
  })

  const props = defineProps<{
    resultKey: string | number
  }>()

  const attrs = useAttrs()

  const paginatedTableAttrs = computed(() => ({
    ...attrs,
    tsCellDetail: true,
  }))

  const detailVisible = ref(false)
  const selectedRowKey = ref<number | null>(null)

  const containerId = computed(() => `query-result-table-${props.resultKey}`)
  const popupContainerSelector = computed(() => `#${containerId.value}`)

  const columns = computed(() => (attrs.columns as ColumnType[]) ?? [])
  const fullRows = computed(() => (attrs.data as Record<string, unknown>[]) ?? [])

  const selectedRecord = computed(() => {
    if (selectedRowKey.value === null) return null
    return fullRows.value[selectedRowKey.value] ?? null
  })

  const handleTsClick = (record: Record<string, unknown>) => {
    const rowIndex = record.__globalRowIndex
    if (typeof rowIndex !== 'number') return
    selectedRowKey.value = rowIndex
    detailVisible.value = true
  }
</script>

<style lang="less" scoped>
  .query-result-table-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;

    :deep(.paginated-data-table) {
      flex: 1;
      min-height: 0;
    }
  }
</style>

<style lang="less">
  .query-result-table-container .arco-drawer {
    border: 1px solid var(--gpt-border-default) !important;
  }
</style>
