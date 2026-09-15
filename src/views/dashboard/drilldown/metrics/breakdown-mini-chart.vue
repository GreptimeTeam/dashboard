<template lang="pug">
.breakdown-mini-chart(ref="targetRef")
  a-spin.panel-loading(v-if="loading" :loading="true")
  .panel-state.panel-error(v-else-if="error") {{ t('drilldown.main.sparklineError') }}
  .panel-state(v-else-if="isEmpty") {{ t('drilldown.main.sparklineNoData') }}
  .panel-chart(v-else-if="showChart")
    Chart(
      :key="chartRenderKey"
      :height="chartHeight"
      :options="chartOption"
      :brush-select="false"
      :time-interaction="true"
      :time-window-ms="timeWindowMs"
      @time-range-change="onTimeRangeChange"
    )
  .panel-footer(v-if="showFooter")
    .query-legend-list(v-if="seriesLegends.length")
      .query-legend(
        v-for="item in seriesLegends"
        :key="item.name"
        :title="mode === 'groupBy' ? item.name : promqlQuery"
      )
        span.legend-swatch(:style="{ background: item.color }")
        span.legend-name {{ item.name }}
    span.series-count(v-if="mode === 'groupBy' && seriesCount > seriesLegends.length")
      | {{ t('drilldown.main.seriesCount', { count: seriesCount }) }}
</template>

<script setup lang="ts">
  import { computed, toRef, type MaybeRefOrGetter } from 'vue'
  import { useI18n } from 'vue-i18n'
  import Chart from '@/components/raw-chart/index.vue'
  import { useDrilldownContext } from '@/observability/context'
  import { BREAKDOWN_CHART_HEIGHT } from '@/observability/metrics/panel-stats'
  import useBreakdownSparkline, { type BreakdownSparklineMode } from '@/observability/use-breakdown-sparkline'
  import useLazyPanelQuery from '@/observability/use-lazy-panel-query'

  const props = defineProps<{
    metric: string
    labelKey: string
    mode: BreakdownSparklineMode
    value?: string
    scrollRoot: MaybeRefOrGetter<HTMLElement | null | undefined>
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const metric = toRef(props, 'metric')
  const labelKey = toRef(props, 'labelKey')
  const mode = toRef(props, 'mode')
  const value = toRef(props, 'value')
  const { targetRef, hasBeenVisible } = useLazyPanelQuery(props.scrollRoot)

  const { loading, error, chartOption, promqlQuery, seriesCount, seriesLegends, isEmpty } = useBreakdownSparkline(ctx, {
    metric,
    labelKey,
    mode,
    value,
    enabled: hasBeenVisible,
  })

  const chartHeight = `${BREAKDOWN_CHART_HEIGHT}px`
  const showChart = computed(() => Boolean(chartOption.value) && !loading.value && !error.value)
  const showFooter = computed(() => showChart.value && seriesLegends.value.length > 0)
  const chartRenderKey = computed(
    () => `${props.metric}:${props.labelKey}:${props.mode}:${props.value ?? ''}:${promqlQuery.value}`
  )

  const timeWindowMs = computed(() => {
    const range = ctx.unixTimeRange()
    if (range.length !== 2) {
      return null
    }
    return { fromMs: range[0] * 1000, toMs: range[1] * 1000 }
  })

  const onTimeRangeChange = ([startSec, endSec]: [number, number]) => {
    if (!(endSec > startSec)) {
      return
    }
    ctx.rangeTime.value = [String(startSec), String(endSec)]
    ctx.time.value = 0
    ctx.triggerRefresh()
  }
</script>

<style scoped lang="less">
  .breakdown-mini-chart {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .panel-loading,
  .panel-state {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: v-bind(chartHeight);
  }

  .panel-state {
    border: 1px dashed var(--color-border-2);
    border-radius: var(--gpt-radius-md);
    font-size: var(--gpt-font-base);
    color: var(--color-text-3);
  }

  .panel-error {
    color: rgb(var(--danger-6));
  }

  .panel-chart {
    flex-shrink: 0;
    overflow: hidden;
    border-radius: var(--gpt-radius-md);
    background: var(--gpt-bg-panel);
  }

  .panel-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--gpt-gap-md);
    margin-top: var(--gpt-gap-xs);
  }

  .query-legend-list {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: var(--gpt-gap-sm) var(--gpt-gap-md);
    min-width: 0;
    overflow: hidden;
  }

  .query-legend {
    display: inline-flex;
    align-items: center;
    gap: var(--gpt-gap-sm);
    max-width: 100%;
    overflow: hidden;
    font-size: var(--gpt-font-sm);
    line-height: 1.2;
    color: var(--color-text-2);
    cursor: default;
  }

  .legend-swatch {
    flex-shrink: 0;
    width: 12px;
    height: 3px;
    border-radius: var(--gpt-radius-xs);
  }

  .legend-name {
    overflow: hidden;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .series-count {
    flex-shrink: 0;
    font-size: var(--gpt-font-sm);
    color: var(--color-text-3);
  }
</style>
