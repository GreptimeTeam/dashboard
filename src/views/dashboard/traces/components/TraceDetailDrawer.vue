<template lang="pug">
DrilldownDrawer(
  subtitle="Trace Timeline"
  :visible="Boolean(traceId)"
  :popup-container="popupContainer"
  :breadcrumbs="breadcrumbs"
  @close="emit('close')"
)
  TraceDetailPanel(
    v-if="traceId && target"
    :trace-id="traceId"
    :target="target"
    :empty-text="emptyText"
  )
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import DrilldownDrawer from '@/views/dashboard/drilldown/components/drilldown-drawer.vue'
  import type { TraceDetailTarget } from '@/observability/traces/trace-detail-target'
  import TraceDetailPanel from './TraceDetailPanel.vue'

  /**
   * In-page trace detail: the same header and timeline as the standalone detail route, but
   * rendered as a drawer over the current list page so the list (and its state) stays mounted.
   * Empty `traceId` closes it.
   */
  defineOptions({
    name: 'TraceDetailDrawer',
  })

  const props = defineProps<{
    traceId: string
    target?: TraceDetailTarget
    popupContainer: string
    emptyText?: string
  }>()

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useI18n()

  const breadcrumbs = computed(() => [
    { label: t('drilldown.nav.overview'), onSelect: () => emit('close') },
    { label: props.traceId, mono: true },
  ])
</script>
