<template lang="pug">
.logs-volume-mini-chart(ref="targetRef")
  a-spin.panel-loading(v-if="loading || !ready" :loading="true")
  .panel-state.panel-error(v-else-if="error") {{ t('drilldown.main.sparklineError') }}
  .panel-state(v-else-if="isEmpty") {{ t('drilldown.main.sparklineNoData') }}
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
  import { fetchLogVolumeTimeseries } from '@/observability/adapters/logs'
  import { BREAKDOWN_CHART_HEIGHT } from '@/observability/metrics/panel-stats'
  import { buildSparklineOption } from '@/observability/metrics/prom-chart'
  import getSeriesColorByIndex from '@/observability/metrics/series-colors'
  import useLazyPanelQuery from '@/observability/use-lazy-panel-query'

  const props = withDefaults(
    defineProps<{
      labelCol?: string
      labelValue?: string
      colorIndex?: number
      /** When false, load immediately (e.g. overview total volume). */
      lazy?: boolean
      scrollRoot?: MaybeRefOrGetter<HTMLElement | null | undefined>
    }>(),
    {
      colorIndex: 0,
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

  const chartHeight = `${BREAKDOWN_CHART_HEIGHT}px`
  const showChart = computed(() => Boolean(chartOption.value) && !loading.value && !error.value)
  const chartRenderKey = computed(
    () =>
      `${props.labelCol ?? ''}:${props.labelValue ?? ''}:${ctx.refreshKey.value}:${
        ctx.time.value
      }:${ctx.rangeTime.value.join(',')}`
  )
  const seriesColor = computed(() => getSeriesColorByIndex(props.colorIndex, isDark.value))

  async function load() {
    if (!ready.value || !ctx.logsTable.value) {
      return
    }
    requestVersion += 1
    const version = requestVersion
    loading.value = true
    error.value = null
    try {
      const points = await fetchLogVolumeTimeseries(ctx, {
        labelCol: props.labelCol,
        value: props.labelValue,
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
      chartOption.value = buildSparklineOption(points, {
        color: seriesColor.value,
        metricKind: 'unknown',
        timeRange: unixRange.length === 2 ? [unixRange[0], unixRange[1]] : undefined,
        showPoints: 'never',
      })
    } catch (err) {
      if (version !== requestVersion) {
        return
      }
      console.error('Failed to load logs volume mini chart', err)
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
      props.labelCol,
      props.labelValue,
      props.colorIndex,
      ctx.logsTable.value,
      ctx.refreshKey.value,
      ctx.time.value,
      ctx.rangeTime.value[0],
      ctx.rangeTime.value[1],
      ctx.filters.value,
      isDark.value,
    ],
    () => {
      load()
    },
    { deep: true, immediate: true }
  )
</script>

<style scoped lang="less">
  .logs-volume-mini-chart {
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
    border-radius: 6px;
    font-size: 12px;
    color: var(--color-text-3);
  }

  .panel-error {
    color: rgb(var(--danger-6));
  }

  .panel-chart {
    flex-shrink: 0;
    overflow: hidden;
    border-radius: 6px;
    background: var(--gpt-bg-panel);
  }
</style>
