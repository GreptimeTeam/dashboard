<template lang="pug">
.query-layout.trace-query-container.query-container
  .page-header
    | Traces
  .content-wrapper.query-layout-cards
    a-card(:bordered="false")
      .toolbar
        a-space
          a-radio-group(v-model="editorType" type="button")
            a-radio(value="builder") Builder
            a-radio(value="text") Text
          TimeRangeSelect(
            ref="timeRangeSelectRef"
            v-model:time-length="time"
            v-model:time-range="rangeTime"
            button-type="outline"
          )
          a-button(
            type="primary"
            size="small"
            :loading="loading"
            @click="handleQuery"
          ) 
            template(#icon)
              icon-loading(v-if="loading" spin)
              icon-play-arrow(v-else)
            | {{ $t('dashboard.runQuery') }}

        a-space
          a-button(
            type="outline"
            size="small"
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
          v-model:form-state="builderFormState"
          table-filter="trace_id"
          storage-key="traces-query-table"
          :default-conditions="[{ field: 'parent_span_id', operator: 'Not Exist', value: '', relation: 'AND' }]"
          :quick-field-names="['trace_id', 'service_name']"
        )
        SqlTextEditor(v-else v-model="textEditor.textEditorState.sql" @update:sql-info="handleSqlInfoUpdate")

    a-card(v-if="queryState.sql || textEditor.textEditorState.sql" :bordered="false")
      template(#title)
        .chart-header
          span Trace Count Over Time
          a-button(type="text" size="small" @click="handleChartToggle")
            template(#icon)
              icon-down(v-if="chartExpanded")
              icon-right(v-else)
      template(v-if="chartExpanded")
        CountChart(ref="countChartRef" :query-state="queryState" @timeRangeUpdate="handleTimeRangeUpdate")
    TraceTable(
      :data="allResults"
      :columns="columns"
      :loading="loading"
      :query-state="queryState"
      @filterConditionAdd="handleFilterConditionAdd"
    )
</template>

<script setup name="TraceQuery" lang="ts">
  import { ref, computed, watch, nextTick, onMounted } from 'vue'
  import { useLocalStorage } from '@vueuse/core'
  import { IconCode, IconDown, IconRight, IconDownload } from '@arco-design/web-vue/es/icon'
  import SQLBuilder from '@/components/sql-builder/index.vue'
  import SqlTextEditor from '@/components/sql-text-editor/index.vue'
  import TraceTable from './components/TraceTable.vue'

  // 1. Time range state
  const timeRange = useTimeRange()
  const { rangeTime, time, timeRangeValues } = timeRange

  // 2. Builder form state
  const builder = useSqlBuilderHook({ storageKey: 'traces-query-table', timeRangeValues })
  const { builderFormState, addFilterCondition, generateSql } = builder

  // 3. Text editor state
  const textEditor = useTextEditorState(timeRangeValues)

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
  const { initializeFromQuery, updateQueryParams } = urlSync

  const allResults = ref([])
  const chartExpanded = useLocalStorage('trace-chart-expanded', true)
  const countChartRef = ref()
  const sqlBuilderRef = ref()
  const timeRangeSelectRef = ref()

  function handleSqlInfoUpdate(sqlInfo) {
    Object.assign(textEditor.textEditorState, sqlInfo)
  }

  function exportSql() {
    exportToCSV()
  }

  async function handleQuery() {
    const results = await executeQuery()
    allResults.value = results || []
    if (chartExpanded.value && countChartRef.value && queryState.sql) {
      countChartRef.value.executeCountQuery()
    }
    updateQueryParams()
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

  function handleFilterConditionAdd({ columnName, operator, value }) {
    if (sqlBuilderRef.value && sqlBuilderRef.value.addFilterCondition) {
      sqlBuilderRef.value.addFilterCondition(columnName, operator, value)
    } else {
      addFilterCondition(columnName, operator, value)
    }
  }

  watch(canExecuteInitialQuery, (canExecute) => {
    if (canExecute) {
      handleQuery()
    }
  })

  onMounted(() => {
    initializeFromQuery()
  })
</script>

<style lang="less">
  @import '@/assets/style/query-layout.less';

  // No traces-specific styles needed - all moved to shared CSS
</style>
