<template lang="pug">
.query-result-table-container(ref="tableContainer" :id="containerId")
  DataGrid(
    v-bind="gridAttrs"
    :pagination="true"
    :active-row-key="detailVisible ? selectedRowKey : null"
    :ts-cell-detail="true"
    @ts-cell-click="handleTsClick"
  )
    template(v-for="(_, name) in $slots" #[name]="slotProps")
      slot(v-bind="slotProps || {}" :name="name")

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
  import DataGrid from '@/components/data-grid/DataGrid.vue'

  defineOptions({
    inheritAttrs: false,
  })

  const props = defineProps<{
    resultKey: string | number
  }>()

  const attrs = useAttrs()

  const gridAttrs = computed(() => ({
    ...attrs,
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

  const handleTsClick = (record: Record<string, unknown>, rowIndex: number) => {
    const key = typeof rowIndex === 'number' ? rowIndex : Number(record.__rowIndex)
    if (!Number.isFinite(key)) return
    selectedRowKey.value = key
    detailVisible.value = true
  }
</script>

<style lang="less" scoped>
  .query-result-table-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;

    :deep(.data-grid) {
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
