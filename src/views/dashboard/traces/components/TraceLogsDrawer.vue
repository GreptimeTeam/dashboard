<template lang="pug">
DrilldownDrawer(
  :title="t('drilldown.traces.traceLogsTitle')"
  :visible="Boolean(traceId)"
  :popup-container="popupContainer"
  :breadcrumbs="breadcrumbs"
  @close="emit('close')"
)
  TraceLogsPanel(
    v-if="traceId"
    :trace-id="traceId"
    :target="target"
    :binding="binding"
    :trace-id-column="traceIdColumn"
    :source="source"
  )
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import DrilldownDrawer from '@/views/dashboard/drilldown/components/drilldown-drawer.vue'
  import type { TraceDetailTarget } from '@/observability/traces/trace-detail-target'
  import type { TraceLogsPanelSource } from '@/observability/traces/trace-logs-empty-state'
  import TraceLogsPanel from './TraceLogsPanel.vue'

  /**
   * Logs of one trace, opened from a span in the trace drawer and stacked on top of it.
   * The trace id breadcrumb returns to the trace; empty `traceId` closes the drawer.
   * The panel — not the caller — explains why there are no logs, so the drawer opens even
   * when no logs table is bound yet.
   */
  defineOptions({
    name: 'TraceLogsDrawer',
  })

  const props = defineProps<{
    traceId: string
    target?: TraceDetailTarget
    /** Trace id column override (see TraceLogsPanel). */
    traceIdColumn?: string
    /** Usage scenario (see TraceLogsPanel). */
    source?: TraceLogsPanelSource
    /** The logs binding is still resolving its table (see TraceLogsPanel). */
    binding?: boolean
    popupContainer: string
  }>()

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useI18n()

  const breadcrumbs = computed(() => [{ label: props.traceId, mono: true, onSelect: () => emit('close') }])
</script>
