<template lang="pug">
.traces-breakdown-value-card
  .card-header
    .card-title-row(:title="titleText")
      span.card-title {{ titleText }}
    a-button(
      v-if="canAddToFilter"
      type="outline"
      size="mini"
      @click="addToFilter"
    )
      | {{ t('drilldown.filters.addToFilter') }}
  .card-body
    BreakdownMiniChart(
      :red-metric="redMetric"
      :attr-key="attrKey"
      :attr-value="attrValue"
      :color-index="colorIndex"
      :scroll-root="scrollRoot"
    )
</template>

<script setup lang="ts">
  import { computed, type MaybeRefOrGetter } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import type { RedMetric } from '@/observability/adapters/traces'
  import { METRIC_PANEL_HEIGHT } from '@/observability/metrics/panel-stats'
  import BreakdownMiniChart from './breakdown-mini-chart.vue'

  const panelHeightPx = `${METRIC_PANEL_HEIGHT}px`

  const props = defineProps<{
    redMetric: RedMetric
    attrKey: string
    attrValue: string
    colorIndex?: number
    scrollRoot?: MaybeRefOrGetter<HTMLElement | null | undefined>
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  const canAddToFilter = computed(() => Boolean(props.attrValue) && props.attrValue !== '<unspecified>')
  const titleText = computed(() => `${props.attrKey}="${props.attrValue}"`)

  const addToFilter = () => {
    if (!canAddToFilter.value) {
      return
    }
    ctx.appendFilter({ key: props.attrKey, op: '=', value: props.attrValue })
  }
</script>

<style scoped lang="less">
  .traces-breakdown-value-card {
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

  .card-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }
</style>
