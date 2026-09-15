<template lang="pug">
.breakdown-label-card
  .card-header
    .card-title-row(:title="labelKey")
      span.card-title {{ labelKey }}
      span.card-meta {{ values.length }} {{ t('drilldown.breakdown.values') }}
    a-space(size="small")
      a-button(
        v-if="values.length > 1"
        type="outline"
        size="mini"
        @click="$emit('select')"
      )
        | {{ t('drilldown.breakdown.selectLabel') }}
  .card-body
    BreakdownMiniChart(
      mode="groupBy"
      :metric="metric"
      :label-key="labelKey"
      :scroll-root="scrollRoot"
    )
</template>

<script setup lang="ts">
  import { onMounted, ref, watch, type MaybeRefOrGetter } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { fetchBreakdownLabelValues } from '@/observability/metrics/breakdown'
  import { METRIC_PANEL_HEIGHT } from '@/observability/metrics/panel-stats'
  import BreakdownMiniChart from './breakdown-mini-chart.vue'

  const panelHeightPx = `${METRIC_PANEL_HEIGHT}px`

  const props = defineProps<{
    metric: string
    labelKey: string
    scrollRoot: MaybeRefOrGetter<HTMLElement | null | undefined>
  }>()

  defineEmits<{
    (e: 'select'): void
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const values = ref<string[]>([])
  const loading = ref(false)

  const loadValues = async () => {
    loading.value = true
    try {
      values.value = await fetchBreakdownLabelValues(ctx, props.metric, props.labelKey)
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    loadValues()
  })

  watch(
    () => [ctx.filters.value, ctx.time.value, ctx.rangeTime.value[0], ctx.rangeTime.value[1], ctx.refreshKey.value],
    () => {
      loadValues()
    },
    { deep: true }
  )
</script>

<style scoped lang="less">
  .breakdown-label-card {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-md);
    min-height: v-bind(panelHeightPx);
    padding: var(--gpt-gap-lg) var(--gpt-gap-lg) var(--gpt-gap-md);
    border: 1px solid var(--color-border-2);
    border-radius: var(--gpt-radius-md);
    background: var(--color-bg-2);
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--gpt-gap-md);
    min-width: 0;
  }

  .card-title-row {
    display: flex;
    flex: 1;
    align-items: baseline;
    gap: var(--gpt-gap-md);
    min-width: 0;
    overflow: hidden;
  }

  .card-title {
    flex: 0 1 auto;
    overflow: hidden;
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-control);
    line-height: 1.35;
    color: var(--color-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-meta {
    flex-shrink: 0;
    font-size: var(--gpt-font-sm);
    font-weight: var(--gpt-font-weight-medium);
    line-height: 1.35;
    color: var(--color-text-3);
    white-space: nowrap;
  }

  .card-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }
</style>
