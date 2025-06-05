<template lang="pug">
.trace-query-container
  .page-header
    h2 Trace Query
  .content-wrapper
    a-card(:bordered="false")
      .toolbar
        a-space
          a-radio-group(v-model="sqlMode" type="button")
            a-radio(value="builder") Builder
            a-radio(value="editor") Editor
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
        CodeMirror(
          v-else
          v-model="editorSql"
          style="width: 100%; height: 100%"
          :extensions="extensions"
          :spellcheck="true"
          :autofocus="true"
          :indent-with-tab="true"
          :tabSize="2"
          :placeholder="'Enter your SQL query here...'"
        )

    a-card(v-if="builderSql || editorSql" title="Trace Count Over Time" :bordered="false")
      CountChart(
        ref="countChartRef"
        :sql="finalQuery"
        :time-length="timeLength"
        :time-range="timeRange"
        :table-name="currentTable"
        @time-range-update="handleTimeRangeUpdate"
      )

    a-card(title="Results" :bordered="false")
      a-table(
        :data="results"
        :loading="loading"
        :pagination="true"
        :bordered="false"
        :stripe="true"
      )
        template(#empty)
          a-empty(description="No data")
        template(#loading)
          a-spin(dot)
        template(#columns)
          a-table-column(
            v-for="col in columns"
            :key="col.name"
            :title="col.name"
            :data-index="col.name"
          )
            template(#cell="{ record }")
              template(v-if="col.name === 'traceid'")
                router-link(
                  :to="{ name: 'dashboard-TraceDetail', params: { id: record[col.name] }, query: { table: currentTable } }"
                ) {{ record[col.name] }}
              template(v-else-if="col.name === 'attributes'")
                pre {{ JSON.stringify(record[col.name], null, 2) }}
              template(v-else)
                | {{ record[col.name] }}
</template>

<script setup name="TraceQuery" lang="ts">
  import { ref, computed, watch } from 'vue'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'
  import { sql as sqlLang } from '@codemirror/lang-sql'
  import editorAPI from '@/api/editor'
  import dayjs from 'dayjs'
  import { relativeTimeMap, relativeTimeOptions } from '@/views/dashboard/config'
  import TimeSelect from '@/components/time-select/index.vue'
  import SQLBuilder from './SQLBuilder.vue'
  import CountChart from './components/CountChart.vue'

  const sqlMode = ref('builder')
  const builderSql = ref('')
  const editorSql = ref('')
  const currentTable = ref('')
  const loading = ref(false)
  const results = ref([])
  const columns = ref<Array<{ name: string; data_type: string }>>([])
  const countChartRef = ref()

  // Time range selection
  const timeLength = ref(10) // Default to last 10 minutes
  const timeRange = ref<string[]>([])
  const extensions = [basicSetup, sqlLang()]

  // Handle SQL builder updates
  function handleBuilderSqlUpdate(sql: string) {
    builderSql.value = sql
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
        results.value = records.rows.map((row: any[]) => {
          const record: any = {}
          records.schema.column_schemas.forEach((col: { name: string }, index: number) => {
            record[col.name] = row[index]
          })
          return record
        })
      }

      // Trigger count chart query after main query succeeds
      if (countChartRef.value && finalQuery) {
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

    :deep(.cm-editor) {
      height: 100%;
      border: 1px solid var(--color-border);
      border-radius: 4px;
    }

    :deep(.cm-editor.cm-focused) {
      outline: 0;
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
