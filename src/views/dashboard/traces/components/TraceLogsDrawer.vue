<template lang="pug">
DrilldownDrawer(
  :title="t('drilldown.traces.traceLogsTitle')"
  :visible="Boolean(traceId)"
  :popup-container="popupContainer"
  :breadcrumbs="breadcrumbs"
  @close="emit('close')"
)
  TraceLogsPanel(
    v-if="traceId && target"
    :trace-id="traceId"
    :target="target"
    :trace-id-column="traceIdColumn"
    :source="source"
  )
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import DrilldownDrawer from '@/views/dashboard/drilldown/components/drilldown-drawer.vue'
  import type { TraceDetailTarget } from '@/observability/traces/trace-detail-target'
  import TraceLogsPanel from './TraceLogsPanel.vue'

  /**
   * Logs of one trace, opened from a span in the trace drawer and stacked on top of it.
   * The trace id breadcrumb returns to the trace; empty `traceId` closes the drawer.
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
    source?: 'query' | 'explore'
    popupContainer: string
  }>()

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useI18n()

  const breadcrumbs = computed(() => [{ label: props.traceId, mono: true, onSelect: () => emit('close') }])
</script>
