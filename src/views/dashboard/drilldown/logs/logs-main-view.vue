<template lang="pug">
.logs-main-view
  .logs-main-volume(v-if="showVolume")
    LogsVolumeMiniChart(sync-severity-filter :lazy="false")

  .logs-results-toolbar
    .logs-results-toolbar-left
      span.results-header
        span {{ t('drilldown.logs.logsSectionTitle') }}
        span.results-count(v-if="tableData.length")
          |
          | (
          | {{ tableData.length }}
          | &nbsp; {{ t('logsQuery.rowsInCurrentRange') }}
          | )
      a-checkbox(v-model="mergeColumn" type="button" size="small")
        | {{ t('logsQuery.singleColumn') }}
      a-checkbox(
        v-if="mergeColumn"
        v-model="showKeys"
        type="button"
        size="small"
      )
        | {{ t('logsQuery.showKeys') }}
      a-checkbox(v-model="compactRows" type="button" size="small")
        | {{ t('logsQuery.compactRows') }}
      a-checkbox(v-model="wrap" size="small")
        span {{ t('logsQuery.wrapLines') }}

    .logs-results-toolbar-right
      .logs-virtual-columns-clipped-hint(v-if="showVirtualColumnsClippedHint && tableColumns.length")
        | {{ t('logsQuery.virtualColumnsHint') }}
      a-trigger(
        v-if="tableColumns.length"
        trigger="click"
        size="small"
        :unmount-on-close="false"
      )
        a-button(type="text")
          span.gpt-text-secondary {{ t('logsQuery.columns') }}
        template(#content)
          a-card.gpt-popover-panel
            a-checkbox-group(
              v-if="logsTableName"
              v-model="displayedColumnsByTable[logsTableName]"
              direction="vertical"
            )
              a-checkbox(v-for="column in tableColumns" :key="column.name" :value="column.name")
                | {{ column.name }}

  a-spin.logs-main-table(:loading="loading" :class="{ 'logs-main-table--fill': fillHeight }")
    LogsTable(
      v-if="tableColumns.length"
      :key="`${logsTableName}-${columnModeKey}`"
      sql-mode="builder"
      detail-popup-container=".drilldown-body--logs"
      :column-mode="columnMode"
      :size="size"
      :show-header="true"
      :data="tableData"
      :columns="tableColumns"
      :ts-column="tsColumn"
      :displayed-columns="visibleColumns"
      :wrap-line="wrap"
      :trace-id-column="traceIdColumn"
      @trace-click="openTrace"
      @filterConditionAdd="onFilterConditionAdd"
      @reach-end="loadMore"
      @virtualColumnsClipped="handleVirtualColumnsClipped"
    )
    a-empty(v-else-if="!loading" :description="t('drilldown.logs.noLogRows')")
  .logs-load-more(v-if="loadingMore")
    a-spin(:size="14")
    span {{ t('drilldown.logs.loadingMore') }}
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import LogsTable from '@/views/dashboard/logs/query/LogsTable.vue'
  import { useDrilldownContext } from '@/observability/context'
  import { loadDrilldownSettings } from '@/observability/drilldown-settings'
  import { chipKeyForLogsTableFilter } from '@/observability/logs/field-map'
  import useDrilldownLogsTable from '@/observability/use-drilldown-logs-table'
  import useLogsTablePrefs from '@/observability/use-logs-table-prefs'
  import type { DrilldownFilterOp } from '@/observability/types'
  import LogsVolumeMiniChart from './logs-volume-mini-chart.vue'

  const props = withDefaults(
    defineProps<{
      /** When false, only render the log table (parent already shows volume). */
      showVolume?: boolean
      /** Stretch table area to fill remaining tab height. */
      fillHeight?: boolean
    }>(),
    {
      showVolume: true,
      fillHeight: false,
    }
  )

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  const {
    mergeColumn,
    showKeys,
    displayedColumnsByTable,
    compactRows,
    wrap,
    size,
    columnMode,
    columnModeKey,
    displayedColumnsFor,
    revealOfferedColumns,
  } = useLogsTablePrefs()

  const { loading, loadingMore, tableColumns, tableData, tsColumn, load, loadMore } = useDrilldownLogsTable(ctx)

  const logsTableName = computed(() => ctx.logsTable.value || '')
  const visibleColumns = computed(() => displayedColumnsFor(logsTableName.value))
  const traceIdColumn = computed(() => ctx.fieldMap.value.logs.traceId || ctx.fieldMap.value.logs.trace_id || '')

  const openTrace = (traceId: string) => {
    ctx.openTraceGantt(String(traceId || ''))
  }

  const showVirtualColumnsClippedHint = ref(false)
  function handleVirtualColumnsClipped(visible: boolean) {
    showVirtualColumnsClippedHint.value = visible
  }

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

  watch(
    tableColumns,
    (cols) => {
      revealOfferedColumns(
        logsTableName.value,
        cols.map((column) => column.name)
      )
    },
    { deep: true }
  )

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
      // URL detail can mount before fieldMap.time is inferred.
      ctx.fieldMap.value.logs.time,
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
    gap: 0;
    height: 100%;
    min-height: 0;
  }

  .logs-main-volume {
    flex-shrink: 0;
    margin-bottom: var(--gpt-gap-lg);
    padding: var(--gpt-gap-md) var(--gpt-gap-lg);
    border: 1px solid var(--color-border-2);
    border-radius: var(--gpt-radius-md);
    background: var(--color-bg-2);
  }

  .logs-results-toolbar {
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--gpt-gap-md) var(--gpt-gap-lg);
    padding: var(--gpt-gap-md) var(--gpt-page-padding-x);
    border-bottom: 1px solid var(--color-border-2);
    background: var(--gpt-table-toolbar-bg, var(--color-bg-2));
  }

  .logs-results-toolbar-left,
  .logs-results-toolbar-right {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--gpt-gap-md) var(--gpt-gap-lg);
    min-width: 0;
  }

  .results-header {
    display: inline-flex;
    align-items: baseline;
    gap: var(--gpt-gap-xs);
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-control);
    color: var(--color-text-1);
    white-space: nowrap;
  }

  .results-count {
    color: var(--gpt-text-muted, var(--color-text-3));
    font-size: var(--gpt-font-base);
    font-weight: normal;
  }

  .logs-virtual-columns-clipped-hint {
    position: relative;
    padding: var(--gpt-gap-xs) var(--gpt-gap-md);
    border-radius: var(--gpt-radius-sm);
    background: var(--warning-bg-color);
    border: 1px solid var(--warning-color);
    color: var(--warning-color);
    font-size: var(--gpt-font-base);
    line-height: 1.2;
    white-space: nowrap;
    pointer-events: none;
  }

  .logs-main-table {
    display: flex;
    flex: 0 1 auto;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;

    &--fill {
      flex: 1 1 0%;
      height: 100%;
    }

    :deep(.arco-spin-children) {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      height: 100%;
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
    gap: var(--gpt-gap-md);
    font-size: var(--gpt-font-base);
    color: var(--color-text-3);
  }
</style>
