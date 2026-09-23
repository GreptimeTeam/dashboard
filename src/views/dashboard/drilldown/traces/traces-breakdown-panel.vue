<template lang="pug">
article.traces-breakdown-panel.drilldown-card(ref="targetRef")
  .drilldown-card__header
    .drilldown-card__title-row(:title="titleText")
      span.drilldown-card__title {{ titleText }}
    a-button(
      v-if="canAddToFilter"
      type="outline"
      size="mini"
      @click="addToFilter"
    )
      | {{ t('drilldown.filters.addToFilter') }}
  .drilldown-card__body
    DrilldownChartPanel(
      :option="chartOption"
      :height="height"
      :loading="!ready"
      :empty-message="isEmpty ? t('drilldown.traces.redChartNoData') : null"
      :render-key="chartRenderKey"
    )
</template>

<script setup lang="ts">
  import { computed, ref, watch, type MaybeRefOrGetter } from 'vue'
  import type { EChartsOption } from 'echarts'
  import { storeToRefs } from 'pinia'
  import { useI18n } from 'vue-i18n'
  import { useAppStore } from '@/store'
  import { useDrilldownContext } from '@/observability/context'
  import type { RedMetric } from '@/observability/adapters/traces'
  import { BREAKDOWN_CHART_HEIGHT, METRIC_PANEL_HEIGHT } from '@/observability/metrics/panel-stats'
  import { buildBarSparklineOption, buildSparklineOption } from '@/observability/metrics/prom-chart'
  import { redMetricBarColor, redMetricPanelUnit } from '@/observability/traces/red-queries'
  import useLazyPanelQuery from '@/observability/use-lazy-panel-query'
  import DrilldownChartPanel from '../components/drilldown-chart-panel.vue'

  const props = withDefaults(
    defineProps<{
      redMetric: RedMetric
      attrKey: string
      attrValue: string
      points: Array<[number, number]>
      yMin: number
      yMax: number
      colorIndex?: number
      height?: number
      lazy?: boolean
      scrollRoot?: MaybeRefOrGetter<HTMLElement | null | undefined>
    }>(),
    {
      colorIndex: 0,
      height: BREAKDOWN_CHART_HEIGHT,
      lazy: true,
    }
  )

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const { isDark } = storeToRefs(useAppStore())
  const { targetRef, hasBeenVisible } = useLazyPanelQuery(props.scrollRoot ?? (() => null))
  const panelHeightPx = `${METRIC_PANEL_HEIGHT}px`
  const ready = computed(() => !props.lazy || hasBeenVisible.value)

  const chartOption = ref<EChartsOption | null>(null)
  const isEmpty = ref(false)
  const canAddToFilter = computed(() => Boolean(props.attrValue) && props.attrValue !== '<unspecified>')
  const titleText = computed(() => `${props.attrKey}="${props.attrValue}"`)
  const chartRenderKey = computed(
    () =>
      `${props.redMetric}:${props.attrKey}:${props.attrValue}:${ctx.refreshKey.value}:${
        ctx.time.value
      }:${ctx.rangeTime.value.join(',')}`
  )

  function addToFilter() {
    if (!canAddToFilter.value) {
      return
    }
    ctx.appendFilter({ key: props.attrKey, op: '=', value: props.attrValue })
  }

  function render() {
    if (!ready.value || !props.points.length) {
      chartOption.value = null
      isEmpty.value = ready.value
      return
    }

    isEmpty.value = false
    const unixRange = ctx.unixTimeRange()
    const timeRange = unixRange.length === 2 ? ([unixRange[0], unixRange[1]] as [number, number]) : undefined
    const panelUnit = redMetricPanelUnit(props.redMetric)
    const axis = { yMin: props.yMin, yMax: props.yMax, timeRange }

    if (props.redMetric === 'duration') {
      chartOption.value = buildSparklineOption(props.points, {
        color: isDark.value ? '#FF9830' : '#FF780A',
        metricKind: 'gauge',
        panelUnit,
        showPoints: 'never',
        ...axis,
      })
      return
    }

    chartOption.value = buildBarSparklineOption(props.points, {
      color: redMetricBarColor(props.redMetric, isDark.value),
      panelUnit,
      ...axis,
    })
  }

  watch(
    () => [
      ready.value,
      props.redMetric,
      props.points,
      props.yMin,
      props.yMax,
      ctx.time.value,
      ctx.rangeTime.value[0],
      ctx.rangeTime.value[1],
      isDark.value,
    ],
    () => {
      render()
    },
    { deep: true, immediate: true }
  )
</script>

<style scoped lang="less">
  .traces-breakdown-panel {
    min-height: v-bind(panelHeightPx);
  }
</style>
