<template lang="pug">
a-layout-content.layout-content
  a-card.drilldown-main-pane.gpt-results-pane(:bordered="false")
    .drilldown-home-main
      .traces-home
        .drilldown-toolbar.traces-home-toolbar
          .drilldown-toolbar__left
            span.drilldown-toolbar__group
              span.drilldown-toolbar__label {{ t('dashboard.database') }}
              SignalDatabaseSelect(v-model="tracesDatabase")
            span.drilldown-toolbar__group
              span.drilldown-toolbar__label {{ t('drilldown.traces.tableLabel') }}
              a-select.drilldown-table-select(
                allow-search
                allow-create
                :model-value="tracesTable"
                :placeholder="t('drilldown.traces.tablePlaceholder')"
                :loading="loadingTables"
                @change="onTableChange"
              )
                a-option(v-for="name in tableOptions" :key="name" :value="name") {{ name }}
          .drilldown-toolbar__right
            a-button.trace-logs-settings-trigger(size="small" @click="traceLogsSettingsVisible = true")
              template(#icon)
                icon-settings
              | {{ t('drilldown.traces.logsSettingsShortTitle') }}
            a-input.trace-id-input(
              v-model="traceIdDraft"
              allow-clear
              size="medium"
              :placeholder="t('drilldown.traces.traceIdSearchPlaceholder')"
              @press-enter="submitTraceId"
              @clear="clearTraceId"
            )
              template(#prefix)
                span.trace-id-prefix TID

        a-alert(
          v-if="!tracesTable"
          type="warning"
          show-icon
          :title="t('drilldown.traces.noTableTitle')"
          :description="t('drilldown.traces.noTableDescription')"
        )

        .traces-home-body(v-else)
          .traces-red-main
            .red-triptych
              RedChartPanel(
                v-for="item in redMetricItems"
                :key="item.key"
                :metric="item.key"
                :title="item.label"
                :selected="selectedRedMetric === item.key"
                :color-index="item.colorIndex"
                :height="140"
                @select="selectedRedMetric = item.key"
              )

          a-tabs.traces-home-tabs.panel-tabs(v-model:active-key="activeTab" lazy-load)
            a-tab-pane(key="breakdown" :title="t('drilldown.traces.breakdownTab')")
              .breakdown-tab-pane
                TracesBreakdownGrid(:red-metric="selectedRedMetric")
            a-tab-pane(key="traces" :title="tracesTabTitle")
              .traces-tab-pane
                TraceTable.traces-embed-table(
                  embed-mode
                  :logs-trace-enabled="logsTraceEnabled"
                  :logs-targets="logsTargets"
                  :logs-ambiguous="logsAmbiguous"
                  :data="rows"
                  :columns="columns"
                  :loading="loading"
                  :query-state="tableQueryState"
                  @trace-click="openTrace"
                  @logs-trace-click="openLogsForTrace"
                  @open-logs-settings="traceLogsSettingsVisible = true"
                  @filter-condition-add="onFilterConditionAdd"
                )
  TraceLogsSettingsModal(v-model:visible="traceLogsSettingsVisible" @saved="traceLogsMappingsVersion++")
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { loadDrilldownSettings, saveDrilldownSettings } from '@/observability/drilldown-settings'
  import {
    fetchRootSpanList,
    fetchTraceServices,
    type RedMetric,
    type RootSpanRow,
  } from '@/observability/adapters/traces'
  import { isDrilldownFilterOp, resolveFieldMapColumn } from '@/observability/filters'
  import { buildDefaultTracesFieldMap } from '@/observability/traces/field-map'
  import { bindSignalTable } from '@/observability/bind-signal-table'
  import { physicalServiceColumn } from '@/observability/semantics'
  import resolveLogsRoles from '@/observability/logs/resolved-roles'
  import { resolveTraceLogsForServices, type TraceLogsTarget } from '@/observability/traces/logs-association'
  import type { ColumnType, QueryState } from '@/types/query'
  import { isTracesHomeTab } from '@/observability/types'
  import useDrilldownKeepAlive from '@/observability/use-drilldown-keep-alive'
  import useDrilldownPanelTab from '@/observability/use-drilldown-panel-tab'
  import useSignalTableOptions from '@/observability/use-signal-table-options'
  import { IconSettings } from '@arco-design/web-vue/es/icon'
  import TraceTable from '@/views/dashboard/traces/components/TraceTable.vue'
  import TraceLogsSettingsModal from './trace-logs-settings-modal.vue'
  import SignalDatabaseSelect from '../components/signal-database-select.vue'
  import RedChartPanel from './red-chart-panel.vue'
  import TracesBreakdownGrid from './traces-breakdown-grid.vue'

  defineOptions({
    name: 'TracesHome',
  })

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const { tracesDatabase } = ctx

  const loading = ref(false)
  const rows = ref<RootSpanRow[]>([])
  const columns = ref<ColumnType[]>([])
  /** Pre-resolved trace → logs routing per service; filled after rows load, consumed at click. */
  const logsTargets = ref<Record<string, TraceLogsTarget>>({})
  const logsAmbiguous = ref<Record<string, string[]>>({})
  const logsMultiTable = ref(false)
  const tracesTable = ref(ctx.tracesTable.value)
  const traceIdDraft = ref('')
  const selectedRedMetric = ref<RedMetric>('rate')
  const traceLogsSettingsVisible = ref(false)
  const traceLogsMappingsVersion = ref(0)
  const activeTab = useDrilldownPanelTab({
    tab: ctx.tracesTab,
    setTab: ctx.setTracesTab,
    isTab: isTracesHomeTab,
  })
  const redMetricItems = computed(() => [
    { key: 'rate' as RedMetric, label: t('drilldown.traces.redRate'), colorIndex: 2 },
    { key: 'errors' as RedMetric, label: t('drilldown.traces.redErrors'), colorIndex: 4 },
    { key: 'duration' as RedMetric, label: t('drilldown.traces.redDuration'), colorIndex: 3 },
  ])
  const depsKey = () =>
    JSON.stringify([
      ctx.refreshKey.value,
      ctx.filters.value,
      ctx.time.value,
      ctx.rangeTime.value[0],
      ctx.rangeTime.value[1],
      ctx.tracesTable.value,
      selectedRedMetric.value,
    ])

  const keepAlive = useDrilldownKeepAlive({ deps: depsKey })
  const { isActive: overviewActive } = keepAlive
  const { tableOptions, loadingTables, loadTables } = useSignalTableOptions('traces', overviewActive)

  /**
   * Route every service once per table load; the click itself is a memory lookup. The
   * service universe is the whole current time window (one DISTINCT query), not just the
   * loaded page — so auto mappings show up in settings for every service at once.
   */
  const resolveServiceTargets = async () => {
    const pageServices = rows.value.map((row) => row.service_name).filter(Boolean)
    const windowServices = await fetchTraceServices(ctx)
    const resolution = await resolveTraceLogsForServices(ctx, [...windowServices, ...pageServices])
    logsTargets.value = resolution.targets
    logsAmbiguous.value = resolution.ambiguous
    logsMultiTable.value = resolution.multiTable
  }

  const tracesTabTitle = computed(() => {
    if (selectedRedMetric.value === 'errors') {
      return t('drilldown.traces.erroredTracesTab')
    }
    if (selectedRedMetric.value === 'duration') {
      return t('drilldown.traces.slowTracesTab')
    }
    return t('drilldown.traces.tracesTab')
  })

  const tableQueryState = computed<QueryState>(() => ({
    table: ctx.tracesTable.value || '',
    orderBy: 'DESC',
    limit: 100,
    tsColumn: { name: 'timestamp', data_type: 'TimestampNanosecond' },
    editorType: 'builder',
    database: ctx.tracesDatabase.value,
  }))

  watch(
    () => ctx.tracesTable.value,
    (value) => {
      tracesTable.value = value
    }
  )

  watch(tracesDatabase, () => {
    if (overviewActive.value) {
      loadTables()
    }
  })

  watch(
    () => ctx.focusTraceId.value,
    (value) => {
      if (value && value !== traceIdDraft.value) {
        traceIdDraft.value = value
      }
      if (!value) {
        traceIdDraft.value = ''
      }
    },
    { immediate: true }
  )

  const loadRows = async () => {
    if (!overviewActive.value || ctx.focusTraceId.value) {
      return
    }
    if (!ctx.tracesTable.value) {
      rows.value = []
      columns.value = []
      return
    }
    // Schema bind is async: without it, dotted filter keys (`resource_attributes.service.name`)
    // would be misread as JSON-chip paths instead of the flattened physical columns
    // trace tables actually use, producing SQL the server rejects.
    if (!ctx.signalColumns.value.traces?.length) {
      return
    }
    loading.value = true
    try {
      const result = await fetchRootSpanList(ctx, { redMetric: selectedRedMetric.value })
      rows.value = result.rows
      columns.value = result.columns
      await resolveServiceTargets()
    } finally {
      loading.value = false
    }
  }

  keepAlive.setResume(() => {
    loadTables()
    loadRows()
    ctx.triggerRefresh()
  })

  const onTableChange = async (table: string) => {
    if (!table || table === ctx.tracesTable.value) {
      return
    }
    if (!tableOptions.value.includes(table)) {
      tableOptions.value = [...tableOptions.value, table]
    }
    // Declared service identity wins over the v1 model column when the table has one.
    // Declared service identity wins over the v1 model column when the table has one;
    // binding also refreshes entity/column context for cross-signal filters.
    const { serviceRef } = await bindSignalTable(ctx, 'traces', table)
    const nextMap = buildDefaultTracesFieldMap({ serviceColumn: physicalServiceColumn(serviceRef) })
    const settings = loadDrilldownSettings(ctx.tracesDatabase.value)
    settings.traces = { ...(settings.traces || {}), table }
    saveDrilldownSettings(settings, ctx.tracesDatabase.value)
    ctx.filters.value = ctx.filters.value.filter((filter) => Boolean(resolveFieldMapColumn(filter.key, nextMap)))
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      traces: nextMap,
    }
    ctx.tracesTable.value = table
    ctx.triggerRefresh()
  }

  const openTrace = (traceId: string) => {
    ctx.openTraceGantt(String(traceId || ''))
  }

  // Roles resolve from settings + the runtime map (see resolveLogsRoles), so the "open logs"
  // affordance shows even while the logs field map is still being built.
  const logsTraceEnabled = computed(() => {
    const roles = resolveLogsRoles(ctx)
    const hasOriginalAssociation = Boolean(roles.traceId || roles.trace_id)
    const mappings = loadDrilldownSettings(ctx.tracesDatabase.value).traces.traceLogsMappings ?? []
    void traceLogsMappingsVersion.value // eslint-disable-line no-void -- track settings version
    return hasOriginalAssociation || mappings.length > 0 || Boolean(ctx.logsTable.value)
  })

  const openLogsForTrace = (payload: string | { traceId: string; service?: string }) => {
    const traceId = typeof payload === 'string' ? payload : payload?.traceId
    const service = typeof payload === 'string' ? '' : payload?.service || ''
    // Pre-resolved at table load (resolveServiceTargets); ambiguous/unknown services fall
    // back to the Logs page binding, with the ambiguity surfaced in the menu.
    const target = service ? logsTargets.value[service] : undefined
    const enhancedTarget =
      target && target.source !== 'current' ? { database: target.database, table: target.table } : undefined
    ctx.openLogsForTrace(String(traceId || ''), enhancedTarget)
  }

  const submitTraceId = () => {
    const trimmed = traceIdDraft.value.trim()
    if (!trimmed) {
      ctx.closeTraceGantt()
      return
    }
    ctx.openTraceGantt(trimmed)
  }

  const clearTraceId = () => {
    ctx.closeTraceGantt()
  }

  const onFilterConditionAdd = (payload: { columnName: string; operator: string; value: unknown }) => {
    const key = payload.columnName?.trim()
    const value = String(payload.value ?? '').trim()
    if (!key || !value) {
      return
    }
    const op = isDrilldownFilterOp(payload.operator) ? payload.operator : '='
    ctx.appendFilter({ key, op, value })
  }

  watch(
    () => [
      ctx.refreshKey.value,
      ctx.filters.value,
      ctx.time.value,
      ctx.rangeTime.value,
      ctx.tracesTable.value,
      selectedRedMetric.value,
      ctx.focusTraceId.value,
    ],
    () => {
      loadRows()
    },
    { deep: true }
  )

  onMounted(async () => {
    await loadTables()
    await loadRows()
  })
</script>

<style scoped lang="less">
  .traces-home {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    gap: 0;
    min-height: 0;
    overflow: hidden;
  }

  .trace-id-input {
    width: 260px;
    max-width: 100%;
  }

  .trace-id-prefix {
    font-size: var(--gpt-font-sm);
    font-weight: var(--gpt-font-weight-control);
    color: var(--gpt-text-muted);
  }

  :deep(.arco-alert) {
    width: fit-content;
    max-width: calc(100% - var(--gpt-page-padding-x) * 2);
    margin: var(--gpt-gap-lg) var(--gpt-page-padding-x);
  }

  .traces-home-body {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .traces-red-main {
    flex-shrink: 0;
    padding: var(--gpt-gap-lg) var(--gpt-page-padding-x);
    border-bottom: 1px solid var(--gpt-border-default);
  }

  .red-triptych {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--gpt-gap-lg);
  }

  @media (max-width: 900px) {
    .red-triptych {
      grid-template-columns: 1fr;
    }
  }

  .traces-home-tabs {
    flex: 1;
    min-height: 0;
  }

  .traces-home-tabs :deep(.arco-tabs-content) {
    padding: 0;
  }

  .traces-home-tabs :deep(.arco-tabs-content-item) {
    overflow: auto;
    overflow-anchor: none;
  }

  .breakdown-tab-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .traces-tab-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .traces-embed-table {
    flex: 1;
    min-height: 0;
    border-radius: 0;
    box-shadow: none;

    :deep(> .arco-card-body) {
      padding: 0;
    }

    :deep(> .arco-card-header) {
      padding: var(--gpt-gap-md) var(--gpt-page-padding-x);
      border-bottom: 1px solid var(--gpt-border-default);
      background: var(--gpt-table-toolbar-bg);
    }
  }
</style>
