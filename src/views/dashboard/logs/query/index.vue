<template lang="pug">
.query-layout.query-layout--stack.logs-query-container.query-container.drilldown-body
  .page-header.gpt-page-header
    | {{ $t('menu.dashboard.logsQuery') }}
  .content-wrapper.query-layout-cards
    a-card(:bordered="false")
      .toolbar
        a-radio-group(
          type="button"
          size="medium"
          :model-value="editorType"
          @update:modelValue="(val) => (editorType = val)"
        )
          a-radio(value="builder") {{ $t('logsQuery.builder') }}
          a-radio(value="text") {{ $t('logsQuery.code') }}
        TimeRangeSelect(
          button-type="outline"
          button-size="medium"
          :time-length="time"
          :time-range="rangeTime"
          @update:time-length="(val) => (time = val)"
          @update:time-range="(val) => (rangeTime = val)"
        )
        a-button(
          type="primary"
          size="medium"
          :loading="queryLoading"
          @click="handleQuery"
        )
          template(#icon)
            icon-loading(v-if="queryLoading" spin)
            icon-play-arrow(v-else)
          | {{ $t('dashboard.run') }}
        a-checkbox.gpt-toolbar-checkbox(
          size="medium"
          :model-value="refresh"
          @update:modelValue="(val) => (refresh = val)"
        )
          | {{ $t('logsQuery.live') }}
        a-space(style="margin-left: auto")
          a-button(
            type="outline"
            size="medium"
            :disabled="!queryState.table || queryLoading"
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
          signal-database-kind="logs"
          :storage-key="LOGS_QUERY_STORAGE_KEY"
          :form-state="builderFormState"
          :default-form-state="defaultFormState"
        )
        SqlTextEditor(
          v-if="editorType === 'text'"
          v-model="textEditor.textEditorState.sql"
          @update:sql-info="handleSqlInfoUpdate"
        )

    .gpt-divider-band

    ChartContainer(
      ref="chartContainerRef"
      :columns="columns"
      :rows="rows"
      :query-state="queryState"
      @timeRangeUpdate="handleTimeRangeUpdate"
    )

    .gpt-divider-band

    a-card(:bordered="false")
      template(#title)
        a-space
          span.results-header
            span {{ $t('logsQuery.results') }}
            span.results-count(v-if="rows.length > 0 || totalRowCount !== null")
              |
              | (
              template(v-if="totalRowCount !== null")
                | {{ rows.length }}/{{ totalRowCount }}
              template(v-else)
                | {{ rows.length }}
              | &nbsp; {{ $t('logsQuery.rowsInCurrentRange') }}
              | )
          a-checkbox(v-model="mergeColumn" type="button" size="small")
            | {{ $t('logsQuery.singleColumn') }}
          a-checkbox(
            v-if="mergeColumn"
            v-model="showKeys"
            type="button"
            size="small"
          )
            | {{ $t('logsQuery.showKeys') }}
          a-checkbox(v-model="compactRows" type="button" size="small")
            | {{ $t('logsQuery.compactRows') }}
          a-checkbox(v-model="wrap" size="small")
            span {{ $t('logsQuery.wrapLines') }}

      template(#extra)
        a-space
          a-trigger(
            v-if="columns && columns.length"
            trigger="click"
            size="small"
            :unmount-on-close="false"
          )
            a-button(type="text")
              span.gpt-text-secondary {{ $t('logsQuery.columns') }}
              span.gpt-text-secondary(v-if="hiddenColumnCount" style="margin-left: 6px; font-size: 12px") · {{ $t('logsQuery.hiddenColumnsHint', { count: hiddenColumnCount }) }}
            template(#content)
              a-card.gpt-popover-panel.gpt-popover-panel--wide
                ColumnLayoutPanel(
                  :ordered-names="orderedSelectableColumnNames"
                  :visible-names="visibleSelectableColumnNames"
                  @update:ordered-names="onPanelOrder"
                  @update:visible-names="onPanelVisible"
                )
      LogTableData(
        :key="`${queryState.table}-${columnModeKey}`"
        :wrap-line="wrap"
        :size="size"
        :data="rows"
        :columns="columns"
        :loading="queryLoading"
        :has-more="hasMore"
        :loading-more="loadingMore"
        :sql-mode="queryState.editorType"
        :ts-column="queryState.tsColumn"
        :column-mode="columnMode"
        :displayed-columns="visibleColumnNames"
        :column-drag="columnMode === 'separate'"
        :pinned-column-fields="timestampColumnName ? [timestampColumnName] : []"
        :trace-id-column="traceIdColumn"
        @trace-click="openTrace"
        @filter-condition-add="handleFilterConditionAdd"
        @reach-end="loadMore"
        @column-order-change="handleColumnOrderChange"
      )

    ExportModal(v-model:visible="exportModalVisible" :sql="exportSqlText" @confirm="handleExportConfirm")
    TraceDetailDrawer(
      popup-container=".logs-query-container"
      :parent-label="$t('menu.dashboard.logsQuery')"
      :empty-text="traceEmptyText"
      :trace-id="traceDrawerId"
      :target="traceDrawerTarget"
      @close="closeTraceDrawer"
    )
</template>

<script setup lang="ts">
  import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
  import { useRoute } from 'vue-router'
  import { Message } from '@arco-design/web-vue'
  import { useI18n } from 'vue-i18n'
  import SQLBuilder from '@/components/sql-builder/index.vue'
  import SqlTextEditor from '@/components/sql-text-editor/index.vue'
  import { replaceTimePlaceholders } from '@/utils/sql'
  import { isQueryGuideEnabled } from '@/utils/query-guide-enabled'
  import useLogsTablePrefs from '@/observability/use-logs-table-prefs'
  import { getSignalDatabase } from '@/observability/signal-database'
  import { LOGS_QUERY_STORAGE_KEY, writeQueryTable } from '@/observability/query-table-pref'
  import { findTraceIdColumn, resolveTraceDetailTarget } from '@/observability/traces/open-trace-from-log'
  import useTraceDrawerUrlSync from '@/observability/traces/use-trace-drawer-url-sync'
  import TraceDetailDrawer from '@/views/dashboard/traces/components/TraceDetailDrawer.vue'
  import ColumnLayoutPanel from '@/components/column-layout-panel/ColumnLayoutPanel.vue'
  import ChartContainer from './ChartContainer.vue'
  import ExportModal from './ExportModal.vue'
  import LogTableData from './LogsTable.vue'

  defineOptions({
    name: 'LogsQuery',
  })

  const route = useRoute()
  const { t } = useI18n()
  const isLogsQueryRoute = () => route.name === 'log-query'
  // Guide step switching is browse-only. Preserve the normal page's initial auto query,
  // but in guide mode wait for the guide's explicit "Run query" action (`tourApply`).
  const shouldAutoExecuteInitialQuery = () => !isQueryGuideEnabled() || Boolean(route.query.tourApply)
  const timeRange = useTimeRange()
  const { rangeTime, time, timeRangeValues } = timeRange

  const builder = useSqlBuilderHook({
    timeRangeValues,
    // Text mode has no DB selector; start it on the same per-signal DB as the builder.
    defaultFormState: { database: getSignalDatabase('logs') },
  })
  const { builderFormState, addFilterCondition, generateSql, defaultFormState } = builder

  const textEditor = useTextEditorState()

  const {
    editorType,
    executeQuery,
    loadMore,
    exportToCSV,
    queryState,
    loading: queryLoading,
    loadingMore,
    hasMore,
    columns,
    rows,
    totalRowCount,
    canExecuteInitialQuery,
  } = useQueryExecution(builder, textEditor, timeRange)
  // 5. URL sync
  const urlSync = useQueryUrlSync({
    builderFormState,
    textEditorState: textEditor.textEditorState,
    timeRange,
    editorType,
  })

  const { initializeFromQuery, updateQueryParams, isApplyingLocalUrlUpdate } = urlSync
  initializeFromQuery()

  // Local UI state — shared with drilldown logs detail table.
  const {
    mergeColumn,
    showKeys,
    compactRows,
    wrap,
    size,
    columnMode,
    columnModeKey,
    hiddenColumnsFor,
    displayedColumnsFor,
    orderedColumnsFor,
    setColumnLayout,
    setVisibleColumns,
    setColumnOrder,
  } = useLogsTablePrefs(() => queryState.table || '')

  const columnNames = computed(() => columns.value.map((column) => column.name))
  // The logs table pins the timestamp column first; it is not a configurable column.
  const timestampColumnName = computed(
    () =>
      queryState.tsColumn?.name ||
      columns.value.find((column) => column.data_type?.toLowerCase().includes('timestamp'))?.name ||
      ''
  )
  // A `trace_id` column makes every value a link to the Trace detail page. The log row only
  // claims a trace (no foreign key), so existence is checked by the detail page itself.
  const traceIdColumn = computed(() => findTraceIdColumn(columns.value))

  // Trace detail opens as a drawer over this page, so the Logs Query stays mounted. The drawer
  // state lives in the URL query (not the path), so a refresh reopens it next to the list.
  const {
    traceId: traceDrawerId,
    target: traceDrawerTarget,
    open: openTraceDrawer,
    close: closeTraceDrawer,
  } = useTraceDrawerUrlSync('log-query')

  /**
   * Publish the table this page just queried, so the Traces Query page reads the same trace
   * table from the Logs → trace link. Code mode has no SQLBuilder, so this is the only writer
   * in that mode. Any defaulting (first table in the list) stays inside the page, never in the
   * link: the link only follows what the page published.
   */
  function publishQueryTable() {
    if (!queryState.table || !queryState.database) return
    writeQueryTable(LOGS_QUERY_STORAGE_KEY, queryState.database, queryState.table)
  }

  function openTrace(traceId: string, row?: Record<string, unknown>) {
    const id = String(traceId || '').trim()
    if (!id) return
    const anchor = timestampColumnName.value ? row?.[timestampColumnName.value] : undefined
    const target = resolveTraceDetailTarget(anchor)
    if (!target) {
      Message.warning(t('logsQuery.traceNoTable', { page: t('menu.dashboard.traces') }))
      return
    }
    openTraceDrawer(id, target)
  }

  // Shown when the trace has no spans in the target table: says where to pick the table.
  const traceEmptyText = computed(() => {
    const target = traceDrawerTarget.value
    if (!target) return undefined
    const label = target.database ? `${target.database}.${target.table}` : target.table
    return t('logsQuery.traceNotFound', { target: label, page: t('menu.dashboard.traces') })
  })

  const selectableColumnNames = computed(() => columnNames.value.filter((name) => name !== timestampColumnName.value))
  // DataGrid always pins ts via tsColumn; stored layout covers selectable columns only.
  const visibleColumnNames = computed(() => {
    const ts = timestampColumnName.value
    const selectable = displayedColumnsFor(selectableColumnNames.value)
    return ts ? [ts, ...selectable.filter((name) => name !== ts)] : selectable
  })
  const visibleSelectableColumnNames = computed(() => displayedColumnsFor(selectableColumnNames.value))
  // Panel order covers hidden columns too, so their order can be dragged and kept.
  const orderedSelectableColumnNames = computed(() => orderedColumnsFor(selectableColumnNames.value))
  const hiddenColumnCount = computed(() => hiddenColumnsFor(selectableColumnNames.value).length)

  function onPanelOrder(names: string[]) {
    setColumnLayout(selectableColumnNames.value, names, visibleSelectableColumnNames.value)
  }

  function onPanelVisible(names: string[]) {
    setVisibleColumns(selectableColumnNames.value, names)
  }

  function handleColumnOrderChange(fields: string[]) {
    setColumnOrder(selectableColumnNames.value, fields)
  }

  const chartContainerRef = ref()
  const refresh = ref(false)
  function handleQuery(newQuery: boolean | MouseEvent = true) {
    // A query can still be in flight when the user navigates away. Its completion must
    // not replace the next route's query params with this page's builder state.
    if (!isLogsQueryRoute()) return

    // If called from click event, newQuery will be a MouseEvent, so default to true
    const isNewQuery = typeof newQuery === 'boolean' ? newQuery : true

    executeQuery(isNewQuery).then(() => {
      if (!isLogsQueryRoute()) return
      if (isNewQuery) {
        updateQueryParams()
        publishQueryTable()
      }
    })

    nextTick(() => {
      chartContainerRef.value?.triggerCurrentChartQuery()
    })
  }

  // Same-route tutorial click: form sync alone does not re-fire canExecuteInitialQuery.
  watch(
    () => [route.query.builderForm, route.query.tourApply] as const,
    (next, prev) => {
      if (!isLogsQueryRoute()) return
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
  // Export modal state
  const exportModalVisible = ref(false)
  const exportSqlText = ref('')

  async function exportSql() {
    if (!queryState.sql || !queryState.table) {
      return
    }

    // Get current SQL with time placeholders replaced
    const currentTimeRanges = timeRange.timeRangeValues.value
    const currentSql = replaceTimePlaceholders(queryState.sql, currentTimeRanges)

    // Set modal state with SQL (ExportModal will handle formatting and limit extraction)
    exportSqlText.value = currentSql
    exportModalVisible.value = true
  }

  async function handleExportConfirm(limit: number, formattedSql: string) {
    try {
      await exportToCSV(limit)
      exportModalVisible.value = false
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  // Live query logic
  let refreshTimeout: number | undefined = -1
  function mayRefresh() {
    if (refresh.value) {
      handleQuery(false)
      refreshTimeout = window.setTimeout(() => {
        mayRefresh()
      }, 3000)
    } else {
      clearTimeout(refreshTimeout)
    }
  }

  watch(refresh, (newValue) => {
    if (newValue) {
      mayRefresh()
    } else {
      clearTimeout(refreshTimeout)
    }
  })

  // Stop Live polling when leaving the page.
  onBeforeUnmount(() => {
    clearTimeout(refreshTimeout)
  })

  // Chart/row logic
  function handleTimeRangeUpdate(newTimeRange) {
    time.value = 0 // Switch to custom mode
    rangeTime.value = newTimeRange
    executeQuery()
    nextTick(() => {
      chartContainerRef.value?.triggerCurrentChartQuery()
    })
  }

  function handleFilterConditionAdd({ columnName, operator, value }) {
    addFilterCondition(columnName, operator, value)
  }

  function handleSqlInfoUpdate(sqlInfo) {
    Object.assign(textEditor.textEditorState, sqlInfo)
  }

  watch(
    canExecuteInitialQuery,
    (canExecute) => {
      if (!canExecute || !shouldAutoExecuteInitialQuery()) return
      nextTick(() => {
        handleQuery()
      })
    },
    { immediate: true }
  )
</script>

<style lang="less">
  @import '@/assets/style/query-layout.less';

  .results-count {
    color: var(--gpt-text-muted);
    font-size: var(--gpt-font-base);
    font-weight: normal;
  }
</style>
