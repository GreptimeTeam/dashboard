<template lang="pug">
.breakdown-label-card
  .card-header
    .card-title-row(:title="labelKey")
      span.card-title {{ labelKey }}
      span.card-meta {{ values.length }} {{ t('drilldown.breakdown.values') }}
    a-space(size="small")
      a-button(
        v-if="singleValue"
        type="outline"
        size="mini"
        @click="addSingleValueToFilter"
      )
        | {{ t('drilldown.filters.addToFilter') }}
      a-button(
        v-else-if="values.length > 1"
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
  import { computed, onMounted, ref, watch, type MaybeRefOrGetter } from 'vue'
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

  const singleValue = computed(() => values.value.length === 1)

  const loadValues = async () => {
    loading.value = true
    try {
      values.value = await fetchBreakdownLabelValues(ctx, props.metric, props.labelKey)
    } finally {
      loading.value = false
    }
  }

  const addSingleValueToFilter = () => {
    const value = values.value[0]
    if (!value || value === '<unspecified>') {
      return
    }
    ctx.appendFilter({ key: props.labelKey, op: '=', value })
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
    gap: 8px;
    min-height: v-bind(panelHeightPx);
    padding: 12px 12px 10px;
    border: 1px solid var(--color-border-2);
    border-radius: 8px;
    background: var(--color-bg-2);
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .card-title-row {
    display: flex;
    flex: 1;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
  }

  .card-title {
    flex: 0 1 auto;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    color: var(--color-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-meta {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 500;
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
