<template lang="pug">
.traces-breakdown-mini-chart(ref="targetRef")
  a-spin.panel-loading(v-if="loading || !ready" :loading="true")
  .panel-state.panel-error(v-else-if="error") {{ t('drilldown.traces.redChartError') }}
  .panel-state(v-else-if="isEmpty") {{ t('drilldown.traces.redChartNoData') }}
  .panel-chart(v-else-if="showChart")
    Chart(:key="chartRenderKey" :height="chartHeight" :options="chartOption")
</template>

<script setup lang="ts">
  import { computed, ref, watch, type MaybeRefOrGetter } from 'vue'
  import type { EChartsOption } from 'echarts'
  import { storeToRefs } from 'pinia'
  import { useI18n } from 'vue-i18n'
  import Chart from '@/components/raw-chart/index.vue'
  import { useAppStore } from '@/store'
  import { useDrilldownContext } from '@/observability/context'
  import { fetchRedTimeseries, type RedMetric } from '@/observability/adapters/traces'
  import { BREAKDOWN_CHART_HEIGHT } from '@/observability/metrics/panel-stats'
  import { buildBarSparklineOption, buildSparklineOption } from '@/observability/metrics/prom-chart'
  import { redMetricBarColor, redMetricPanelUnit } from '@/observability/traces/red-queries'
  import useLazyPanelQuery from '@/observability/use-lazy-panel-query'

  const props = withDefaults(
    defineProps<{
      redMetric: RedMetric
      attrKey: string
      attrValue: string
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
  const ready = computed(() => !props.lazy || hasBeenVisible.value)

  const loading = ref(false)
  const error = ref<string | null>(null)
  const chartOption = ref<EChartsOption | null>(null)
  const isEmpty = ref(false)
  let requestVersion = 0

  const chartHeight = computed(() => `${props.height}px`)
  const showChart = computed(() => Boolean(chartOption.value) && !loading.value && !error.value)
  const chartRenderKey = computed(
    () =>
      `${props.redMetric}:${props.attrKey}:${props.attrValue}:${ctx.refreshKey.value}:${
        ctx.time.value
      }:${ctx.rangeTime.value.join(',')}`
  )

  async function load() {
    if (ctx.focusTraceId.value) {
      return
    }
    if (!ready.value || !ctx.tracesTable.value || !props.attrKey || !props.attrValue) {
      return
    }
    requestVersion += 1
    const version = requestVersion
    loading.value = true
    error.value = null
    try {
      const points = await fetchRedTimeseries(ctx, props.redMetric, {
        extraEquals: [{ column: props.attrKey, value: props.attrValue }],
      })
      if (version !== requestVersion) {
        return
      }
      if (!points.length) {
        chartOption.value = null
        isEmpty.value = true
        return
      }
      isEmpty.value = false
      const unixRange = ctx.unixTimeRange()
      const timeRange = unixRange.length === 2 ? ([unixRange[0], unixRange[1]] as [number, number]) : undefined
      const panelUnit = redMetricPanelUnit(props.redMetric)

      // Breakdown cards: Rate/Errors match RED bars; Duration stays AVG timeseries (Grafana Breakdown ≠ heatmap).
      if (props.redMetric === 'duration') {
        chartOption.value = buildSparklineOption(points, {
          color: isDark.value ? '#FF9830' : '#FF780A',
          metricKind: 'gauge',
          panelUnit,
          timeRange,
          showPoints: 'never',
        })
      } else {
        chartOption.value = buildBarSparklineOption(points, {
          color: redMetricBarColor(props.redMetric, isDark.value),
          panelUnit,
          timeRange,
        })
      }
    } catch (err) {
      if (version !== requestVersion) {
        return
      }
      console.error('Failed to load traces breakdown mini chart', err)
      error.value = 'error'
      chartOption.value = null
      isEmpty.value = false
    } finally {
      if (version === requestVersion) {
        loading.value = false
      }
    }
  }

  watch(
    () => [
      ready.value,
      props.redMetric,
      props.attrKey,
      props.attrValue,
      props.colorIndex,
      ctx.tracesTable.value,
      ctx.refreshKey.value,
      ctx.time.value,
      ctx.rangeTime.value[0],
      ctx.rangeTime.value[1],
      ctx.filters.value,
      ctx.focusTraceId.value,
      isDark.value,
    ],
    () => {
      if (ctx.focusTraceId.value) {
        return
      }
      load()
    },
    { deep: true, immediate: true }
  )
</script>

<style scoped lang="less">
  .traces-breakdown-mini-chart {
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
</style>
