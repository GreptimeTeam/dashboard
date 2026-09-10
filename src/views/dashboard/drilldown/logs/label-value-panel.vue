<template lang="pug">
.label-value-panel
  .panel-header
    .panel-title(:title="titleText")
      span.panel-title-text {{ titleText }}
      span.panel-count {{ countLabel }}
    a-button(type="outline" size="mini" @click="addToFilter") {{ t('drilldown.filters.addToFilter') }}

  .panel-body
    .panel-logs-col
      a-spin(:loading="loading")
        LogsTable(
          v-if="tableColumns.length"
          sql-mode="builder"
          column-mode="merged-with-keys"
          size="mini"
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

    .panel-chart-col
      LogsVolumeMiniChart(
        :label-col="labelCol"
        :label-value="labelValue"
        :color-index="colorIndex"
        :scroll-root="scrollRoot"
      )
</template>

<script setup lang="ts">
  import { computed, onMounted, toRef, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import LogsTable from '@/views/dashboard/logs/query/LogsTable.vue'
  import { useDrilldownContext } from '@/observability/context'
  import useDrilldownLogsTable from '@/observability/use-drilldown-logs-table'
  import type { DrilldownFilterOp } from '@/observability/types'
  import LogsVolumeMiniChart from './logs-volume-mini-chart.vue'

  // Runtime props: avoid type-only defineProps binding issues under HMR.
  const props = defineProps({
    labelCol: { type: String, required: true },
    labelValue: { type: String, required: true },
    logCount: { type: Number, required: true },
    colorIndex: { type: Number, default: 0 },
    // HTMLElement | Ref | getter — forwarded to IntersectionObserver root
    scrollRoot: { type: [Object, Function], default: undefined },
  })

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const labelColRef = toRef(props, 'labelCol')
  const labelValueRef = toRef(props, 'labelValue')

  const { loading, loadingMore, tableColumns, tableData, tsColumn, displayedColumns, load, loadMore } =
    useDrilldownLogsTable(ctx, {
      labelCol: labelColRef,
      labelValue: labelValueRef,
    })

  const titleText = computed(() => `${props.labelCol}="${props.labelValue}"`)
  const countLabel = computed(() => t('drilldown.logs.valueCount', { count: props.logCount }))

  function addToFilter() {
    if (!props.labelCol) {
      return
    }
    if (!ctx.fieldMap.value.logs[props.labelCol]) {
      ctx.fieldMap.value = {
        ...ctx.fieldMap.value,
        logs: { ...ctx.fieldMap.value.logs, [props.labelCol]: props.labelCol },
      }
    }
    ctx.appendFilter({ key: props.labelCol, op: '=', value: props.labelValue })
  }

  function mapOperator(operator: string): DrilldownFilterOp {
    if (operator === '!=' || operator === '=~' || operator === '!~') return operator
    return '='
  }

  function onFilterConditionAdd(event: { columnName: string; operator: string; value: unknown }) {
    const value = event.value == null ? '' : String(event.value)
    if (!value) return
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
      props.labelCol,
      props.labelValue,
      ctx.refreshKey.value,
      ctx.time.value,
      ctx.rangeTime.value[0],
      ctx.rangeTime.value[1],
      ctx.filters.value,
    ],
    load,
    { deep: true }
  )
</script>

<style scoped lang="less">
  .label-value-panel {
    display: flex;
    flex-direction: column;
    background: var(--gpt-bg-panel);
    border-bottom: 1px solid var(--gpt-border-default);
  }

  .panel-header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    gap: var(--gpt-gap-md);
    min-height: var(--gpt-size-region-bar);
    padding: var(--gpt-toolbar-padding);
    background: var(--gpt-table-toolbar-bg);
    border-bottom: 1px solid var(--gpt-border-default);
  }

  .panel-title {
    display: flex;
    flex: 1 1 auto;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .panel-title-text {
    overflow: hidden;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    font-size: var(--gpt-font-sm, 13px);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-count {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--color-text-3);
  }

  .panel-body {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    height: 200px;
    min-height: 200px;
    max-height: 200px;
  }

  .panel-logs-col {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;

    :deep(#log-table-container) {
      flex: 1 1 auto;
      min-height: 0;
      height: 100%;
    }

    /* Ensure headerless clip wins inside nested spin / panel layout. */
    :deep(#log-table-container.hide-table-header .arco-table-header) {
      height: 0 !important;
      max-height: 0 !important;
      overflow: hidden !important;
      opacity: 0 !important;
      visibility: hidden !important;
      border: none !important;
      pointer-events: none !important;
    }

    :deep(.data-table-container),
    :deep(.arco-table-container) {
      border-radius: 0;
    }

    :deep(.arco-spin) {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      height: 100%;
    }

    :deep(.arco-spin-container) {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      height: 100%;
    }
  }

  .logs-load-more {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 4px 0;
    pointer-events: none;
    background: linear-gradient(transparent, var(--gpt-bg-panel) 40%);
    font-size: 12px;
    color: var(--color-text-3);
  }

  .panel-chart-col {
    display: flex;
    flex: 0 0 36%;
    flex-direction: column;
    min-width: 180px;
    max-width: 320px;
    min-height: 0;
    height: 100%;
    border-left: 1px solid var(--gpt-border-default);

    :deep(.logs-volume-mini-chart) {
      height: 100%;
    }

    :deep(.panel-state),
    :deep(.panel-chart) {
      border: none;
      border-radius: 0;
      background: transparent;
    }

    :deep(.panel-chart),
    :deep(.panel-loading),
    :deep(.panel-state) {
      height: 100%;
      min-height: 0;
    }
  }

  @media (max-width: 900px) {
    .panel-body {
      flex-direction: column;
      height: auto;
      max-height: none;
    }

    .panel-logs-col {
      height: 200px;
      max-height: 200px;
    }

    .panel-chart-col {
      width: 100%;
      max-width: none;
      height: 120px;
      border-top: 1px solid var(--gpt-border-default);
      border-left: none;
    }
  }
</style>
