<template lang="pug">
.trace-query-container
  .content-wrapper
    a-card(:bordered="false")
      .toolbar
        a-space
          a-radio-group(v-model="sqlMode" type="button")
            a-radio(value="builder") Builder
            a-radio(value="editor") Editor
          a-button(
            v-if="sqlMode === 'editor'"
            type="outline"
            size="small"
            @click="handleFormatSQL"
          )
            template(#icon)
              icon-code
            | Format
          TimeSelect(
            v-model:time-length="timeLength"
            v-model:time-range="timeRange"
            button-type="outline"
            button-class="icon-button time-select"
            flex-direction="row-reverse"
            empty-str="Select Time Range"
            button-size="small"
            :relative-time-map="relativeTimeMap"
            :relative-time-options="[{ value: 0, label: 'No Time Limit' }, ...relativeTimeOptions]"
          )
          a-button(type="primary" size="small" @click="handleQuery") Query
      .sql-container
        SQLBuilder(
          v-if="sqlMode === 'builder'"
          ref="sqlBuilderRef"
          :has-time-limit="timeLength > 0"
          @update:sql="handleBuilderSqlUpdate"
          @update:table="currentTable = $event"
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
          :table-name="currentTable"
          :should-fetch="chartExpanded"
          @time-range-update="handleTimeRangeUpdate"
        )

    TraceTable(
      :data="allResults"
      :columns="columns"
      :loading="loading"
      :current-table="currentTable"
      :sql-mode="sqlMode"
      @filterConditionAdd="handleFilterConditionAdd"
    )
</template>

<script setup name="TraceQuery" lang="ts">
  import { ref, computed, watch, nextTick } from 'vue'
  import { useLocalStorage } from '@vueuse/core'
  import { IconCode, IconDown, IconRight } from '@arco-design/web-vue/es/icon'
  import editorAPI from '@/api/editor'
  import { relativeTimeMap, relativeTimeOptions } from '@/views/dashboard/config'
  import TimeSelect from '@/components/time-select/index.vue'
  import SQLBuilder from './SQLBuilder.vue'
  import SQLEditor from './components/SQLEditor.vue'
  import CountChart from './components/CountChart.vue'
  import TraceTable from './components/TraceTable.vue'

  const sqlMode = ref('builder')
  const builderSql = ref('')
  const editorSql = ref('')
  const currentTable = ref('')
  const loading = ref(false)
  const allResults = ref([])
  const columns = ref<Array<{ name: string; data_type: string }>>([])
  const countChartRef = ref()
  const sqlEditorRef = ref()
  const sqlBuilderRef = ref()

  // Chart expanded state with localStorage persistence
  const chartExpanded = useLocalStorage('trace-chart-expanded', true)

  // Time range selection
  const timeLength = ref(10) // Default to last 10 minutes
  const timeRange = ref<string[]>([])

  const hasTimeLimit = computed(() => timeLength.value > 0 || timeRange.value.length > 0)

  // Handle SQL builder updates
  function handleBuilderSqlUpdate(sql: string) {
    builderSql.value = sql
  }

  // Handle format SQL
  function handleFormatSQL() {
    if (sqlEditorRef.value) {
      sqlEditorRef.value.formatSQL()
    }
  }

  // Watch for mode changes
  watch(sqlMode, (newMode) => {
    if (newMode === 'editor' && !editorSql.value) {
      editorSql.value = builderSql.value
    }
  })

  const finalQuery = computed(() => {
    const query = sqlMode.value === 'builder' ? builderSql.value : editorSql.value
    let sql = query
    if (timeLength.value > 0) {
      const [start, end] = [`now() - Interval '${timeLength.value}m'`, 'now()']
      sql = query.replace("'$timeend'", end).replace("'$timestart'", start)
    } else if (timeRange.value.length === 2) {
      sql = query
        .replace('$timeend', new Date(Number(timeRange.value[1]) * 1000).toISOString())
        .replace('$timestart', new Date(Number(timeRange.value[0]) * 1000).toISOString())
    }
    return sql
  })

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
    timeLength.value = 0 // Switch to custom mode
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
</script>

<style lang="less" scoped>
  .trace-query-container {
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .content-wrapper {
    flex: 1;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: hidden;
    min-height: 0; // Important for flexbox
  }

  .toolbar {
    flex-shrink: 0;
    padding: 16px;
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
</style>
