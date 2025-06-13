<template lang="pug">
.trace-detail-container
  .page-header
    .header-content
      a-button(type="text" @click="handleBack")
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
      a-card.light-editor-card(title="Trace Timeline" :bordered="false")
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
  import { ref, reactive, computed, watch, onActivated, onDeactivated } from 'vue'
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

  // Build span tree from filtered spans
  const filteredSpanTree = computed(() => buildSpanTree(filteredSpans.value))

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
      const result = await editorAPI.runSQL(`
        SELECT *
        FROM ${tableName}
        WHERE trace_id = '${route.params.id}'
        ORDER BY timestamp DESC
      `)

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

  function handleSpanSelect(spanId: string, span: any) {
    selectedSpan.value = span
    drawerVisible.value = true
  }

  const rootSpan = computed(() => traceSpans.value.find((span) => !span.parent_span_id) || null)
  const traceId = computed(() => route.params.id as string)

  // Watch for route changes

  // Handle component activation (when navigating to detail page)
  onActivated(() => {
    // Only fetch data if we're on the detail page
    if (route.name === 'dashboard-TraceDetail') {
      resetState()
      fetchTraceData()
    }
  })

  // Handle component deactivation (when navigating away from detail page)
  onDeactivated(() => {
    // Reset state when leaving the detail page
    resetState()
  })
</script>

<style lang="less" scoped>
  .trace-detail-container {
    height: 100%;
    overflow: hidden;
  }

  .page-header {
    padding: 8px 12px;
    background: var(--card-bg-color);
    border-bottom: 1px solid var(--border-color);
    margin-bottom: 0;
    min-height: 48px;
    .header-content {
      display: flex;
      align-items: center;
      gap: 20px;

      :deep(.arco-btn) {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--small-font-color);

        &:hover {
          color: var(--brand-color);
        }
      }
    }

    .trace-info {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 24px;

      .trace-title {
        display: flex;
        align-items: center;
        gap: 16px;

        .operation-name {
          font-size: 15px;
          font-weight: 800;
          color: var(--main-font-color);
          font-family: 'Gilroy', sans-serif;
          line-height: 1.2;
        }

        .span-count {
          background-color: var(--light-brand-color);
          color: var(--brand-color);
          border: 1px solid var(--brand-color);
          font-size: 13px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 6px;
          line-height: 1;
        }
      }

      .trace-id {
        display: flex;
        align-items: center;
        gap: 12px;

        .label {
          font-size: 13px;
          color: var(--small-font-color);
          font-weight: 600;
        }

        .trace-id-value {
          font-family: 'Roboto Mono', monospace;
          font-size: 13px;
          color: var(--main-font-color);
          font-weight: 500;
        }
      }
    }
  }

  .content-container {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-bottom: 16px;
  }

  .cards-row {
    display: flex;
    gap: 8px;
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
  }

  .service-filter {
    display: flex;
    align-items: center;
    gap: 8px;

    .filter-label {
      font-size: 12px;
      color: var(--color-text-2);
      font-weight: 500;
      white-space: nowrap;
    }

    :deep(.arco-select) {
      min-width: 200px;
    }

    :deep(.arco-select-view-value) {
      font-size: 12px;
    }

    :deep(.arco-tag) {
      font-size: 11px;
      padding: 1px 6px;
    }
  }

  :deep(.arco-card) {
    border-radius: 0;
    border-bottom: none;
  }

  :deep(.arco-card-body) {
    padding: 0 10px 10px 10px;
  }

  :deep(.arco-card.light-editor-card) {
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
