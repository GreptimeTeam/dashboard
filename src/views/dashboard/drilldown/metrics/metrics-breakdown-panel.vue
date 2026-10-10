<template lang="pug">
article.metrics-breakdown-panel.drilldown-card(ref="targetRef")
  .drilldown-card__header
    .drilldown-card__title-row(:title="titleText")
      span.drilldown-card__title {{ titleText }}
      span.drilldown-card__meta(v-if="mode === 'label'") {{ values.length }} {{ t('drilldown.breakdown.values') }}
    //- Grafana MetricLabelsList: hide Select when series.length === 1; no Add to filter on label cards
    a-button(
      v-if="mode === 'label' && values.length > 1"
      type="outline"
      size="small"
      @click="emit('select')"
    )
      | {{ t('drilldown.breakdown.selectLabel') }}
    a-button(
      v-else-if="canAddToFilter"
      type="outline"
      size="small"
      @click="addToFilter"
    )
      | {{ t('drilldown.filters.addToFilter') }}
  .drilldown-card__body
    DrilldownChartPanel(
      :option="chartOption"
      :height="BREAKDOWN_CHART_HEIGHT"
      :loading="loading"
      :error="error ? t('drilldown.main.sparklineError') : null"
      :unsupported-message="unsupported ? t('drilldown.main.sparklineUnsupported') : null"
      :empty-message="isEmpty ? t('drilldown.main.sparklineNoData') : null"
      :render-key="chartRenderKey"
      :show-footer="seriesLegends.length > 0"
    )
      template(#footer)
        .drilldown-query-legend-list(v-if="seriesLegends.length")
          .drilldown-query-legend(
            v-for="item in seriesLegends"
            :key="item.name"
            :title="sparklineMode === 'groupBy' ? item.name : promqlQuery"
          )
            span.drilldown-legend-swatch(:style="{ background: item.color }")
            span.drilldown-legend-name {{ item.name }}
        span.drilldown-series-count(v-if="sparklineMode === 'groupBy' && seriesCount > seriesLegends.length") {{ t('drilldown.main.seriesCount', { count: seriesCount }) }}
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, toRef, watch, type MaybeRefOrGetter } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { fetchBreakdownLabelValues } from '@/observability/metrics/breakdown'
  import { BREAKDOWN_CHART_HEIGHT, METRIC_PANEL_HEIGHT } from '@/observability/metrics/panel-stats'
  import useBreakdownSparkline, { type BreakdownSparklineMode } from '@/observability/use-breakdown-sparkline'
  import { useBreakdownYAxisSync } from '@/observability/use-breakdown-y-axis-sync'
  import useLazyPanelQuery from '@/observability/use-lazy-panel-query'
  import DrilldownChartPanel from '../components/drilldown-chart-panel.vue'

  const panelHeightPx = `${METRIC_PANEL_HEIGHT}px`

  const props = defineProps<{
    metric: string
    labelKey: string
    mode: 'label' | 'value'
    value?: string
    scrollRoot: MaybeRefOrGetter<HTMLElement | null | undefined>
  }>()

  const emit = defineEmits<{
    select: []
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const metric = toRef(props, 'metric')
  const labelKey = toRef(props, 'labelKey')
  const value = toRef(props, 'value')
  const sparklineMode = computed<BreakdownSparklineMode>(() => (props.mode === 'label' ? 'groupBy' : 'value'))
  const { targetRef, hasBeenVisible } = useLazyPanelQuery(props.scrollRoot)
  const yAxisSync = useBreakdownYAxisSync()

  const { loading, error, chartOption, promqlQuery, seriesCount, seriesLegends, isEmpty, unsupported } =
    useBreakdownSparkline(ctx, {
      metric,
      labelKey,
      mode: sparklineMode,
      value,
      enabled: hasBeenVisible,
      yAxisSync,
    })

  const values = ref<string[]>([])
  // Add to filter only on value cards (Grafana AddToFiltersGraphAction), never on label cards
  const canAddToFilter = computed(
    () => props.mode === 'value' && Boolean(props.value) && props.value !== '<unspecified>'
  )
  const titleText = computed(() => (props.mode === 'label' ? props.labelKey : `${props.labelKey}="${props.value}"`))
  const chartRenderKey = computed(
    () => `${props.metric}:${props.labelKey}:${props.mode}:${props.value ?? ''}:${promqlQuery.value}`
  )

  async function loadValues() {
    if (props.mode !== 'label') {
      return
    }
    values.value = await fetchBreakdownLabelValues(ctx, props.metric, props.labelKey)
  }

  function addToFilter() {
    if (!canAddToFilter.value) {
      return
    }
    ctx.actions.appendFilter({ key: props.labelKey, op: '=', value: props.value })
  }

  onMounted(loadValues)

  watch(
    () => [
      ctx.query.filters.value,
      ctx.query.time.value,
      ctx.query.rangeTime.value[0],
      ctx.query.rangeTime.value[1],
      ctx.query.refreshKey.value,
    ],
    () => {
      if (props.mode === 'label') {
        loadValues()
      }
    },
    { deep: true }
  )
</script>

<style scoped lang="less">
  .metrics-breakdown-panel {
    min-height: v-bind(panelHeightPx);
  }
</style>
