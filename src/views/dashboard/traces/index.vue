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
            :relative-time-options="relativeTimeOptions"
          )
          a-button(type="primary" size="small" @click="handleQuery") Query
      .sql-container
        SQLBuilder(
          v-if="sqlMode === 'builder'"
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
          a-button(type="text" size="small" @click="chartExpanded = !chartExpanded")
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
          @time-range-update="handleTimeRangeUpdate"
        )

    a-card(:bordered="false")
      template(#title)
        .results-header
          span Results
          span.results-count(v-if="totalResults > 0") 
            | ({{ totalResults }} {{ totalResults === 1 ? 'record' : 'records' }}
            template(v-if="totalResults > pageSize")
              | , showing {{ Math.min((currentPage - 1) * pageSize + 1, totalResults) }}-{{ Math.min(currentPage * pageSize, totalResults) }}
            | )
      template(#extra)
        a-space
          a-pagination(
            v-if="totalResults > pageSize"
            v-model:current="currentPage"
            v-model:page-size="pageSize"
            size="small"
            simple
            :total="totalResults"
            :show-total="false"
            :show-jumper="false"
            :show-page-size="true"
            :page-size-options="[10, 20, 50, 100]"
            @change="handlePageChange"
            @page-size-change="handlePageSizeChange"
          )
          a-trigger(v-if="columns.length" trigger="click" :unmount-on-close="false")
            a-button(type="text" style="color: var(--color-text-2)")
              template(#icon)
                icon-settings
              | Columns
            template(#content)
              a-card(style="padding: 10px; min-width: 200px")
                .column-controls
                  a-space(direction="vertical" size="small")
                    a-space
                      a-button(type="text" size="mini" @click="selectAllColumns") Select All
                      a-button(type="text" size="mini" @click="deselectAllColumns") Deselect All
                    a-checkbox-group(v-model="displayedColumns" direction="vertical")
                      a-checkbox(v-for="column in columns" :key="column.name" :value="column.name")
                        | {{ column.name }}
      a-table(
        :data="results"
        :loading="loading"
        :pagination="false"
        :bordered="false"
        :stripe="false"
        :class="{ trace_table: true, multiple_column: true }"
      )
        template(#empty)
          a-empty(description="No data")
        template(#loading)
          a-spin(dot)
        template(#columns)
          a-table-column(
            v-for="col in visibleColumns"
            :key="col.name"
            :title="col.name"
            :data-index="col.name"
          )
            template(v-if="isTimeColumn(col)" #title)
              a-tooltip(placement="top" :content="tsViewStr ? 'Show raw timestamp' : 'Format timestamp'")
                a-space(size="mini" :style="{ cursor: 'pointer' }" @click="changeTsView")
                  svg.icon-12
                    use(href="#time-index")
                  | {{ col.name }}
            template(#cell="{ record }")
              template(v-if="col.name === 'traceid' || col.name === 'trace_id'")
                router-link(
                  :to="{ name: 'dashboard-TraceDetail', params: { id: record[col.name] }, query: { table: currentTable } }"
                ) {{ record[col.name] }}
              template(v-else-if="isTimeColumn(col)")
                span(style="cursor: pointer") {{ renderTs(record, col.name) }}
              template(v-else-if="col.name === 'attributes'")
                pre {{ JSON.stringify(record[col.name], null, 2) }}
              template(v-else)
                | {{ record[col.name] }}
</template>

<script setup name="TraceQuery" lang="ts">
  import { ref, computed, watch } from 'vue'
  import { useLocalStorage } from '@vueuse/core'
  import { IconCode, IconDown, IconRight, IconSettings } from '@arco-design/web-vue/es/icon'
  import editorAPI from '@/api/editor'
  import dayjs from 'dayjs'
  import { relativeTimeMap, relativeTimeOptions } from '@/views/dashboard/config'
  import TimeSelect from '@/components/time-select/index.vue'
  import SQLBuilder from './SQLBuilder.vue'
  import SQLEditor from './components/SQLEditor.vue'
  import CountChart from './components/CountChart.vue'

  const sqlMode = ref('builder')
  const builderSql = ref('')
  const editorSql = ref('')
  const currentTable = ref('')
  const loading = ref(false)
  const allResults = ref([])
  const columns = ref<Array<{ name: string; data_type: string }>>([])
  const countChartRef = ref()
  const sqlEditorRef = ref()

  // Chart expanded state with localStorage persistence
  const chartExpanded = useLocalStorage('trace-chart-expanded', true)

  // Column visibility state with localStorage persistence
  const displayedColumns = useLocalStorage<string[]>('trace-displayed-columns', [])

  // Default columns to show for traces (when no selection is made)
  const defaultTraceColumns = ['trace_id', 'service_name', 'span_name', 'timestamp', 'duration_nano']

  // Pagination state
  const currentPage = ref(1)
  const pageSize = ref(20)

  // Timestamp display state
  const tsViewStr = ref(true) // true for formatted, false for raw timestamp

  // Time range selection
  const timeLength = ref(10) // Default to last 10 minutes
  const timeRange = ref<string[]>([])

  // Computed paginated results
  const results = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    return allResults.value.slice(start, end)
  })

  // Total count for pagination
  const totalResults = computed(() => allResults.value.length)

  // Computed visible columns based on selection
  const visibleColumns = computed(() => {
    let columnsToShow = []

    if (displayedColumns.value.length === 0) {
      // Show default trace columns if available, otherwise show all
      const availableDefaults = columns.value.filter(
        (col) => defaultTraceColumns.includes(col.name.toLowerCase()) || defaultTraceColumns.includes(col.name)
      )
      columnsToShow = availableDefaults.length > 0 ? availableDefaults : columns.value
    } else {
      columnsToShow = columns.value.filter((col) => displayedColumns.value.includes(col.name))
    }

    // Sort columns to ensure trace_id is always first
    return columnsToShow.sort((a, b) => {
      const isATraceId = a.name === 'trace_id' || a.name === 'traceid'
      const isBTraceId = b.name === 'trace_id' || b.name === 'traceid'

      if (isATraceId && !isBTraceId) return -1
      if (!isATraceId && isBTraceId) return 1

      // Keep original order for other columns
      return 0
    })
  })

  // Timestamp utilities
  function isTimeColumn(column: { name: string; data_type: string }) {
    return column.data_type.toLowerCase().includes('timestamp')
  }

  function changeTsView() {
    tsViewStr.value = !tsViewStr.value
  }

  function renderTs(record: any, columnName: string) {
    if (tsViewStr.value) {
      // Format timestamp as readable date
      const timestamp = record[columnName]
      if (timestamp) {
        // Handle different timestamp formats (nanoseconds, microseconds, milliseconds)
        let ms = timestamp
        if (typeof timestamp === 'string') {
          ms = parseInt(timestamp, 10)
        }
        // Convert to milliseconds if it's in nanoseconds or microseconds
        if (ms > 1000000000000000) {
          // nanoseconds
          ms /= 1000000
        } else if (ms > 1000000000000) {
          // microseconds
          ms /= 1000
        }
        return dayjs(ms).format('YYYY-MM-DD HH:mm:ss.SSS')
      }
      return timestamp
    }
    return record[columnName]
  }

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

  // Column selection functions
  function selectAllColumns() {
    displayedColumns.value = columns.value.map((col) => col.name)
  }

  function deselectAllColumns() {
    displayedColumns.value = []
  }

  // Watch for mode changes
  watch(sqlMode, (newMode) => {
    if (newMode === 'editor' && !editorSql.value) {
      editorSql.value = builderSql.value
    }
  })

  // Watch for column changes and update displayed columns if empty
  watch(columns, (newColumns) => {
    if (displayedColumns.value.length === 0 && newColumns.length > 0) {
      // Set default selection to common trace fields if they exist
      const defaultColumns = newColumns
        .filter((col) => defaultTraceColumns.includes(col.name.toLowerCase()) || defaultTraceColumns.includes(col.name))
        .map((col) => col.name)

      if (defaultColumns.length > 0) {
        displayedColumns.value = defaultColumns
      } else {
        displayedColumns.value = newColumns.map((col) => col.name)
      }
    }
  })

  const finalQuery = computed(() => {
    const query = sqlMode.value === 'builder' ? builderSql.value : editorSql.value
    let sql = query
    if (timeLength.value > 0) {
      const [start, end] = [`now() - Interval '${timeLength.value}m'`, 'now()']
      sql = query.replace("'$timeend'", end).replace("'$timestart'", start)
    } else if (timeRange.value.length === 2) {
      sql = query.replace('$timeend', timeRange.value[1]).replace('$timestart', timeRange.value[0])
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

        // Reset to first page when new query results arrive
        currentPage.value = 1
      }

      // Trigger count chart query after main query succeeds
      if (countChartRef.value && finalQuery.value) {
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

  // Pagination handlers
  function handlePageChange(page: number) {
    currentPage.value = page
  }

  function handlePageSizeChange(size: number) {
    pageSize.value = size
    currentPage.value = 1 // Reset to first page when page size changes
  }
</script>

<style lang="less" scoped>
  .trace-query-container {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .page-header {
    padding: 16px 16px 0;
    h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 500;
    }
  }

  .content-wrapper {
    flex: 1;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow: auto;
  }

  .toolbar {
    padding: 16px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .sql-container {
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

  .results-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: normal;
  }

  .results-count {
    color: var(--color-text-3);
    font-size: 12px;
    font-weight: normal;
  }

  .column-controls {
    min-width: 200px;
  }

  // Table styling to match logs TableData
  :deep(.trace_table) {
    font-family: 'Roboto Mono', monospace;

    .arco-table-element {
      font-family: 'Roboto Mono', monospace;
    }

    .arco-table-td,
    .arco-table-th {
      white-space: nowrap;
    }

    .arco-table-size-medium .arco-table-cell {
      padding: 7px 10px;
    }

    &.multiple_column {
      width: 100%;

      .arco-table-td-content {
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  }

  :deep(.arco-card) {
    border-radius: 0;
    border-bottom: none;
  }

  :deep(.arco-table-th) {
    background-color: var(--color-fill-2);
  }

  :deep(.arco-table-td) {
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
  }
</style>
