<template lang="pug">
.query-layout.query-layout--stack.trace-detail-page.query-container
  .drilldown-detail-header
    .drilldown-drawer__standard-header
      .drilldown-drawer__title-text
        nav.drilldown-drawer__breadcrumb(:aria-label="$t('drilldown.nav.breadcrumb')")
          a-breadcrumb
            a-breadcrumb-item
              button.drilldown-drawer__crumb-link(type="button" @click="handleBack") {{ $t('drilldown.nav.overview') }}
            a-breadcrumb-item
              span.drilldown-drawer__crumb-current.is-mono(:title="traceId") {{ traceId }}
        span.drilldown-drawer__subtitle Trace Timeline
    button.drilldown-detail-header__close(type="button" :aria-label="$t('common.close')" @click="handleBack")
      icon-close
  .trace-detail-body
    TraceGanttView(
      :spans="traceSpans"
      :loading="loading"
      :empty-description="$t('drilldown.traces.ganttEmptyIn', { target: searchedTarget })"
      :empty-hint="$t('drilldown.traces.ganttEmptyHint')"
    )
</template>

<script setup lang="ts">
  import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { IconClose } from '@arco-design/web-vue/es/icon'
  import editorAPI from '@/api/editor'
  import { getTableRefForSql } from '@/utils/sql'
  import TraceGanttView from './components/TraceGanttView.vue'
  import { processSpanData } from './utils'
  import type { Span } from './utils'

  defineOptions({
    name: 'TraceDetail',
  })

  const route = useRoute()
  const router = useRouter()
  const loading = ref(false)

  const traceSpans = ref<Span[]>([])
  const traceId = computed(() => String(route.params.id || ''))
  const searchedTarget = computed(() => {
    const table = String(route.query.table || 'spans')
    const database = String(route.query.database || '')
    return database ? `${database}.${table}` : table
  })

  function escapeSqlString(value: string) {
    return value.replace(/'/g, "''")
  }

  async function fetchTraceData() {
    loading.value = true
    try {
      const tableName = (route.query.table as string) || 'spans'
      const database = (route.query.database as string) || undefined
      const id = traceId.value.trim()
      if (!id) {
        return
      }

      // Code mode may pass an already-qualified `"db"."table"`; do not re-prefix.
      const fullTableName = getTableRefForSql({ table: tableName, database })

      // ±12h around the list-row timestamp (passed as start/end) for partition pruning.
      const startSec = Number(route.query.start)
      const endSec = Number(route.query.end)
      const whereParts = [`trace_id = '${escapeSqlString(id)}'`]
      if (Number.isFinite(startSec) && Number.isFinite(endSec) && endSec >= startSec) {
        whereParts.push(`timestamp >= FROM_UNIXTIME(${startSec})`)
        whereParts.push(`timestamp <= FROM_UNIXTIME(${endSec})`)
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
      loading.value = false
    }
  }

  const handleBack = () => {
    if (window.history.state?.back) {
      router.back()
      return
    }
    router.push({ name: 'trace-query' })
  }

  function loadTraceData() {
    traceSpans.value = []
    fetchTraceData()
  }

  // Same as the Signals Explore drawer: Esc closes the detail (ignored while typing / in popups).
  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented) {
      return
    }
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, [contenteditable="true"], .arco-select-dropdown, .arco-trigger-popup')) {
      return
    }
    handleBack()
  }

  onMounted(() => {
    loadTraceData()
    window.addEventListener('keydown', handleKeydown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown)
  })

  watch(() => route.params.id, loadTraceData)
</script>

<style lang="less" scoped>
  .trace-detail-body {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    background: var(--gpt-bg-panel);
  }
</style>
