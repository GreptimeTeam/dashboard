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
  DrilldownChartPanel(
    :option="chartOption"
    :height="chartHeightPx"
    :loading="loading"
    :error="error ? t('drilldown.traces.redChartError') : null"
    :empty-message="isEmpty ? t('drilldown.traces.redChartNoData') : null"
    :render-key="chartRenderKey"
  )
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type { EChartsOption } from 'echarts'
  import { storeToRefs } from 'pinia'
  import { useI18n } from 'vue-i18n'
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
  import DrilldownChartPanel from '../components/drilldown-chart-panel.vue'

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
      ctx.refreshKey.value,
      ctx.filters.value,
      ctx.time.value,
      ctx.rangeTime.value[0],
      ctx.rangeTime.value[1],
      ctx.tracesTable.value,
      props.metric,
      isDark.value,
    ],
    () => {
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
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-md);
    background: var(--gpt-bg-panel);
    cursor: pointer;

    &:hover {
      border-color: var(--gpt-border-strong);
    }

    &:focus-visible {
      outline: var(--gpt-gap-2xs) solid var(--gpt-main-purple);
      outline-offset: var(--gpt-gap-2xs);
    }

    &.selected {
      border-color: var(--gpt-main-purple);
      background: var(--gpt-bg-code-line);
      box-shadow: inset 0 0 0 1px var(--gpt-main-purple);
    }
  }

  .red-chart-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--gpt-gap-md);
    margin-bottom: var(--gpt-gap-md);
  }

  .red-chart-panel-title {
    min-width: 0;
    overflow: hidden;
    color: var(--gpt-text-primary);
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-control);
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .red-chart-panel.selected .red-chart-panel-title {
    color: var(--gpt-main-purple);
  }

  .red-chart-panel-hint {
    flex-shrink: 0;
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-sm);
  }
</style>
