<template lang="pug">
.traces-gantt
  .gantt-toolbar
    .trace-summary
      span.operation-name {{ rootSpan?.span_name || t('drilldown.traces.unknownOperation') }}
      a-tag.span-count {{ spans.length }} span{{ spans.length === 1 ? '' : 's' }}
    .service-filter
      span.filter-label {{ t('drilldown.traces.servicesFilter') }}
      a-select(
        v-model="selectedServices"
        multiple
        allow-clear
        size="small"
        style="min-width: 200px"
        :placeholder="t('drilldown.traces.servicesPlaceholder')"
      )
        a-option(v-for="service in uniqueServices" :key="service" :value="service") {{ service }}

  a-spin.gantt-spin(:loading="loading")
    .gantt-split(v-if="rootSpan && spanTree.length")
      .gantt-timeline-pane
        TraceTimeline(
          :loading="loading"
          :span-tree="spanTree"
          :root-span="rootSpan"
          @span-select="handleSpanSelect"
        )
      .gantt-attributes-pane(v-if="spanDrawerVisible && selectedSpan")
        SpanDetailDrawer(v-model="spanDrawerVisible" variant="panel" :span="selectedSpan")
    a-empty(v-else-if="!loading" :description="t('drilldown.traces.ganttEmpty')")
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { fetchTraceSpans } from '@/observability/adapters/traces'
  import TraceTimeline from '@/views/dashboard/traces/components/TraceTimeline.vue'
  import SpanDetailDrawer from '@/views/dashboard/traces/components/SpanDetailDrawer.vue'
  import { buildSpanTree, type Span } from '@/views/dashboard/traces/utils'

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  const loading = ref(false)
  const spans = ref<Span[]>([])
  const selectedSpan = ref<Span | null>(null)
  const spanDrawerVisible = ref(false)
  const selectedServices = ref<string[]>([])

  const uniqueServices = computed(() =>
    [...new Set(spans.value.map((span) => span.service_name).filter(Boolean))].sort()
  )

  const filteredSpans = computed(() => {
    if (!selectedServices.value.length) {
      return spans.value
    }
    return spans.value.filter((span) => selectedServices.value.includes(span.service_name))
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

  const rootSpan = computed(() => spans.value.find((span) => !span.parent_span_id) || spans.value[0] || null)

  const load = async () => {
    const id = ctx.focusTraceId.value
    if (!id || !ctx.tracesTable.value) {
      spans.value = []
      return
    }
    loading.value = true
    selectedSpan.value = null
    spanDrawerVisible.value = false
    selectedServices.value = []
    try {
      spans.value = await fetchTraceSpans(ctx, id)
    } finally {
      loading.value = false
    }
  }

  const handleSpanSelect = (spanId: string | number, node?: Span) => {
    const id = String(spanId ?? '')
    const fromList =
      spans.value.find((span) => String(span.span_id) === id) ||
      spans.value.find((span) => String(span.key) === id) ||
      null
    selectedSpan.value = fromList || (node as Span) || null
    if (selectedSpan.value) {
      spanDrawerVisible.value = true
    }
  }

  watch(
    () => [ctx.focusTraceId.value, ctx.tracesTable.value, ctx.refreshKey.value],
    () => {
      load()
    },
    { immediate: true }
  )

  watch(uniqueServices, (services) => {
    selectedServices.value = selectedServices.value.filter((service) => services.includes(service))
  })
</script>

<style scoped lang="less">
  .traces-gantt {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    gap: 0;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .gantt-toolbar {
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--gpt-gap-md) var(--gpt-gap-xl);
    padding: var(--gpt-gap-md) var(--gpt-page-padding-x);
    border-bottom: 1px solid var(--gpt-border-default);
    background: var(--gpt-table-toolbar-bg, var(--color-bg-2));
  }

  .trace-summary {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--gpt-gap-md);
    align-items: center;
    min-width: 0;
  }

  .operation-name {
    font-size: var(--gpt-font-lg);
    font-weight: var(--gpt-font-weight-control);
    color: var(--color-text-1);
  }

  .service-filter {
    display: flex;
    gap: var(--gpt-gap-md);
    align-items: center;
  }

  .filter-label {
    font-size: var(--gpt-font-base);
    color: var(--color-text-2);
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
