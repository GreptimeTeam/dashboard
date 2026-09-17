<template lang="pug">
.red-chart-panel(
  role="button"
  tabindex="0"
  :class="{ selected }"
  @click="emit('select')"
  @keydown.enter.prevent="emit('select')"
  @keydown.space.prevent="emit('select')"
)
  .red-chart-panel-header
    span.red-chart-panel-title {{ title }}
    span.red-chart-panel-hint(v-if="selected") {{ t('drilldown.traces.redSelected') }}
  a-spin.panel-loading(v-if="loading" :loading="true")
  .panel-state.panel-error(v-else-if="error") {{ t('drilldown.traces.redChartError') }}
  .panel-state(v-else-if="isEmpty") {{ t('drilldown.traces.redChartNoData') }}
  .panel-chart(v-else-if="showChart")
    Chart(
      :key="chartRenderKey"
      :height="chartHeight"
      :options="chartOption"
      :time-interaction="false"
    )
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type { EChartsOption } from 'echarts'
  import { storeToRefs } from 'pinia'
  import { useI18n } from 'vue-i18n'
  import Chart from '@/components/raw-chart/index.vue'
  import { useAppStore } from '@/store'
  import { useDrilldownContext } from '@/observability/context'
  import { fetchDurationHeatmap, fetchRedTimeseries, type RedMetric } from '@/observability/adapters/traces'
  import { buildBarSparklineOption, buildHeatmapOption } from '@/observability/metrics/prom-chart'
  import {
    redMetricBarColor,
    redMetricChartKind,
    redMetricPanelUnit,
    volumeIntervalSecondsFromRange,
  } from '@/observability/traces/red-queries'

  const props = defineProps<{
    metric: RedMetric
    title: string
    selected: boolean
    colorIndex: number
    height?: number
  }>()

  const emit = defineEmits<{
    select: []
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const { isDark } = storeToRefs(useAppStore())

  const loading = ref(false)
  const error = ref<string | null>(null)
  const chartOption = ref<EChartsOption | null>(null)
  const isEmpty = ref(false)
  let requestVersion = 0

  const chartHeightPx = computed(() => props.height ?? 140)
  const chartHeight = computed(() => `${chartHeightPx.value}px`)
  const showChart = computed(() => Boolean(chartOption.value) && !loading.value && !error.value)
  const chartRenderKey = computed(
    () =>
      `${props.metric}:${redMetricChartKind(props.metric)}:${ctx.refreshKey.value}:${
        ctx.time.value
      }:${ctx.rangeTime.value.join(',')}:${ctx.tracesTable.value}`
  )

  async function load() {
    if (ctx.focusTraceId.value) {
      return
    }
    if (!ctx.tracesTable.value) {
      chartOption.value = null
      isEmpty.value = true
      return
    }
    requestVersion += 1
    const version = requestVersion
    loading.value = true
    error.value = null
    try {
      const unixRange = ctx.unixTimeRange()
      const timeRange = unixRange.length === 2 ? ([unixRange[0], unixRange[1]] as [number, number]) : undefined

      if (props.metric === 'duration') {
        const heatmap = await fetchDurationHeatmap(ctx)
        if (version !== requestVersion) {
          return
        }
        if (!heatmap?.cells.length) {
          chartOption.value = null
          isEmpty.value = true
          return
        }
        isEmpty.value = false
        chartOption.value = buildHeatmapOption(heatmap, undefined, {
          // Cell magnitude = span count; Y axis = duration seconds.
          cellUnit: 'none',
          yUnit: 's',
          timeRange,
          stepSeconds: volumeIntervalSecondsFromRange(ctx.time.value, ctx.rangeTime.value),
          plotHeightPx: chartHeightPx.value,
        })
        return
      }

      const points = await fetchRedTimeseries(ctx, props.metric)
      if (version !== requestVersion) {
        return
      }
      if (!points.length) {
        chartOption.value = null
        isEmpty.value = true
        return
      }
      isEmpty.value = false
      chartOption.value = buildBarSparklineOption(points, {
        color: redMetricBarColor(props.metric, isDark.value),
        panelUnit: redMetricPanelUnit(props.metric),
        timeRange,
        plotHeightPx: chartHeightPx.value,
      })
    } catch (err) {
      if (version !== requestVersion) {
        return
      }
      console.error(`Failed to load RED chart (${props.metric})`, err)
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
      props.metric,
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
  .red-chart-panel {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: var(--gpt-gap-md) var(--gpt-gap-lg);
    border: 1px solid var(--color-border-2);
    border-radius: var(--gpt-radius-md);
    background: var(--color-bg-2);
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }

  .red-chart-panel:hover {
    border-color: var(--color-border-3);
  }

  .red-chart-panel:focus-visible {
    outline: var(--gpt-gap-2xs) solid var(--color-primary, var(--brand-color));
    outline-offset: var(--gpt-gap-2xs);
  }

  .red-chart-panel.selected {
    border-color: var(--color-primary, var(--brand-color));
    background: var(--color-fill-1);
    box-shadow: inset 0 0 0 1px var(--color-primary, var(--brand-color));
  }

  .red-chart-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--gpt-gap-md);
    margin-bottom: var(--gpt-gap-md);
  }

  .red-chart-panel-title {
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-control);
    color: var(--color-text-1);
  }

  .red-chart-panel.selected .red-chart-panel-title {
    color: var(--color-primary, var(--brand-color));
  }

  .red-chart-panel-hint {
    font-size: var(--gpt-font-sm);
    color: var(--color-text-3);
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
