<template lang="pug">
.trace-query-container
  .page-header
    | Traces
  .content-wrapper
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
          :should-fetch="chartExpanded"
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
  import editorAPI from '@/api/editor'
  import fileDownload from 'js-file-download'
  import { relativeTimeMap, relativeTimeOptions } from '@/views/dashboard/config'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'
  import SQLBuilder from '@/components/sql-builder/index.vue'
  import useQueryUrlSync from '@/hooks/query-url-sync'
  import SQLEditor from './components/SQLEditor.vue'
  import CountChart from './components/CountChart.vue'
  import TraceTable from './components/TraceTable.vue'
  import { validateSQL } from './utils'

  const editorType = ref('builder')
  const builderSql = ref('')
  const editorSql = ref('')
  const loading = ref(false)
  const allResults = ref([])
  const columns = ref<Array<{ name: string; data_type: string }>>([])
  const countChartRef = ref()
  const sqlEditorRef = ref()
  const sqlBuilderRef = ref()

  // Chart expanded state with localStorage persistence
  const chartExpanded = useLocalStorage('trace-chart-expanded', true)

  // Time range selection - will be synced with URL query params
  const timeLength = ref(10) // Default to last 10 minutes
  const timeRange = ref<string[]>([])

  const hasTimeLimit = computed(() => timeLength.value > 0 || timeRange.value.length > 0)

  // Time range values for SQLBuilder - now comes from TimeRangeSelect component
  const timeRangeValues = ref<string[]>([])
  const timeRangeSelectRef = ref()

  // Handler for TimeRangeSelect updates
  function handleTimeRangeValuesUpdate(newTimeRangeValues: string[]) {
    timeRangeValues.value = newTimeRangeValues
  }

  // Store current builder form state for URL update after successful query
  const currentBuilderFormState = ref(null)

  // Initialize URL synchronization hook
  const { updateQueryParams, initializeFromQuery } = useQueryUrlSync({
    modeRef: editorType,
    timeLength,
    timeRange,
    editorSql,
    builderFormState: currentBuilderFormState,
    // Note: tableName is computed and not stored in URL
    defaultMode: 'builder',
    defaultTimeLength: 10,
  })

  // Computed table name - get from form state or parse from SQL
  const tableName = computed(() => {
    if (editorType.value === 'builder' && currentBuilderFormState.value?.table) {
      return currentBuilderFormState.value.table
    }

    if (editorType.value === 'text' && editorSql.value) {
      // Parse table name from SQL query
      const sql = editorSql.value.trim()
      const fromMatch = sql.match(/FROM\s+([`"']?)(\w+)\1/i)
      if (fromMatch) {
        return fromMatch[2]
      }
    }

    return ''
  })

  // Handle SQL builder updates
  function handleBuilderSqlUpdate(sql: string) {
    builderSql.value = sql
  }

  // Watch for form state changes to update currentBuilderFormState for URL updates
  watch(
    currentBuilderFormState,
    (newFormState) => {
      // Store form state but don't update URL immediately
      // URL will be updated after successful query execution
      // Table name is now computed from form state
    },
    { deep: true }
  )

  // Handle format SQL
  function handleFormatSQL() {
    if (sqlEditorRef.value) {
      sqlEditorRef.value.formatSQL()
    }
  }

  // Watch for mode changes
  watch(editorType, (newMode) => {
    if (newMode === 'text' && !editorSql.value) {
      editorSql.value = builderSql.value
    }
  })

  const finalQuery = computed(() => {
    // Time processing is now handled by SQLBuilder for builder mode
    // For editor mode, we need to process time range manually
    const query = editorType.value === 'builder' ? builderSql.value : editorSql.value

    if (editorType.value === 'text') {
      // Manual time processing for editor mode
      let sql = query
      if (timeLength.value > 0) {
        const start = `now() - Interval '${timeLength.value}m'`
        const end = 'now()'
        sql = sql.replace(/\$timestart/g, start).replace(/\$timeend/g, end)
      } else if (timeRange.value.length === 2) {
        const start = new Date(Number(timeRange.value[0]) * 1000).toISOString()
        const end = new Date(Number(timeRange.value[1]) * 1000).toISOString()
        sql = sql.replace(/\$timestart/g, `'${start}'`).replace(/\$timeend/g, `'${end}'`)
      }
      return sql
    }

    return query
  })

  // Export traces as CSV
  function exportSql() {
    if (!finalQuery.value || !tableName.value) {
      return
    }
    editorAPI.runSQLWithCSV(finalQuery.value).then((result) => {
      const filename = tableName.value || 'traces'
      fileDownload(result as unknown as string, `${filename}.csv`)
    })
  }

  async function handleQuery() {
    if (!finalQuery.value) return

    loading.value = true
    try {
      const result = await editorAPI.runSQL(finalQuery.value)
      if (result.output?.[0]?.records) {
        const records = result.output[0].records as unknown as {
          schema: { column_schemas: Array<{ name: string; data_type: string }> }
          rows: any[][]
        }
        columns.value = records.schema.column_schemas
        allResults.value = records.rows.map((row: any[]) => {
          const record: any = {}
          records.schema.column_schemas.forEach((col: { name: string }, index: number) => {
            record[col.name] = row[index]
          })
          return record
        })

        // Update URL parameters only after successful query
        updateQueryParams()
      }

      // Trigger count chart query only if chart is expanded
      if (chartExpanded.value && countChartRef.value && finalQuery.value) {
        countChartRef.value.executeCountQuery()
      }
    } catch (error) {
      console.error('Query failed:', error)
    } finally {
      loading.value = false
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
  function handleFilterConditionAdd(columnName: string, operator: string, value: any) {
    if (sqlBuilderRef.value && sqlBuilderRef.value.addFilterCondition) {
      sqlBuilderRef.value.addFilterCondition(columnName, operator, value)
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
  .trace-query-container {
    height: calc(100vh - 30px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .content-wrapper {
    flex: 1;
    padding: 8px 8px 0 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: hidden;
    min-height: 0; // Important for flexbox
  }

  .toolbar {
    flex-shrink: 0;
    padding: 8px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .sql-container {
    flex-shrink: 0;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    font-weight: normal;
  }

  :deep(.arco-card) {
    border-radius: 0;
    border-bottom: none;

    // Make the last card (results) expandable
    &:last-child {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;

      .arco-card-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
        padding: 0;
      }
    }
  }
  :deep(.arco-radio-button.arco-radio-checked) {
    color: var(--color-primary);
  }
  :deep(.arco-input-group > *) {
    border-radius: 0;
  }

  .page-header {
    padding: 8px 12px;
    background: var(--card-bg-color);
    border-bottom: 1px solid var(--border-color);
    margin-bottom: 0;
    font-size: 15px;
    font-weight: 800;
    color: var(--main-font-color);
    font-family: 'Gilroy', sans-serif;
    line-height: 1.2;
    min-height: 48px;
    display: flex;
    align-items: center;
  }
</style>
