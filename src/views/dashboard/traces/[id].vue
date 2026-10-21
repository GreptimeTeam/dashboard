<template lang="pug">
.trace-detail-container
  .page-header.gpt-page-header
    .header-content
      a-button.trace-detail-back(type="text" size="small" @click="handleBack")
        template(#icon)
          icon-left
      .trace-info
        .trace-title
          span.operation-name {{ rootSpan?.span_name || $t('drilldown.traces.unknownOperation') }}
          a-tag.span-count {{ $t('traces.spanCount', traceSpans.length, { count: traceSpans.length }) }}
        .trace-id
          span.label {{ $t('drilldown.traces.traceIdLabel') }}
          a-typography-text.trace-id-value(copyable :copy-text="traceId")
            | {{ traceId }}
  .content-container
    .cards-row
      a-card.trace-timeline-card.light-editor-card(:title="$t('drilldown.traces.ganttDrawerTitle')" :bordered="false")
        template(#extra)
          .service-filter
            span.filter-label {{ $t('drilldown.traces.servicesFilter') }}
            a-select(
              v-model="selectedServices"
              multiple
              allow-clear
              style="min-width: 200px"
              size="small"
              :placeholder="$t('drilldown.traces.servicesPlaceholder')"
            )
              a-option(v-for="service in uniqueServices" :key="service" :value="service")
                span.service-option
                  span.service-error-dot(v-if="servicesWithErrors.has(service)" aria-hidden="true")
                  | {{ service }}
        trace-timeline(
          v-if="rootSpan && filteredSpanTree.length > 0"
          :loading="loading"
          :span-tree="filteredSpanTree"
          :root-span="rootSpan"
          @span-select="handleSpanSelect"
        )

      a-card#trace-attributes.light-editor-card.drawer-container(
        :bordered="false"
        :class="{ 'drawer-visible': drawerVisible }"
      )

      SpanDetailDrawer(v-model="drawerVisible" :span="selectedSpan")
</template>

<script setup name="TraceDetail" lang="ts">
  import { ref, reactive, computed, watch, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { IconLeft } from '@arco-design/web-vue/es/icon'
  import editorAPI from '@/api/editor'
  import isTraceErrorStatus from '@/observability/traces/status'
  import TraceTimeline from './components/TraceTimeline.vue'
  import SpanDetailDrawer from './components/SpanDetailDrawer.vue'
  import { buildSpanTree, processSpanData } from './utils'
  import type { Span } from './utils'

  const route = useRoute()
  const router = useRouter()
  const loading = ref(false)

  const traceSpans = ref<Span[]>([])
  const selectedSpan = ref<Span | null>(null)
  const drawerVisible = ref(false)
  const selectedServices = ref<string[]>([])

  const traceStartTime = ref(0)
  const traceEndTime = ref(0)

  // Get unique services from trace spans
  const uniqueServices = computed(() => {
    const services = [...new Set(traceSpans.value.map((span) => span.service_name).filter(Boolean))]
    return services.sort()
  })

  const servicesWithErrors = computed(() => {
    const errored = new Set<string>()
    traceSpans.value.forEach((span) => {
      if (span.service_name && isTraceErrorStatus(span.span_status_code ?? span.status)) {
        errored.add(span.service_name)
      }
    })
    return errored
  })

  // Watch for unique services changes - don't auto-select all services
  watch(
    uniqueServices,
    (newServices) => {
      // Clear invalid selections when services change
      selectedServices.value = selectedServices.value.filter((service) => newServices.includes(service))
    },
    { immediate: true }
  )

  // Filter spans based on selected services
  const filteredSpans = computed(() => {
    // When no services are selected, show all spans
    if (selectedServices.value.length === 0) {
      return traceSpans.value
    }
    return traceSpans.value.filter((span) => selectedServices.value.includes(span.service_name))
  })

  // Build span tree from filtered spans - only include necessary properties for timeline
  const filteredSpanTree = computed(() => {
    // Filter spans to only include essential properties for timeline rendering
    const essentialSpans = filteredSpans.value.map((span) => ({
      _level: span._level || 0,
      key: span.span_id,
      span_name: span.span_name,
      span_status_code: span.span_status_code,
      status: span.status,
      span_id: span.span_id,
      parent_span_id: span.parent_span_id,
      duration_nano: span.duration_nano,
      timestamp: span.timestamp,
      timestamp_end: span.timestamp_end,
      trace_id: span.trace_id,
      service_name: span.service_name,
    }))

    return buildSpanTree(essentialSpans)
  })

  // Reset all state
  function resetState() {
    traceSpans.value = []
    selectedSpan.value = null
    drawerVisible.value = false
    selectedServices.value = [] // Start with no services selected (show all)
    traceStartTime.value = 0
    traceEndTime.value = 0
  }

  function escapeSqlString(value: string) {
    return value.replace(/'/g, "''")
  }

  async function fetchTraceData() {
    loading.value = true
    try {
      const tableName = (route.query.table as string) || 'spans'
      const database = (route.query.database as string) || undefined
      const traceId = String(route.params.id || '').trim()
      if (!traceId) {
        return
      }

      // Build table name with database prefix if available
      const fullTableName = database ? `"${database}"."${tableName}"` : tableName

      // ±12h around the list-row timestamp (passed as start/end) for partition pruning.
      const startSec = Number(route.query.start)
      const endSec = Number(route.query.end)
      const whereParts = [`trace_id = '${escapeSqlString(traceId)}'`]
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
        // Calculate trace time range
        const timestamps = traceSpans.value.map((span) => span.timestamp)
        traceStartTime.value = Math.min(...timestamps)
        traceEndTime.value = traceStartTime.value + Math.max(...traceSpans.value.map((span) => span.duration_nano))
      }
    } catch (error) {
      console.error('Failed to fetch trace data:', error)
    } finally {
      loading.value = false
    }
  }

  const handleBack = () => {
    router.back()
  }

  function handleSpanSelect(spanId: string) {
    selectedSpan.value = traceSpans.value.find((span) => span.span_id === spanId) || null
    drawerVisible.value = true
  }

  const rootSpan = computed(() => traceSpans.value.find((span) => !span.parent_span_id) || null)
  const traceId = computed(() => route.params.id as string)

  function loadTraceData() {
    resetState()
    fetchTraceData()
  }

  onMounted(loadTraceData)

  watch(() => route.params.id, loadTraceData)
</script>

<style lang="less" scoped>
  .trace-detail-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .page-header.gpt-page-header {
    justify-content: flex-start;

    .header-content {
      display: flex;
      align-items: center;
      gap: var(--gpt-gap-xs);
      width: 100%;

      :deep(.trace-detail-back.arco-btn-text.arco-btn-only-icon) {
        flex-shrink: 0;
        width: var(--gpt-control-height-sm);
        height: var(--gpt-control-height-sm);
        padding: 0;
        color: var(--gpt-icon-color);
        background-color: transparent !important;

        &:hover {
          color: var(--gpt-main-purple) !important;
          background-color: transparent !important;
        }
      }
    }

    .trace-info {
      flex: 1;
      display: flex;
      align-items: center;
      gap: var(--gpt-gap-xl);

      .trace-title {
        display: flex;
        align-items: center;
        gap: var(--gpt-gap-xl);

        .operation-name {
          font-size: var(--gpt-font-xl);
          font-weight: 700;
          color: var(--gpt-text-primary);
          font-family: var(--font-family-base);
          line-height: 1.2;
        }

        .span-count {
          background-color: var(--gpt-nav-active-bg);
          color: var(--gpt-main-purple);
          border: 1px solid var(--gpt-main-purple);

          font-weight: 600;
          padding: var(--gpt-gap-xs) var(--gpt-gap-sm);
          border-radius: var(--gpt-radius-md);
          line-height: 1;
        }
      }

      .trace-id {
        display: flex;
        align-items: center;
        gap: var(--gpt-gap-lg);

        .label {
          font-size: var(--gpt-font-md);
          color: var(--gpt-text-primary);
          font-weight: 600;
        }

        .trace-id-value {
          font-family: var(--font-mono);
          font-size: var(--gpt-font-md);
          color: var(--gpt-text-primary);
          font-weight: 500;
        }
      }
    }
  }

  .cards-row {
    display: flex;
    gap: var(--gpt-gap-md);
    flex: 1;
    min-height: 0;

    .light-editor-card {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;

      &:first-child {
        flex: 1.4;
      }
    }

    :deep(#trace-attributes) {
      border-left: 1px solid var(--gpt-border-default);
    }

    :deep(.trace-timeline-card .arco-card-header) {
      border-bottom: none;
    }
  }

  .service-option {
    display: inline-flex;
    align-items: center;
    gap: var(--gpt-gap-sm);
  }

  .service-error-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--danger-color);
    flex-shrink: 0;
  }

  .service-filter {
    display: flex;
    align-items: center;
    gap: var(--gpt-gap-md);

    .filter-label {
      font-size: var(--gpt-font-base);
      color: var(--gpt-text-primary);
      font-weight: 500;
      white-space: nowrap;
    }

    :deep(.arco-select) {
      min-width: 200px;
    }

    :deep(.arco-select-view-value) {
      font-size: var(--gpt-font-base);
    }

    :deep(.arco-tag) {
      font-size: var(--gpt-font-sm);
      padding: 1px var(--gpt-gap-sm);
    }
  }

  :deep(.arco-card) {
    border-radius: 0;
    border-bottom: none;
  }

  :deep(.arco-card-body) {
    padding: 0 var(--gpt-gap-lg) var(--gpt-gap-lg);
  }

  :deep(.arco-card.light-editor-card) {
    height: auto;
    padding-right: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .drawer-container.light-editor-card {
    flex: 0;
  }
  .light-editor-card.drawer-container.drawer-visible {
    flex: 1;
  }
</style>
