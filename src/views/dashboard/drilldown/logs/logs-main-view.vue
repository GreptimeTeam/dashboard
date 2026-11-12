<template lang="pug">
.logs-main-view
  .logs-main-volume(v-if="showVolume")
    LogsVolumeMiniChart(sync-severity-filter :lazy="false")

  .drilldown-toolbar.logs-results-toolbar
    .drilldown-toolbar__left
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

    .drilldown-toolbar__right
      a-trigger(
        v-if="tableColumns.length"
        trigger="click"
        size="small"
        :unmount-on-close="false"
      )
        a-button(type="text" size="small")
          span.gpt-text-secondary {{ t('logsQuery.columns') }}
          span.gpt-text-secondary(v-if="hiddenColumnCount" style="margin-left: 6px; font-size: 12px") · {{ t('logsQuery.hiddenColumnsHint', { count: hiddenColumnCount }) }}
        template(#content)
          a-card.gpt-popover-panel
            a-space(direction="vertical" size="small")
              a-space
                a-button(type="text" size="small" @click="selectAllColumns") Select All
                a-button(type="text" size="small" @click="deselectAllColumns") Deselect All
              a-checkbox-group(v-model="visibleSelectableColumnNames" direction="vertical")
                a-checkbox(v-for="column in selectableColumns" :key="column.name" :value="column.name")
                  | {{ column.name }}

  a-spin.logs-main-table(:loading="loading" :class="{ 'logs-main-table--fill': fillHeight }")
    LogsTable(
      v-if="tableColumns.length"
      :key="`${logsTableName}-${columnModeKey}`"
      sql-mode="builder"
      filter-menu-kind="drilldown"
      detail-popup-container=".drilldown-body--logs"
      :column-mode="columnMode"
      :size="size"
      :show-header="true"
      :data="tableData"
      :columns="tableColumns"
      :ts-column="tsColumn"
      :displayed-columns="visibleColumnNames"
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
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import LogsTable from '@/views/dashboard/logs/query/LogsTable.vue'
  import { useDrilldownContext } from '@/observability/context'
  import { loadDrilldownSettings } from '@/observability/drilldown-settings'
  import { chipKeyForLogsTableFilter } from '@/observability/logs/field-map'
  import {
    drilldownOpToLogsBodyOp,
    isDirectLogsDetail,
    ownedLogsDetailFilterRole,
    ownedLogsFilterOptions,
    removeOwnedLogsFilterVariants,
  } from '@/observability/logs/filter-semantics'
  import resolveLogsRoles from '@/observability/logs/resolved-roles'
  import useDrilldownLogsTable from '@/observability/use-drilldown-logs-table'
  import useLogsTablePrefs from '@/observability/use-logs-table-prefs'
  import { isDrilldownFilterOp, normalizeFilterOp } from '@/observability/filters'
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

  // Display prefs. Hidden columns are global and shared with Logs Query; only the
  // runtime compact/wrap state is per-page.
  const {
    mergeColumn,
    showKeys,
    compactRows,
    wrap,
    size,
    columnMode,
    columnModeKey,
    hiddenColumnsFor,
    visibleColumnsFor,
    setVisibleColumns,
    showAllColumns,
    hideAllColumns,
  } = useLogsTablePrefs()

  const { loading, loadingMore, tableColumns, tableData, tsColumn, hasMore, loadMore } = useDrilldownLogsTable(ctx, {
    extraWhere: computed(() => props.extraWhere),
    queryParams: () => ({ showVolume: props.showVolume }),
  })

  const logsTableName = computed(() => ctx.semantics.logs.table.value || '')
  const tableColumnNames = computed(() => tableColumns.value.map((column) => column.name))
  // The logs table pins the timestamp column first; it is not a configurable column.
  const timestampColumnName = computed(() => tsColumn.value?.name || '')
  const selectableColumns = computed(() =>
    tableColumns.value.filter((column) => column.name !== timestampColumnName.value)
  )
  const selectableColumnNames = computed(() => selectableColumns.value.map((column) => column.name))
  const visibleColumnNames = computed({
    get: () => visibleColumnsFor(tableColumnNames.value),
    set: (visible) => setVisibleColumns(tableColumnNames.value, visible),
  })
  const visibleSelectableColumnNames = computed({
    get: () => visibleColumnsFor(selectableColumnNames.value),
    set: (visible) => setVisibleColumns(selectableColumnNames.value, visible),
  })
  const hiddenColumnCount = computed(() => hiddenColumnsFor(selectableColumnNames.value).length)

  function selectAllColumns() {
    showAllColumns(selectableColumnNames.value)
  }

  function deselectAllColumns() {
    hideAllColumns(selectableColumnNames.value)
  }
  // Settings fill roles the runtime map has not resolved yet (see resolveLogsRoles).
  const traceIdColumn = computed(() => {
    const roles = resolveLogsRoles(ctx)
    const column = [roles.traceId, roles.trace_id].find(
      (value): value is string => typeof value === 'string' && Boolean(value.trim())
    )
    return column ?? ''
  })

  const openTrace = (traceId: string) => {
    ctx.actions.openTraceGantt(String(traceId || ''))
  }

  const onFilterConditionAdd = (event: { columnName: string; operator: string; value: unknown }) => {
    const value = event.value == null ? '' : String(event.value).trim()
    if (!value) {
      return
    }
    const column = tableColumns.value.find((col) => col.name === event.columnName)
    const rawOp = isDrilldownFilterOp(event.operator) ? event.operator : '='
    const op = normalizeFilterOp(column?.data_type, rawOp)
    const settings = loadDrilldownSettings(ctx.connection.logsDatabase.value).logs
    const chipKey = chipKeyForLogsTableFilter(event.columnName, tableColumns.value, ctx.semantics.logs.fieldMap.value, {
      labelInclude: settings.labelInclude,
      labelExclude: settings.labelExclude,
      fieldInclude: settings.fieldInclude,
      fieldExclude: settings.fieldExclude,
    })
    const options = ownedLogsFilterOptions(ctx)
    const ownedRole = isDirectLogsDetail(ctx) ? ownedLogsDetailFilterRole(chipKey, options) : undefined
    if (ownedRole === 'body') {
      const bodyOp = drilldownOpToLogsBodyOp(op)
      if (!bodyOp) {
        return
      }
      ctx.ui.logsBodyOp.value = bodyOp
      ctx.ui.logsBodyValue.value = value
      return
    }

    if (ownedRole === 'severity' || ownedRole === 'service') {
      // LevelFilter exposes include-only multi-select; service supports every chip operator.
      if (ownedRole === 'severity' && op !== '=' && op !== '=~') {
        return
      }
      const target = options.roles[ownedRole]?.trim()
      if (!target) {
        return
      }
      const next = removeOwnedLogsFilterVariants(ctx.query.filters.value, ownedRole, options)
      ctx.actions.setFilters([...next, { key: target, op, value }])
      return
    }

    ctx.actions.appendFilter({ key: chipKey, op, value })
  }
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
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-md);
    background: var(--gpt-bg-panel);
  }

  .results-header {
    display: inline-flex;
    align-items: baseline;
    gap: var(--gpt-gap-xs);
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-control);
    color: var(--gpt-text-primary);
    white-space: nowrap;
  }

  .results-count {
    color: var(--gpt-text-muted);
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
