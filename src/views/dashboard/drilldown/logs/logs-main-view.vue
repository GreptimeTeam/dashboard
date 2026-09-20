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
      :has-more="hasMore"
      :loading-more="loadingMore"
      :trace-id-column="traceIdColumn"
      @trace-click="openTrace"
      @filterConditionAdd="onFilterConditionAdd"
      @reach-end="loadMore"
    )
    a-empty(v-else-if="!loading" :description="t('drilldown.logs.noLogRows')")
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import LogsTable from '@/views/dashboard/logs/query/LogsTable.vue'
  import { useDrilldownContext } from '@/observability/context'
  import { loadDrilldownSettings } from '@/observability/drilldown-settings'
  import { chipKeyForLogsTableFilter } from '@/observability/logs/field-map'
  import resolveLogsRoles from '@/observability/logs/resolved-roles'
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
      /** Logs-tab body predicate. Not applied on the Labels tab. */
      extraWhere?: string
    }>(),
    {
      showVolume: true,
      fillHeight: false,
      extraWhere: '',
    }
  )

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  // Drilldown keeps its own display prefs: the legacy log query page's "single column"
  // choice must not collapse this table to its timestamp column.
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
  } = useLogsTablePrefs({ storagePrefix: 'drilldown-logs', defaultMergeColumn: false })

  const { loading, loadingMore, tableColumns, tableData, tsColumn, hasMore, load, loadMore } = useDrilldownLogsTable(
    ctx,
    {
      extraWhere: computed(() => props.extraWhere),
    }
  )

  const logsTableName = computed(() => ctx.logsTable.value || '')
  const visibleColumns = computed(() => displayedColumnsFor(logsTableName.value))
  // Settings fill roles the runtime map has not resolved yet (see resolveLogsRoles).
  const traceIdColumn = computed(() => {
    const roles = resolveLogsRoles(ctx)
    return typeof roles.traceId === 'string' && roles.traceId.trim()
      ? roles.traceId
      : typeof roles.trace_id === 'string' && roles.trace_id.trim()
      ? roles.trace_id
      : ''
  })

  const openTrace = (traceId: string) => {
    ctx.openTraceGantt(String(traceId || ''))
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
      props.extraWhere,
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
</style>
