<template lang="pug">
TraceGanttView(
  :spans="spans"
  :loading="loading"
  :logs-trace-enabled="logsTraceEnabled"
  :service-target-labels="serviceTargetLabels"
  @view-logs="openSpanLogs"
)
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useDrilldownContext } from '@/observability/context'
  import { loadDrilldownSettings } from '@/observability/drilldown-settings'
  import { fetchTraceSpans } from '@/observability/adapters/traces'
  import TraceGanttView from '@/views/dashboard/traces/components/TraceGanttView.vue'
  import type { Span } from '@/views/dashboard/traces/utils'
  import resolveLogsRoles from '@/observability/logs/resolved-roles'
  import { resolveTraceLogsForServices, type TraceLogsResolution } from '@/observability/traces/logs-association'
  import useSignalQuery from '@/observability/use-signal-query'

  const ctx = useDrilldownContext()

  const loading = ref(false)
  const spans = ref<Span[]>([])

  const uniqueServices = computed(() =>
    [...new Set(spans.value.map((span) => span.service_name).filter(Boolean))].sort()
  )

  const logsResolution = ref<TraceLogsResolution>({
    targets: {},
    ambiguous: {},
    multiTable: false,
    manualMappingEnabled: false,
  })
  const serviceTargetLabels = ref<Record<string, string>>({})

  /** Route every distinct service once per gantt load; the click itself is a memory lookup. */
  const resolveTargetLabels = async () => {
    const resolution = await resolveTraceLogsForServices(ctx, uniqueServices.value)
    logsResolution.value = resolution
    const labels: Record<string, string> = {}
    uniqueServices.value.forEach((service) => {
      const target = resolution.targets[service]
      if (target) {
        labels[service] = `${target.database}.${target.table}`
      }
    })
    serviceTargetLabels.value = labels
  }

  const load = async () => {
    const id = ctx.ui.focusTraceId.value
    if (!id || !ctx.semantics.traces.table.value) {
      spans.value = []
      return
    }
    loading.value = true
    try {
      spans.value = await fetchTraceSpans(ctx, id)
      await resolveTargetLabels()
    } finally {
      loading.value = false
    }
  }

  useSignalQuery(ctx, 'traces', {
    enabled: () => Boolean(ctx.ui.focusTraceId.value),
    params: () => `${ctx.ui.focusTraceId.value}:${ctx.ui.focusTraceAt.value ?? ''}`,
    run: () => load(),
  })

  const logsTraceEnabled = computed(() => {
    const roles = resolveLogsRoles(ctx)
    const hasOriginalAssociation = Boolean(roles.traceId || roles.trace_id)
    const mappings = loadDrilldownSettings(ctx.connection.tracesDatabase.value).traces.traceLogsMappings ?? []
    return hasOriginalAssociation || mappings.length > 0 || Boolean(ctx.semantics.logs.table.value)
  })

  const openSpanLogs = (span: Span) => {
    const traceId = String(span.trace_id || ctx.ui.focusTraceId.value || '')
    if (!traceId) {
      return
    }
    // Pre-resolved at gantt load (resolveTargetLabels); unknown services fall back to the
    // Logs page binding.
    const target = span.service_name ? logsResolution.value.targets[span.service_name] : undefined
    const enhancedTarget =
      target && target.source !== 'current' ? { database: target.database, table: target.table } : undefined
    ctx.actions.openLogsForTrace(traceId, enhancedTarget)
  }
</script>
