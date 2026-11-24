<template lang="pug">
.trace-logs-panel
  .drilldown-toolbar.trace-logs-toolbar
    .drilldown-toolbar__left
      span.trace-logs-target(:title="targetLabel") {{ targetLabel }}
      a-tag(v-if="countLabel") {{ countLabel }}
  .trace-logs-body
    LogTableData(
      v-if="data.length || loading"
      :data="data"
      :columns="columns"
      :loading="loading"
      :ts-column="tsColumn"
      :size="'small'"
    )
    a-empty(v-else)
      .trace-logs-empty-text {{ resolvedEmptyText }}
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import editorAPI from '@/api/editor'
  import useTableSchemaStore from '@/store/modules/table-schema'
  import type { ColumnType, TSColumn } from '@/types/query'
  import { TsTypeMapping } from '@/utils/date-time'
  import { getTableRefForSql, quoteIdent } from '@/utils/sql'
  import { escapeSqlString } from '@/observability/logs/query-state'
  import { findTraceIdColumn } from '@/observability/traces/open-trace-from-log'
  import type { TraceDetailTarget } from '@/observability/traces/trace-detail-target'
  import LogTableData from '@/views/dashboard/logs/query/LogsTable.vue'

  /**
   * Just a table of the logs that carry one trace id: no builder, chart or time picker. The
   * log table is the one chosen on the Logs Query page; the user changes it there.
   */
  defineOptions({
    name: 'TraceLogsPanel',
  })

  const props = defineProps<{
    traceId: string
    target: TraceDetailTarget
  }>()

  /** One screenful of context is enough; the full set is a Logs Query away. */
  const ROW_LIMIT = 1000

  const { t } = useI18n()

  const loading = ref(false)
  const columns = ref<ColumnType[]>([])
  const data = ref<Record<string, unknown>[]>([])
  const tsColumn = ref<TSColumn | null>(null)
  const missingTraceColumn = ref(false)

  const targetLabel = computed(() =>
    props.target.database ? `${props.target.database}.${props.target.table}` : props.target.table
  )
  const countLabel = computed(() => {
    if (!data.value.length) return ''
    const count = data.value.length >= ROW_LIMIT ? `${data.value.length}+` : String(data.value.length)
    return t('drilldown.traces.traceLogsCount', { count })
  })
  const resolvedEmptyText = computed(() =>
    t(missingTraceColumn.value ? 'drilldown.traces.traceLogsNoTraceColumn' : 'drilldown.traces.traceLogsEmpty', {
      target: targetLabel.value,
      page: t('menu.dashboard.logsQuery'),
    })
  )

  // Only the latest request may write results: props can change while a query is in flight.
  let requestId = 0

  function reset() {
    columns.value = []
    data.value = []
    tsColumn.value = null
    missingTraceColumn.value = false
  }

  async function fetchLogs() {
    requestId += 1
    const currentRequest = requestId
    const id = props.traceId.trim()
    const { table, database, start, end } = props.target
    reset()
    if (!id) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const schema = await useTableSchemaStore().ensureTableSchema(table, database)
      if (currentRequest !== requestId) return

      // A table without a trace id column cannot be filtered by this trace: stay empty rather
      // than listing unrelated rows.
      const traceColumn = findTraceIdColumn(schema)
      if (!traceColumn) {
        missingTraceColumn.value = true
        return
      }
      const timeColumn =
        schema.find((column) => column.semantic_type === 'TIMESTAMP')?.name ||
        schema.find((column) => column.name === 'timestamp')?.name

      // ±12h around the span timestamp for partition pruning.
      const whereParts = [`${quoteIdent(traceColumn)} = '${escapeSqlString(id)}'`]
      if (timeColumn && start !== undefined && end !== undefined) {
        whereParts.push(`${quoteIdent(timeColumn)} >= FROM_UNIXTIME(${start})`)
        whereParts.push(`${quoteIdent(timeColumn)} <= FROM_UNIXTIME(${end})`)
      }
      const orderBy = timeColumn ? `ORDER BY ${quoteIdent(timeColumn)} ASC` : ''

      const result = await editorAPI.runSQL(
        `SELECT * FROM ${getTableRefForSql({ table, database })} WHERE ${whereParts.join(
          ' AND '
        )} ${orderBy} LIMIT ${ROW_LIMIT}`,
        database
      )
      if (currentRequest !== requestId) return

      const records = result.output?.[0]?.records as unknown as
        | {
            schema: { column_schemas: Array<{ name: string; data_type: string }> }
            rows: unknown[][]
          }
        | undefined
      if (!records) return

      const schemas = records.schema.column_schemas
      columns.value = schemas.map((column) => ({
        name: column.name,
        data_type: TsTypeMapping[column.data_type as keyof typeof TsTypeMapping] || column.data_type,
        title: column.name,
      }))
      data.value = records.rows.map((row, index) => {
        const record: Record<string, unknown> = { key: index, index }
        schemas.forEach((column, columnIndex) => {
          record[column.name] = row[columnIndex]
        })
        return record
      })
      const ts = timeColumn ? columns.value.find((column) => column.name === timeColumn) : undefined
      tsColumn.value = ts ? { name: ts.name, data_type: ts.data_type } : null
    } catch (error) {
      console.error('Failed to fetch trace logs:', error)
    } finally {
      if (currentRequest === requestId) {
        loading.value = false
      }
    }
  }

  watch(
    () => [props.traceId, props.target.table, props.target.database, props.target.start, props.target.end],
    () => {
      fetchLogs()
    },
    { immediate: true }
  )
</script>

<style lang="less" scoped>
  .trace-logs-panel {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .trace-logs-target {
    overflow: hidden;
    color: var(--gpt-text-muted);
    font-family: var(--font-mono);
    font-size: var(--gpt-font-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trace-logs-body {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-height: 0;
  }

  .trace-logs-empty-text {
    max-width: 480px;
    margin: 0 auto;
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-base);
    line-height: 1.6;
    text-align: center;
  }
</style>
