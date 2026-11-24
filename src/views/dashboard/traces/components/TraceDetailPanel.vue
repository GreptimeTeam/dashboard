<template lang="pug">
.trace-detail-panel
  TraceGanttView(:spans="traceSpans" :loading="loading" :empty-text="resolvedEmptyText")
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import editorAPI from '@/api/editor'
  import { getTableRefForSql } from '@/utils/sql'
  import type { TraceDetailTarget } from '@/observability/traces/trace-detail-target'
  import TraceGanttView from './TraceGanttView.vue'
  import { processSpanData } from '../utils'
  import type { Span } from '../utils'

  /**
   * Loads every span of one trace and renders the shared timeline. Mounted by the standalone
   * detail route and by the in-page drawers (Logs Query / Traces Query), so no URL change is
   * needed to inspect a trace.
   */
  defineOptions({
    name: 'TraceDetailPanel',
  })

  const props = defineProps<{
    traceId: string
    target: TraceDetailTarget
    /** Full empty-state message; defaults to "not found in <table>". */
    emptyText?: string
  }>()

  const loading = ref(false)
  const traceSpans = ref<Span[]>([])
  const { t } = useI18n()
  const searchedTarget = computed(() =>
    props.target.database ? `${props.target.database}.${props.target.table}` : props.target.table
  )
  const resolvedEmptyText = computed(
    () => props.emptyText || t('drilldown.traces.ganttEmptyIn', { target: searchedTarget.value })
  )

  function escapeSqlString(value: string) {
    return value.replace(/'/g, "''")
  }

  // Only the latest request may write results: props can change while a query is in flight.
  let requestId = 0

  async function fetchTraceData() {
    requestId += 1
    const currentRequest = requestId
    const id = props.traceId.trim()
    const { table, database, start, end } = props.target
    traceSpans.value = []
    if (!id) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      // Code mode may pass an already-qualified `"db"."table"`; do not re-prefix.
      const fullTableName = getTableRefForSql({ table, database })

      // ±12h around the list-row timestamp for partition pruning.
      const whereParts = [`trace_id = '${escapeSqlString(id)}'`]
      if (start !== undefined && end !== undefined) {
        whereParts.push(`timestamp >= FROM_UNIXTIME(${start})`)
        whereParts.push(`timestamp <= FROM_UNIXTIME(${end})`)
      }

      const result = await editorAPI.runSQL(
        `
        SELECT *
        FROM ${fullTableName}
        WHERE ${whereParts.join(' AND ')}
        ORDER BY timestamp ASC
      `,
        database
      )
      if (currentRequest !== requestId) return

      if (result.output?.[0]?.records) {
        const records = result.output[0].records as unknown as {
          schema: { column_schemas: Array<{ name: string; data_type: string }> }
          rows: any[][]
        }
        traceSpans.value = processSpanData(records)
      }
    } catch (error) {
      console.error('Failed to fetch trace data:', error)
    } finally {
      if (currentRequest === requestId) {
        loading.value = false
      }
    }
  }

  watch(
    () => [props.traceId, props.target.table, props.target.database, props.target.start, props.target.end],
    () => {
      fetchTraceData()
    },
    { immediate: true }
  )
</script>

<style lang="less" scoped>
  .trace-detail-panel {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
</style>
