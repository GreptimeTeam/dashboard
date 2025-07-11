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
            v-model:time-length="timeLength"
            v-model:time-range="timeRange"
            @update:time-range-values="handleTimeRangeValuesUpdate"
          )
          a-button(type="primary" size="small" @click="handleQuery") {{ $t('dashboard.runQuery') }}
          a-button(
            v-if="editorType === 'text'"
            type="outline"
            size="small"
            @click="handleFormatSQL"
          )
            template(#icon)
              icon-code
            | Format
        a-space
          a-button(
            type="outline"
            size="small"
            :disabled="!finalQuery || loading"
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
          v-model:form-state="currentBuilderFormState"
          table-filter="trace_id"
          :time-range-values="timeRangeValues"
          :default-conditions="[{ field: 'parent_span_id', operator: 'Not Exist', value: '', relation: 'AND' }]"
          @update:sql="handleBuilderSqlUpdate"
        )
        SQLEditor(
          v-else
          ref="sqlEditorRef"
          v-model="editorSql"
          editor-height="140px"
          placeholder="Enter your SQL query here..."
          :show-toolbar="true"
        )

    a-card(v-if="builderSql || editorSql" :bordered="false")
      template(#title)
        .chart-header
          span Trace Count Over Time
          a-button(type="text" size="small" @click="handleChartToggle")
            template(#icon)
              icon-down(v-if="chartExpanded")
              icon-right(v-else)
      template(v-if="chartExpanded")
        CountChart(
          ref="countChartRef"
          :sql="finalQuery"
          :time-length="timeLength"
          :time-range="timeRange"
          :table-name="tableName"
          :ts-column="{ name: 'timestamp', multiple: 1000000000 }"
          @time-range-update="handleTimeRangeUpdate"
        )
    TraceTable(
      :data="allResults"
      :columns="columns"
      :loading="loading"
      :table-name="tableName"
      :editor-type="editorType"
      @filterConditionAdd="handleFilterConditionAdd"
    )
</template>

<script setup name="TraceQuery" lang="ts">
  import { ref, computed, watch, nextTick } from 'vue'
  import { useLocalStorage, watchOnce } from '@vueuse/core'
  import { IconCode, IconDown, IconRight, IconDownload } from '@arco-design/web-vue/es/icon'
  import { storeToRefs } from 'pinia'
  import { relativeTimeMap, relativeTimeOptions } from '@/views/dashboard/config'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'
  import SQLBuilder from '@/components/sql-builder/index.vue'
  import CountChart from '@/components/count-chart/index.vue'
  import useTracesQueryStore from '@/store/modules/traces-query'
  import SQLEditor from './components/SQLEditor.vue'
  import TraceTable from './components/TraceTable.vue'
  import { validateSQL } from './utils'

  const tracesStore = useTracesQueryStore()

  // Get reactive refs from store
  const {
    editorType,
    builderSql,
    editorSql,
    loading,
    columns,
    time: timeLength,
    rangeTime: timeRange,
    timeRangeValues,
    builderFormState: currentBuilderFormState,
    currentTableName: tableName,
    finalQuery,
  } = storeToRefs(tracesStore)

  // Local state for query results (not stored in store)
  const allResults = ref([])

  // Chart expanded state with localStorage persistence (component-specific)
  const chartExpanded = useLocalStorage('trace-chart-expanded', true)

  // Get store methods
  const {
    initializeFromQuery,
    executeQuery,
    exportToCSV,
    updateBuilderSql,
    updateTimeRangeValues,
    addFilterCondition,
  } = tracesStore

  const countChartRef = ref()
  const sqlEditorRef = ref()
  const sqlBuilderRef = ref()
  const timeRangeSelectRef = ref()

  const hasTimeLimit = computed(() => timeLength.value > 0 || timeRange.value.length > 0)

  // Handler for TimeRangeSelect updates
  function handleTimeRangeValuesUpdate(newTimeRangeValues: string[]) {
    updateTimeRangeValues(newTimeRangeValues)
  }

  // Handle SQL builder updates
  function handleBuilderSqlUpdate(sql: string) {
    updateBuilderSql(sql)
  }

  // Handle format SQL
  function handleFormatSQL() {
    if (sqlEditorRef.value) {
      sqlEditorRef.value.formatSQL()
    }
  }

  // Note: editorSql generation when switching to text mode is now handled by the base store

  // Export traces as CSV - use store method
  function exportSql() {
    exportToCSV()
  }

  async function handleQuery() {
    const results = await executeQuery()
    allResults.value = results || []

    // Trigger count chart query only if chart is expanded
    if (chartExpanded.value && countChartRef.value && finalQuery.value) {
      countChartRef.value.executeCountQuery()
    }
  }

  function handleTimeRangeUpdate(newTimeRange: string[]) {
    timeLength.value = -1 // Switch to custom mode
    timeRange.value = newTimeRange
    handleQuery() // Re-run query with new time range
  }

  // Handle chart expansion/collapse
  function handleChartToggle() {
    chartExpanded.value = !chartExpanded.value

    // Trigger chart data fetch when expanding
    if (chartExpanded.value && finalQuery.value) {
      nextTick(() => {
        countChartRef.value.executeCountQuery()
      })
    }
  }

  // Handle filter condition from table context menu
  function handleFilterConditionAdd({ columnName, operator, value }) {
    // Try to use SQLBuilder component method first (for immediate UI update)
    if (sqlBuilderRef.value && sqlBuilderRef.value.addFilterCondition) {
      sqlBuilderRef.value.addFilterCondition(columnName, operator, value)
    } else {
      // Fallback to store method (for consistent state management)
      addFilterCondition(columnName, operator, value)
    }
  }

  watchOnce(finalQuery, () => {
    if (finalQuery.value) {
      // Validate SQL before executing - only in editor mode
      if (editorType.value === 'text') {
        const validation = validateSQL(finalQuery.value)
        if (!validation.isValid) {
          console.error('SQL validation failed:', validation.error)
          // You can add a toast notification or other user feedback here
          return
        }
      }

      nextTick(() => {
        handleQuery()
      })
    }
  })
  initializeFromQuery()
</script>

<style lang="less" scoped>
  @import '@/assets/style/query-layout.less';

  // No traces-specific styles needed - all moved to shared CSS
</style>
