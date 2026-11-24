<template lang="pug">
.query-layout.query-layout--stack.trace-query-container.query-container.drilldown-body
  .page-header.gpt-page-header
    | {{ $t('menu.dashboard.traces') }}
  .content-wrapper.query-layout-cards
    a-card(:bordered="false")
      .toolbar
        a-radio-group(v-model="editorType" type="button" size="medium")
          a-radio(value="builder") {{ $t('logsQuery.builder') }}
          a-radio(value="text") {{ $t('logsQuery.code') }}
        TimeRangeSelect(
          ref="timeRangeSelectRef"
          v-model:time-length="time"
          v-model:time-range="rangeTime"
          button-type="outline"
          button-size="medium"
        )
        a-button(
          type="primary"
          size="medium"
          :loading="loading"
          @click="handleQuery"
        )
          template(#icon)
            icon-loading(v-if="loading" spin)
            icon-play-arrow(v-else)
          | {{ $t('dashboard.run') }}
        a-space(style="margin-left: auto")
          a-button(
            type="outline"
            size="medium"
            :disabled="!queryState.sql || loading"
            @click="exportSql"
          )
            template(#icon)
              svg.icon
                use(href="#export")
            | {{ $t('dashboard.exportCSV') }}

      .sql-container
        SQLBuilder(
          v-if="editorType === 'builder'"
          ref="sqlBuilderRef"
          remember-table
          signal-database-kind="traces"
          :storage-key="TRACES_QUERY_STORAGE_KEY"
          :tables-provider="traceTablesProvider"
          :form-state="builderFormState"
          :default-form-state="defaultFormState"
        )
        SqlTextEditor(v-else v-model="textEditor.textEditorState.sql" @update:sql-info="handleSqlInfoUpdate")

    .gpt-divider-band

    a-card(v-if="queryState.sql || textEditor.textEditorState.sql" :bordered="false")
      template(#title)
        .chart-header
          span {{ $t('logsQuery.rowCountOverTime') }}
          a-button(type="text" size="small" @click="handleChartToggle")
            template(#icon)
              icon-down(v-if="chartExpanded")
              icon-right(v-else)
      template(v-if="chartExpanded")
        .chart-content
          CountChart(ref="countChartRef" :query-state="queryState" @timeRangeUpdate="handleTimeRangeUpdate")

    .gpt-divider-band

    TraceTable(
      :data="allResults"
      :columns="columns"
      :loading="loading"
      :query-state="queryState"
      @filterConditionAdd="handleFilterConditionAdd"
      @trace-click="openTrace"
    )
    TraceDetailDrawer(
      popup-container=".trace-query-container"
      logs-trace-enabled
      :parent-label="$t('menu.dashboard.traces')"
      :trace-id="traceDrawerId"
      :target="traceDrawerTarget"
      @close="closeTraceDrawer"
      @view-logs="openLogs"
    )
    TraceLogsDrawer(
      popup-container=".trace-query-container"
      :trace-id="logsDrawerId"
      :target="logsDrawerTarget"
      @close="closeLogsDrawer"
    )
</template>

<script setup lang="ts">
  import { ref, computed, watch, nextTick, onMounted } from 'vue'
  import { IconCode, IconDown, IconRight, IconDownload } from '@arco-design/web-vue/es/icon'
  import SQLBuilder from '@/components/sql-builder/index.vue'
  import SqlTextEditor from '@/components/sql-text-editor/index.vue'
  import { isQueryGuideEnabled } from '@/utils/query-guide-enabled'
  import { getSignalDatabase } from '@/observability/signal-database'
  import { listSignalTables } from '@/observability/semantics'
  import { TRACES_QUERY_STORAGE_KEY, writeQueryTable } from '@/observability/query-table-pref'
  import useUiPref from '@/composables/use-ui-pref'
  import { Message } from '@arco-design/web-vue'
  import { useI18n } from 'vue-i18n'
  import { buildTraceDetailTarget } from '@/observability/traces/trace-detail-target'
  import resolveTraceLogsDrawerTarget from '@/observability/traces/open-logs-from-trace'
  import useTraceDrawerUrlSync from '@/observability/traces/use-trace-drawer-url-sync'
  import TraceTable from './components/TraceTable.vue'
  import TraceDetailDrawer from './components/TraceDetailDrawer.vue'
  import TraceLogsDrawer from './components/TraceLogsDrawer.vue'

  defineOptions({
    name: 'TraceQuery',
  })

  const { t } = useI18n()

  // 1. Time range state
  const timeRange = useTimeRange()
  const { rangeTime, time, timeRangeValues } = timeRange

  // 2. Builder form state
  const builder = useSqlBuilderHook({
    timeRangeValues,
    defaultFormState: {
      // Text mode has no DB selector; keep it on the per-signal DB.
      database: getSignalDatabase('traces'),
      conditions: [{ field: 'parent_span_id', operator: 'Not Exist', value: '', relation: 'AND' }],
    },
  })
  const { builderFormState, addFilterCondition, generateSql, defaultFormState } = builder

  /**
   * Trace table suggest must stay trace-capable (semantic trace declaration or a
   * physical `trace_id`). SQLBuilder filters this list locally, so it never falls back
   * to the name-only prefix/`>=` search that also offered non-trace tables.
   */
  const traceTablesProvider = () => listSignalTables('traces', { database: getSignalDatabase('traces') })

  // 3. Text editor state
  const textEditor = useTextEditorState()

  // 4. Query execution state
  const { editorType, executeQuery, exportToCSV, queryState, loading, columns, rows, canExecuteInitialQuery } =
    useQueryExecution(builder, textEditor, timeRange)

  // 5. URL sync
  const urlSync = useQueryUrlSync({
    builderFormState,
    textEditorState: textEditor.textEditorState,
    timeRange,
    editorType,
  })
  const { initializeFromQuery, updateQueryParams, isApplyingLocalUrlUpdate } = urlSync

  const chartExpanded = useUiPref('traceChartExpanded', true)
  const countChartRef = ref()
  const sqlBuilderRef = ref()
  const timeRangeSelectRef = ref()
  const route = useRoute()
  const isTraceQueryRoute = () => route.name === 'trace-query'
  // Guide browsing must not execute a default query; `tourApply` marks the explicit Run.
  const shouldAutoExecuteInitialQuery = () => !isQueryGuideEnabled() || Boolean(route.query.tourApply)
  const allResults = ref([])

  function handleSqlInfoUpdate(sqlInfo) {
    Object.assign(textEditor.textEditorState, sqlInfo)
  }

  function exportSql() {
    exportToCSV()
  }

  /**
   * Publish the table this page just queried, so the Logs Query page reads the same traces
   * table from its Logs → trace link. Code mode has no SQLBuilder, so this is the only writer
   * in that mode. Any defaulting (first table in the list) stays inside the page, never in the
   * link: the link only follows what the page published.
   */
  function publishQueryTable() {
    if (!queryState.table || !queryState.database) return
    writeQueryTable(TRACES_QUERY_STORAGE_KEY, queryState.database, queryState.table)
  }

  async function handleQuery() {
    // Keep-alive keeps this component's watchers alive after it is deactivated. Do not
    // let a cached Trace page consume query params or run while another route is active.
    if (!isTraceQueryRoute()) return

    executeQuery().then((results) => {
      if (!isTraceQueryRoute()) return
      allResults.value = results || []
      updateQueryParams()
      publishQueryTable()
    })
    // CountChart mounts only after queryState.sql is set — wait a tick for the ref.
    if (chartExpanded.value) {
      nextTick(() => {
        if (queryState.sql) {
          countChartRef.value?.executeCountQuery()
        }
      })
    }
  }

  function handleTimeRangeUpdate(newTimeRange) {
    time.value = 0 // Switch to custom mode
    rangeTime.value = newTimeRange
    handleQuery()
  }

  function handleChartToggle() {
    chartExpanded.value = !chartExpanded.value
    if (chartExpanded.value && queryState.sql) {
      nextTick(() => {
        countChartRef.value?.executeCountQuery()
      })
    }
  }

  // Trace detail opens as a drawer over this page: the page stays mounted and the drawer state
  // lives in the URL query, so a refresh reopens it next to the list.
  const {
    traceId: traceDrawerId,
    target: traceDrawerTarget,
    open: openTraceDrawer,
    close: closeTraceDrawer,
  } = useTraceDrawerUrlSync('trace-query')

  function openTrace(payload: { traceId: string; timestamp?: unknown }) {
    const traceId = String(payload?.traceId || '').trim()
    if (!traceId) return
    openTraceDrawer(
      traceId,
      buildTraceDetailTarget({
        table: queryState.table || 'spans',
        database: queryState.database,
        timestamp: payload.timestamp,
      })
    )
  }

  // Logs of the open trace stack on top of the trace drawer, also kept in the URL.
  const {
    traceId: logsDrawerId,
    target: logsDrawerTarget,
    open: openLogsDrawer,
    close: closeLogsDrawer,
  } = useTraceDrawerUrlSync('trace-query', 'logs')

  function openLogs(span: Record<string, any>) {
    const traceId = String(span?.trace_id || traceDrawerId.value || '').trim()
    if (!traceId) return
    const target = resolveTraceLogsDrawerTarget(span?.timestamp)
    if (!target) {
      Message.warning(t('drilldown.traces.traceLogsNoTable', { page: t('menu.dashboard.logsQuery') }))
      return
    }
    openLogsDrawer(traceId, target)
  }

  function handleFilterConditionAdd({ columnName, operator, value }) {
    if (sqlBuilderRef.value && sqlBuilderRef.value.addFilterCondition) {
      sqlBuilderRef.value.addFilterCondition(columnName, operator, value)
    } else {
      addFilterCondition(columnName, operator, value)
    }
  }

  watch(canExecuteInitialQuery, (canExecute) => {
    if (!canExecute || !shouldAutoExecuteInitialQuery()) return
    handleQuery()
  })

  onMounted(() => {
    initializeFromQuery()
  })

  // Same-route tutorial click: re-apply form and run (initial-query watch won't re-fire).
  watch(
    () => [route.query.builderForm, route.query.tourApply] as const,
    (next, prev) => {
      if (!isTraceQueryRoute()) return
      if (isApplyingLocalUrlUpdate()) return
      if (!prev) return
      if (next[0] === prev[0] && next[1] === prev[1]) return
      if (!next[0] && !next[1]) return
      initializeFromQuery()
      nextTick(() => {
        handleQuery()
      })
    }
  )
</script>

<style lang="less">
  @import '@/assets/style/query-layout.less';

  .chart-content {
    padding: var(--gpt-section-padding-y) var(--gpt-page-padding-x) var(--gpt-page-padding-x);
  }
</style>
