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
          v-model:form-state="builderFormState"
          table-filter="trace_id"
          storage-key="traces-query-table"
          :time-range-values="timeRangeValues"
          :default-conditions="[{ field: 'parent_span_id', operator: 'Not Exist', value: '', relation: 'AND' }]"
          :quick-field-names="['trace_id', 'service_name']"
          @update:sql="handleBuilderSqlUpdate"
        )
        SqlTextEditor(v-else v-model="editorSql" @update:sql-info="handleSqlInfoUpdate")

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
          :sql="queryState.sql"
          :time-range="queryState.rangeTime"
          :table-name="queryState.tableName"
          :ts-column="queryState.tsColumn"
          :time="queryState.time"
          @time-range-update="handleTimeRangeUpdate"
        )
    TraceTable(
      :data="allResults"
      :columns="columns"
      :loading="loading"
      :table-name="queryState.tableName"
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
  import SqlTextEditor from '@/components/sql-text-editor/index.vue'
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
    time,
    rangeTime,
    timeRangeValues,
    builderFormState,
    queryState,
    finalQuery,
    tsColumn,
  } = storeToRefs(tracesStore)

  // Local state for query results (not stored in store)
  const allResults = ref([])

  // Chart expanded state with localStorage persistence (component-specific)
  const chartExpanded = useLocalStorage('trace-chart-expanded', true)

  // Get store methods
  const { initializeFromQuery, executeQuery, exportToCSV, addFilterCondition } = tracesStore
  const { editorTsColumn, editorTableName } = storeToRefs(useTracesQueryStore())
  const countChartRef = ref()
  const sqlBuilderRef = ref()
  const timeRangeSelectRef = ref()

  // Check if all required values are available for initial query
  const canExecuteInitialQuery = computed(() => {
    if (editorType.value === 'builder') {
      return finalQuery.value && tsColumn.value && builderFormState.value?.table
    }
    return editorTsColumn.value && editorTableName.value
  })

  // Track if we've already executed the initial query
  const hasExecutedInitialQuery = ref(false)

  // Handle SQL builder updates
  function handleBuilderSqlUpdate(sql: string) {
    // Note: builderSql is now computed from builderFormState, so this method is for compatibility
    // The actual SQL generation happens in the base store
  }

  // Handle format SQL - removed since SqlTextEditor doesn't have format functionality
  function handleFormatSQL() {
    // Format functionality not available in SqlTextEditor
    console.warn('Format SQL functionality not available in SqlTextEditor')
  }

  // Handle SQL info updates from SqlTextEditor
  function handleSqlInfoUpdate(sqlInfo: { tableName: string; tsColumn: any }) {
    editorTableName.value = sqlInfo.tableName
    editorTsColumn.value = sqlInfo.tsColumn
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
    time.value = 0 // Switch to custom mode
    rangeTime.value = newTimeRange
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

  // Watch for when all async values are available
  watch(canExecuteInitialQuery, (canExecute) => {
    if (canExecute && !hasExecutedInitialQuery.value) {
      console.log('All async values available for initial query:')
      console.log('tsColumn:', tsColumn.value)
      console.log('finalQuery:', finalQuery.value)
      console.log('tableName:', queryState.value.tableName)

      // Validate SQL before executing - only in editor mode
      if (editorType.value === 'text') {
        const validation = validateSQL(finalQuery.value)
        if (!validation.isValid) {
          console.error('SQL validation failed:', validation.error)
          return
        }
      }

      hasExecutedInitialQuery.value = true
      handleQuery()
    }
  })

  initializeFromQuery()
</script>

<style lang="less">
  @import '@/assets/style/query-layout.less';

  // No traces-specific styles needed - all moved to shared CSS
</style>
