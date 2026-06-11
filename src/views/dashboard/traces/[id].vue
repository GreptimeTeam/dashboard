<template lang="pug">
.trace-detail-container
  .page-header.gpt-page-header
    .header-content
      a-button.trace-detail-back(type="text" size="small" @click="handleBack")
        template(#icon)
          icon-left
      .trace-info
        .trace-title
          span.operation-name {{ rootSpan?.span_name || 'Unknown Operation' }}
          a-tag.span-count {{ traceSpans.length }} span{{ traceSpans.length === 1 ? '' : 's' }}
        .trace-id
          span.label Trace ID:
          a-typography-text.trace-id-value(copyable :copy-text="traceId")
            | {{ traceId }}
  .content-container
    .cards-row
      a-card.trace-timeline-card.light-editor-card(title="Trace Timeline" :bordered="false")
        template(#extra)
          .service-filter
            span.filter-label Services:
            a-select(
              v-model="selectedServices"
              multiple
              allow-clear
              placeholder="Select services to filter"
              style="min-width: 200px"
              size="small"
            )
              a-option(v-for="service in uniqueServices" :key="service" :value="service")
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

  async function fetchTraceData() {
    loading.value = true
    try {
      const tableName = (route.query.table as string) || 'spans'
      const database = (route.query.database as string) || undefined

      // Build table name with database prefix if available
      const fullTableName = database ? `"${database}"."${tableName}"` : tableName

      const result = await editorAPI.runSQL(
        `
        SELECT *
        FROM ${fullTableName}
        WHERE trace_id = '${route.params.id}'
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
