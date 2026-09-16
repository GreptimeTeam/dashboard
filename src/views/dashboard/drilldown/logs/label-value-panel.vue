<template lang="pug">
.label-value-panel
  .panel-header
    .panel-title(:title="titleText")
      span.panel-title-text {{ titleText }}
      span.panel-count {{ countLabel }}
    .panel-actions
      a-button(type="primary" size="mini" @click="openDetail") {{ t('drilldown.logs.showLogs') }}
      a-button(
        type="outline"
        size="mini"
        :class="{ 'is-included': isIncluded }"
        @click="toggleInclude"
      ) {{ includeLabel }}

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
          :trace-id-column="traceIdColumn"
          @trace-click="openTrace"
          @filterConditionAdd="onFilterConditionAdd"
          @reach-end="loadMore"
        )
        a-empty(v-else-if="!loading" :description="t('drilldown.logs.noLogRows')")
      .logs-load-more(v-if="loadingMore")
        a-spin(:size="14")
        span {{ t('drilldown.logs.loadingMore') }}

    .panel-chart-col
      LogsVolumeMiniChart(
        v-model:selected-levels="selectedLevels"
        :label-col="labelCol"
        :label-value="labelValue"
        :scroll-root="scrollRoot"
        :enabled="ctx.logsView.value !== 'detail'"
      )
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, toRef, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import LogsTable from '@/views/dashboard/logs/query/LogsTable.vue'
  import { useDrilldownContext } from '@/observability/context'
  import { loadDrilldownSettings } from '@/observability/drilldown-settings'
  import { addFilter, filterIncludesValue } from '@/observability/filters'
  import { chipKeyForLogsTableFilter } from '@/observability/logs/field-map'
  import useDrilldownLogsTable from '@/observability/use-drilldown-logs-table'
  import type { DrilldownFilterOp } from '@/observability/types'
  import LogsVolumeMiniChart from './logs-volume-mini-chart.vue'

  // Runtime props: avoid type-only defineProps binding issues under HMR.
  const props = defineProps({
    labelCol: { type: String, required: true },
    labelValue: { type: String, required: true },
    logCount: { type: Number, required: true },
    // HTMLElement | Ref | getter — forwarded to IntersectionObserver root
    scrollRoot: { type: [Object, Function], default: undefined },
  })

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const traceIdColumn = computed(() => ctx.fieldMap.value.logs.traceId || ctx.fieldMap.value.logs.trace_id || '')

  const openTrace = (traceId: string) => {
    ctx.openTraceGantt(String(traceId || ''))
  }
  const labelColRef = toRef(props, 'labelCol')
  const labelValueRef = toRef(props, 'labelValue')
  const selectedLevels = ref<string[]>([])

  const { loading, loadingMore, tableColumns, tableData, tsColumn, displayedColumns, load, loadMore } =
    useDrilldownLogsTable(ctx, {
      labelCol: labelColRef,
      labelValue: labelValueRef,
      levels: selectedLevels,
    })

  const titleText = computed(() => `${props.labelCol}="${props.labelValue}"`)
  const countLabel = computed(() => t('drilldown.logs.valueCount', { count: props.logCount }))
  const isIncluded = computed(() => filterIncludesValue(ctx.filters.value, props.labelCol, props.labelValue))
  const includeLabel = computed(() =>
    isIncluded.value ? t('drilldown.filters.included') : t('drilldown.filters.addToFilter')
  )

  function ensureColumnMapped(column: string) {
    if (!column || ctx.fieldMap.value.logs[column]) {
      return
    }
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      logs: { ...ctx.fieldMap.value.logs, [column]: column },
    }
  }

  function applySelectedLevels() {
    const levels = selectedLevels.value
    if (!levels.length) {
      return
    }
    const column = ctx.fieldMap.value.logs.severity
    if (!column) {
      return
    }
    ensureColumnMapped(column)
    let next = ctx.filters.value.filter((filter) => filter.key !== column && filter.key !== 'severity')
    levels.forEach((value) => {
      next = addFilter(next, { key: column, op: '=', value })
    })
    ctx.setFilters(next)
  }

  function openDetail() {
    if (!props.labelCol) {
      return
    }
    ensureColumnMapped(props.labelCol)
    if (!isIncluded.value) {
      ctx.toggleFilterValue({ key: props.labelCol, op: '=', value: props.labelValue })
    }
    applySelectedLevels()
    const logsMap = ctx.fieldMap.value.logs
    const groupKeys = new Set([logsMap.primaryGroupBy, logsMap.service, 'service'].filter(Boolean))
    ctx.openLogsDetail(groupKeys.has(props.labelCol) ? props.labelValue : undefined)
  }

  function toggleInclude() {
    if (!props.labelCol) {
      return
    }
    ensureColumnMapped(props.labelCol)
    ctx.toggleFilterValue({ key: props.labelCol, op: '=', value: props.labelValue })
  }

  function mapOperator(operator: string): DrilldownFilterOp {
    if (operator === '!=' || operator === '=~' || operator === '!~') return operator
    return '='
  }

  function onFilterConditionAdd(event: { columnName: string; operator: string; value: unknown }) {
    const value = event.value == null ? '' : String(event.value)
    if (!value) return
    const settings = loadDrilldownSettings().logs
    const chipKey = chipKeyForLogsTableFilter(event.columnName, tableColumns.value, ctx.fieldMap.value.logs, {
      labelInclude: settings.labelInclude,
      labelExclude: settings.labelExclude,
      fieldInclude: settings.fieldInclude,
      fieldExclude: settings.fieldExclude,
    })
    const severityCol = ctx.fieldMap.value.logs.severity
    if (chipKey !== severityCol && !ctx.fieldMap.value.logs[chipKey]) {
      ctx.fieldMap.value = {
        ...ctx.fieldMap.value,
        logs: { ...ctx.fieldMap.value.logs, [chipKey]: event.columnName },
      }
    }
    ctx.appendFilter({ key: chipKey, op: mapOperator(event.operator), value })
  }

  onMounted(() => {
    if (ctx.logsView.value === 'detail') {
      return
    }
    load()
  })
  watch(
    () => [
      props.labelCol,
      props.labelValue,
      ctx.refreshKey.value,
      ctx.time.value,
      ctx.rangeTime.value[0],
      ctx.rangeTime.value[1],
      ctx.logsView.value,
      ctx.fieldMap.value.logs.time,
      selectedLevels.value,
      // Detail applies filters to panel preview; overview compose ignores them in SQL.
      ctx.logsView.value === 'detail' ? ctx.filters.value : null,
    ],
    () => {
      if (ctx.logsView.value === 'detail') {
        return
      }
      load()
    },
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
    gap: var(--gpt-gap-md);
    min-width: 0;
  }

  .panel-title-text {
    overflow: hidden;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-control);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-count {
    flex-shrink: 0;
    font-size: var(--gpt-font-base);
    color: var(--color-text-3);
  }

  .panel-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--gpt-gap-md);
  }

  .is-included {
    color: var(--gpt-main-dark);
    border-color: var(--gpt-main-dark);
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
    gap: var(--gpt-gap-md);
    padding: var(--gpt-gap-xs) 0;
    pointer-events: none;
    background: linear-gradient(transparent, var(--gpt-bg-panel) 40%);
    font-size: var(--gpt-font-base);
    color: var(--color-text-3);
  }

  .panel-chart-col {
    display: flex;
    flex: 0 0 42%;
    flex-direction: column;
    min-width: 280px;
    max-width: 420px;
    min-height: 0;
    height: 100%;
    padding: var(--gpt-gap-lg);
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
