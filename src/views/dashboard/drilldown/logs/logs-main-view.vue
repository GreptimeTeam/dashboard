<template lang="pug">
.logs-main-view
  .logs-main-volume(v-if="showVolume")
    LogsVolumeMiniChart(:lazy="false" :color-index="0")
  a-spin.logs-main-table(:loading="loading" :class="{ 'logs-main-table--fill': fillHeight }")
    LogsTable(
      v-if="tableColumns.length"
      sql-mode="builder"
      column-mode="merged-with-keys"
      size="small"
      :show-header="false"
      :data="tableData"
      :columns="tableColumns"
      :ts-column="tsColumn"
      :displayed-columns="displayedColumns"
      :wrap-line="false"
      @filterConditionAdd="onFilterConditionAdd"
      @reach-end="loadMore"
    )
    a-empty(v-else-if="!loading" :description="t('drilldown.logs.noLogRows')")
  .logs-load-more(v-if="loadingMore")
    a-spin(:size="14")
    span {{ t('drilldown.logs.loadingMore') }}
</template>

<script setup lang="ts">
  import { onMounted, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import LogsTable from '@/views/dashboard/logs/query/LogsTable.vue'
  import { useDrilldownContext } from '@/observability/context'
  import useDrilldownLogsTable from '@/observability/use-drilldown-logs-table'
  import type { DrilldownFilterOp } from '@/observability/types'
  import LogsVolumeMiniChart from './logs-volume-mini-chart.vue'

  const props = withDefaults(
    defineProps<{
      /** When false, only render the log table (parent already shows volume). */
      showVolume?: boolean
      /** Stretch table area on overview homepage. */
      fillHeight?: boolean
    }>(),
    {
      showVolume: true,
      fillHeight: false,
    }
  )

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  const { loading, loadingMore, tableColumns, tableData, tsColumn, displayedColumns, load, loadMore } =
    useDrilldownLogsTable(ctx)

  const mapOperator = (operator: string): DrilldownFilterOp => {
    if (operator === '!=' || operator === '=~' || operator === '!~') {
      return operator
    }
    return '='
  }

  const onFilterConditionAdd = (event: { columnName: string; operator: string; value: unknown }) => {
    const value = event.value == null ? '' : String(event.value)
    if (!value) {
      return
    }
    if (!ctx.fieldMap.value.logs[event.columnName]) {
      ctx.fieldMap.value = {
        ...ctx.fieldMap.value,
        logs: { ...ctx.fieldMap.value.logs, [event.columnName]: event.columnName },
      }
    }
    ctx.appendFilter({ key: event.columnName, op: mapOperator(event.operator), value })
  }

  onMounted(load)
  watch(
    () => [
      props.showVolume,
      ctx.refreshKey.value,
      ctx.time.value,
      ctx.rangeTime.value[0],
      ctx.rangeTime.value[1],
      ctx.filters.value,
      ctx.logsTable.value,
    ],
    load,
    { deep: true }
  )
</script>

<style scoped lang="less">
  .logs-main-view {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
  }

  .logs-main-volume {
    flex-shrink: 0;
    padding: 10px 12px;
    border: 1px solid var(--color-border-2);
    border-radius: 8px;
    background: var(--color-bg-2);
  }

  .logs-main-table {
    flex: 0 1 auto;
    min-height: 0;
    overflow: hidden;

    &--fill {
      flex: 1 1 0%;
    }

    :deep(#log-table-container) {
      height: 100%;
      max-height: none;
    }
  }

  .logs-load-more {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 12px;
    color: var(--color-text-3);
  }
</style>
