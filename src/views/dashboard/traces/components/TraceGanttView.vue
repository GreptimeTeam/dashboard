<template lang="pug">
.trace-gantt-view
  .drilldown-toolbar.gantt-toolbar
    .drilldown-toolbar__left.trace-summary
      span.operation-name {{ rootSpan?.span_name || t('drilldown.traces.unknownOperation') }}
      a-tag.span-count {{ spans.length }} span{{ spans.length === 1 ? '' : 's' }}
    .drilldown-toolbar__right.service-filter
      span.drilldown-field-label Services:
      a-select.drilldown-filter-select(
        v-model="selectedServices"
        multiple
        allow-clear
        size="small"
        placeholder="Filter services"
      )
        a-option(v-for="service in uniqueServices" :key="service" :value="service")
          span.service-option
            span.service-error-dot(v-if="servicesWithErrors.has(service)" aria-hidden="true")
            | {{ service }}

  a-spin.gantt-spin(:loading="loading")
    .gantt-split(v-if="rootSpan && spanTree.length")
      .gantt-timeline-pane
        TraceTimeline(
          :loading="loading"
          :span-tree="spanTree"
          :root-span="rootSpan"
          :selected-span-id="selectedSpan?.span_id || undefined"
          @span-select="handleSpanSelect"
        )
      .gantt-attributes-pane(v-if="spanDrawerVisible && selectedSpan")
        SpanDetailDrawer(
          v-model="spanDrawerVisible"
          variant="panel"
          :span="selectedSpan"
          :logs-trace-enabled="logsTraceEnabled"
          :logs-target-label="selectedSpanTargetLabel"
          @view-logs="(span) => emit('viewLogs', span)"
        )
    a-empty(v-else-if="!loading")
      .gantt-empty-title {{ emptyDescription || t('drilldown.traces.ganttEmpty') }}
      .gantt-empty-hint(v-if="emptyHint") {{ emptyHint }}
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import isTraceErrorStatus from '@/observability/traces/status'
  import { buildSpanTree, type Span } from '../utils'
  import TraceTimeline from './TraceTimeline.vue'
  import SpanDetailDrawer from './SpanDetailDrawer.vue'

  /**
   * Shared trace timeline body (summary toolbar + gantt split + span attributes panel).
   * Used by Signals Explore traces detail and the Trace Query detail page so both stay identical.
   */
  defineOptions({
    name: 'TraceGanttView',
  })

  const props = withDefaults(
    defineProps<{
      spans: Span[]
      loading?: boolean
      /** Whether the trace → logs association is available. */
      logsTraceEnabled?: boolean
      /** Resolved `database.table` label per service, shown next to the View logs action. */
      serviceTargetLabels?: Record<string, string>
      /** Overrides the empty-state title (e.g. names the table that was searched). */
      emptyDescription?: string
      /** Secondary line under the empty-state title. */
      emptyHint?: string
    }>(),
    {
      loading: false,
      logsTraceEnabled: false,
      serviceTargetLabels: () => ({}),
      emptyDescription: '',
      emptyHint: '',
    }
  )

  const emit = defineEmits<{
    viewLogs: [span: Span]
  }>()

  const { t } = useI18n()

  const selectedSpan = ref<Span | null>(null)
  const spanDrawerVisible = ref(false)
  const selectedServices = ref<string[]>([])

  const uniqueServices = computed(() =>
    [...new Set(props.spans.map((span) => span.service_name).filter(Boolean))].sort()
  )

  const servicesWithErrors = computed(() => {
    const errored = new Set<string>()
    props.spans.forEach((span) => {
      if (span.service_name && isTraceErrorStatus(span.span_status_code ?? span.status)) {
        errored.add(span.service_name)
      }
    })
    return errored
  })

  const filteredSpans = computed(() => {
    if (!selectedServices.value.length) {
      return props.spans
    }
    return props.spans.filter((span) => selectedServices.value.includes(span.service_name))
  })

  const spanTree = computed(() => {
    const essential = filteredSpans.value.map((span) => ({
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
    return buildSpanTree(essential)
  })

  const rootSpan = computed(() => props.spans.find((span) => !span.parent_span_id) || props.spans[0] || null)

  const selectedSpanTargetLabel = computed(() =>
    selectedSpan.value ? props.serviceTargetLabels[selectedSpan.value.service_name] || '' : ''
  )

  const handleSpanSelect = (spanId: string | number, node?: Span) => {
    const id = String(spanId ?? '')
    const fromList =
      props.spans.find((span) => String(span.span_id) === id) ||
      props.spans.find((span) => String(span.key) === id) ||
      null
    selectedSpan.value = fromList || (node as Span) || null
    if (selectedSpan.value) {
      spanDrawerVisible.value = true
    }
  }

  watch(uniqueServices, (services) => {
    selectedServices.value = selectedServices.value.filter((service) => services.includes(service))
  })

  // A new span set (another trace) resets selection and opens the root span, like a fresh load.
  watch(
    () => props.spans,
    () => {
      selectedServices.value = []
      selectedSpan.value = rootSpan.value
      spanDrawerVisible.value = Boolean(rootSpan.value)
    },
    { immediate: true }
  )
</script>

<style scoped lang="less">
  .trace-gantt-view {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    gap: 0;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .trace-summary {
    flex-wrap: wrap;
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

  .operation-name {
    font-size: var(--gpt-font-lg);
    font-weight: var(--gpt-font-weight-control);
    color: var(--gpt-text-primary);
  }

  .gantt-empty-title {
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-base);
    text-align: center;
  }

  .gantt-empty-hint {
    max-width: 420px;
    margin: var(--gpt-gap-sm) auto 0;
    color: var(--gpt-text-muted);
    font-size: var(--gpt-font-sm);
    text-align: center;
  }

  .gantt-spin {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    width: 100%;
    min-height: 0;
    overflow: hidden;

    :deep(> .arco-spin-children) {
      display: flex;
      flex: 1 1 0%;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
  }

  .gantt-split {
    display: flex;
    flex: 1 1 0%;
    gap: 0;
    min-height: 0;
    overflow: hidden;
  }

  .gantt-timeline-pane {
    display: flex;
    flex: 1.4 1 0%;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: var(--gpt-gap-lg) var(--gpt-page-padding-x) var(--gpt-page-padding-x);
    overflow: auto;

    // TraceTimeline 内部按独立 trace 详情页的整页视口写死高度（100vh 基准），
    // 在分栏 pane 里会凭空撑出滚动条：这里改为跟随 pane 实际剩余高度，
    // 超长 span 列表由 .tree-container 自身滚动。
    :deep(.spin-block) {
      flex: 1 1 0%;
      min-height: 0;
      height: auto;
    }

    :deep(.arco-spin-children) {
      height: 100%;
    }

    :deep(.tree-container) {
      height: 100%;
    }
  }

  .gantt-attributes-pane {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-width: 280px;
    max-width: 48%;
    min-height: 0;
    overflow: hidden;
    border-left: 1px solid var(--gpt-border-default);
  }
</style>
