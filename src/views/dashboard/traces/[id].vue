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
        trace-timeline(
          :loading="loading"
          :span-tree="spanTree"
          :root-span="rootSpan"
          @span-select="handleSpanSelect"
        )

      a-card#trace-attributes.light-editor-card.drawer-container(
        :bordered="false"
        :class="{ 'drawer-visible': drawerVisible }"
      )

      span-detail-drawer(v-model="drawerVisible" :span="selectedSpan")
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

  const traceStartTime = ref(0)
  const traceEndTime = ref(0)

  // Reset all state
  function resetState() {
    traceSpans.value = []
    selectedSpan.value = null
    drawerVisible.value = false
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
        console.log(records, 'records')

        traceSpans.value = processSpanData(records)
        console.log(traceSpans.value, 'traceSpans')

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
    console.log('Back button clicked')
    router.push({ name: 'trace-query' })
  }

  function handleSpanSelect(spanId: string, span: any) {
    console.log(span, 'span')
    selectedSpan.value = span
    drawerVisible.value = true
  }

  const spanTree = computed(() => buildSpanTree(traceSpans.value))
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
    padding: 0 16px 0;
    border-bottom: 1px solid var(--color-border);

    .header-content {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 8px 0;
      :deep(.arco-btn) {
        display: flex;
        align-items: center;
        gap: 4px;
      }
    }

    .trace-info {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 16px;

      .trace-title {
        display: flex;
        align-items: center;
        gap: 12px;

        .operation-name {
          font-size: 20px;
          font-weight: 600;
          color: var(--color-text-1);
        }

        .span-count {
          background-color: var(--color-primary-light-1);
          color: var(--color-primary);
          border: 1px solid var(--color-primary-light-3);
          font-size: 12px;
          padding: 2px 8px;
        }
      }

      .trace-id {
        display: flex;
        align-items: center;
        gap: 8px;

        .label {
          font-size: 12px;
          color: var(--color-text-3);
          font-weight: 500;
        }

        .trace-id-value {
          font-family: 'Roboto Mono', monospace;
          font-size: 12px;
          color: var(--color-text-2);
        }
      }
    }
  }

  .content-container {
    padding: 16px 8px 16px 16px;
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
        flex: 2;
      }
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
