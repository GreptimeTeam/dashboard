<template lang="pug">
.logs-volume-mini-chart(ref="targetRef")
  a-spin.panel-loading(v-if="loading || !ready" :loading="true")
  .panel-state.panel-error(v-else-if="error") {{ t('drilldown.main.sparklineError') }}
  .panel-state(v-else-if="isEmpty") {{ t('drilldown.main.sparklineNoData') }}
  .panel-chart(v-else-if="showChart")
    .volume-plot(ref="plotRef")
      Chart(
        :key="chartRenderKey"
        time-interaction
        :height="chartHeight"
        :options="chartOption"
        :brush-select="false"
        :time-window-ms="timeWindowMs"
        @time-range-change="onTimeRangeChange"
      )
    .volume-legend(v-if="legendRows.length")
      .legend-header
        span {{ t('drilldown.logs.legendName') }}
        span.legend-total {{ t('drilldown.logs.legendTotal') }}
      button.legend-row(
        v-for="row in legendRows"
        :key="row.name"
        type="button"
        :class="{ 'is-hidden': isLevelHidden(row.name) }"
        @click="onLegendClick(row.name)"
      )
        span.legend-swatch(:style="{ background: row.color }")
        span.legend-name(:title="row.name") {{ row.name }}
        span.legend-total {{ row.total }}
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type MaybeRefOrGetter } from 'vue'
  import type { EChartsOption } from 'echarts'
  import { storeToRefs } from 'pinia'
  import { useI18n } from 'vue-i18n'
  import Chart from '@/components/raw-chart/index.vue'
  import { toggleLegendSolo } from '@/components/raw-chart/legend-solo'
  import { useAppStore } from '@/store'
  import { useDrilldownContext } from '@/observability/context'
  import { fetchLogVolumeTimeseries } from '@/observability/adapters/logs'
  import { addFilter, splitFilterOrValues } from '@/observability/filters'
  import { formatLogCountShort, logLevelColor, normalizeLogLevelName } from '@/observability/logs/level-color'
  import buildLogVolumeBarsOption from '@/observability/logs/volume-bars'
  import { LOG_VOLUME_FALLBACK_WIDTH_PX, LOG_VOLUME_LEGEND_WIDTH_PX } from '@/observability/logs/volume-step'
  import type { LogVolumeSeries } from '@/observability/logs/volume-series'
  import { BREAKDOWN_CHART_HEIGHT } from '@/observability/metrics/panel-stats'
  import useLazyPanelQuery from '@/observability/use-lazy-panel-query'

  const props = withDefaults(
    defineProps<{
      labelCol?: string
      labelValue?: string
      /** Chart plot height in px (detail main chart uses MAIN_CHART_HEIGHT). */
      height?: number
      /** When false, load immediately (e.g. overview total volume). */
      lazy?: boolean
      scrollRoot?: MaybeRefOrGetter<HTMLElement | null | undefined>
      /** When false, skip fetch (e.g. overview panel cached under detail route). */
      enabled?: boolean
      /** Overview panel-local selection. Empty shows every level. */
      selectedLevels?: string[]
      /** Detail: write the shared severity filter so the logs table and level dropdown stay in sync. */
      syncSeverityFilter?: boolean
    }>(),
    {
      height: BREAKDOWN_CHART_HEIGHT,
      lazy: true,
      enabled: true,
      selectedLevels: () => [],
      syncSeverityFilter: false,
    }
  )

  const emit = defineEmits<{
    'update:selectedLevels': [levels: string[]]
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const { isDark } = storeToRefs(useAppStore())

  const { targetRef, hasBeenVisible } = useLazyPanelQuery(props.scrollRoot ?? (() => null))
  const ready = computed(() => !props.lazy || hasBeenVisible.value)

  const loading = ref(false)
  const error = ref<string | null>(null)
  const chartOption = ref<EChartsOption | null>(null)
  const seriesList = ref<LogVolumeSeries[]>([])
  const isEmpty = ref(false)
  const containerWidth = ref(0)
  const plotWidth = ref(0)
  const plotRef = ref<HTMLElement | null>(null)
  let requestVersion = 0
  let resizeObserver: ResizeObserver | null = null

  const chartHeight = computed(() => `${props.height}px`)
  const timeWindowMs = computed(() => {
    const range = ctx.unixTimeRange()
    if (range.length !== 2) {
      return null
    }
    return { fromMs: range[0] * 1000, toMs: range[1] * 1000 }
  })

  function onTimeRangeChange([startSec, endSec]: [number, number]) {
    if (!(endSec > startSec)) {
      return
    }
    ctx.rangeTime.value = [String(startSec), String(endSec)]
    ctx.time.value = 0
    ctx.triggerRefresh()
  }
  const showChart = computed(() => Boolean(chartOption.value) && !loading.value && !error.value)
  const plotWidthPx = computed(() => {
    if (plotWidth.value > 0) {
      return plotWidth.value
    }
    if (containerWidth.value <= 0) {
      return LOG_VOLUME_FALLBACK_WIDTH_PX
    }
    return Math.max(80, containerWidth.value - LOG_VOLUME_LEGEND_WIDTH_PX)
  })
  const widthBucket = computed(() => Math.round(plotWidthPx.value / 16) * 16)
  const chartRenderKey = computed(
    () =>
      `${props.labelCol ?? ''}:${props.labelValue ?? ''}:${ctx.refreshKey.value}:${
        ctx.time.value
      }:${ctx.rangeTime.value.join(',')}:${widthBucket.value}`
  )
  const legendRows = computed(() =>
    [...seriesList.value].reverse().map((series) => ({
      name: series.name,
      color: logLevelColor(series.name, isDark.value),
      total: formatLogCountShort(series.points.reduce((sum, point) => sum + point[1], 0)),
    }))
  )

  function severityColumn(): string | undefined {
    return ctx.fieldMap.value.logs.severity || undefined
  }

  function levelsFromFilters(): string[] {
    const column = severityColumn()
    if (!column) {
      return []
    }
    const hit = ctx.filters.value.find((filter) => filter.key === column && (filter.op === '=' || filter.op === '=~'))
    return hit ? splitFilterOrValues(hit) : []
  }

  const activeLevels = computed(() => (props.syncSeverityFilter ? levelsFromFilters() : props.selectedLevels))

  function isLevelHidden(name: string): boolean {
    if (!activeLevels.value.length) {
      return false
    }
    const selected = new Set(activeLevels.value.map(normalizeLogLevelName))
    return !selected.has(normalizeLogLevelName(name))
  }

  function paint() {
    if (!seriesList.value.length) {
      return
    }
    const selected = new Set(activeLevels.value.map(normalizeLogLevelName))
    const matched = selected.size
      ? seriesList.value.filter((series) => selected.has(normalizeLogLevelName(series.name)))
      : seriesList.value
    const plotted = matched.length
      ? matched
      : seriesList.value.map((series) => ({
          ...series,
          points: series.points.map(([time]) => [time, 0] as [number, number]),
        }))
    const unixRange = ctx.unixTimeRange()
    chartOption.value = buildLogVolumeBarsOption(plotted, {
      isDark: isDark.value,
      timeRange: unixRange.length === 2 ? [unixRange[0], unixRange[1]] : undefined,
      plotWidthPx: plotWidthPx.value,
      plotHeightPx: props.height,
    })
  }

  function writeSeverityLevels(levels: string[]) {
    const column = severityColumn()
    if (!column) {
      return
    }
    if (!ctx.fieldMap.value.logs[column]) {
      ctx.fieldMap.value = {
        ...ctx.fieldMap.value,
        logs: { ...ctx.fieldMap.value.logs, [column]: column },
      }
    }
    const nextValues = [...new Set(levels.map((value) => value.trim()).filter(Boolean))]
    let next = ctx.filters.value.filter((filter) => filter.key !== column && filter.key !== 'severity')
    nextValues.forEach((value) => {
      next = addFilter(next, { key: column, op: '=', value })
    })
    ctx.setFilters(next)
  }

  function onLegendClick(name: string) {
    if (!seriesList.value.length) {
      return
    }
    const current = activeLevels.value.length === 1 ? activeLevels.value[0] : null
    const next = toggleLegendSolo(current, name)
    const levels = next ? [next] : []
    if (props.syncSeverityFilter) {
      writeSeverityLevels(levels)
      return
    }
    emit('update:selectedLevels', levels)
  }

  function measureWidth() {
    const width = targetRef.value?.clientWidth ?? 0
    if (width > 0) {
      containerWidth.value = width
    }
    const plot = plotRef.value?.clientWidth ?? 0
    if (plot > 0) {
      plotWidth.value = plot
    }
  }

  async function load() {
    if (!props.enabled || !ready.value || !ctx.logsTable.value) {
      return
    }
    requestVersion += 1
    const version = requestVersion
    loading.value = true
    error.value = null
    try {
      const series = await fetchLogVolumeTimeseries(ctx, {
        labelCol: props.labelCol,
        value: props.labelValue,
        plotWidthPx: widthBucket.value,
      })
      if (version !== requestVersion) {
        return
      }
      if (!series.length) {
        chartOption.value = null
        seriesList.value = []
        isEmpty.value = true
        return
      }
      isEmpty.value = false
      seriesList.value = series
      paint()
    } catch (err) {
      if (version !== requestVersion) {
        return
      }
      console.error('Failed to load logs volume mini chart', err)
      error.value = 'error'
      chartOption.value = null
      seriesList.value = []
      isEmpty.value = false
    } finally {
      if (version === requestVersion) {
        loading.value = false
      }
    }
  }

  onMounted(() => {
    measureWidth()
    if (typeof ResizeObserver !== 'undefined' && targetRef.value) {
      resizeObserver = new ResizeObserver(() => {
        measureWidth()
      })
      resizeObserver.observe(targetRef.value)
    }
  })

  watch(showChart, (shown) => {
    if (!shown) {
      return
    }
    nextTick(() => {
      if (plotRef.value && resizeObserver) {
        resizeObserver.observe(plotRef.value)
      }
      measureWidth()
      paint()
    })
  })

  watch(plotWidth, () => {
    paint()
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
  })

  watch(
    () => {
      const base: unknown[] = [
        props.enabled,
        ready.value,
        props.labelCol,
        props.labelValue,
        widthBucket.value,
        ctx.logsTable.value,
        ctx.refreshKey.value,
        ctx.time.value,
        ctx.rangeTime.value[0],
        ctx.rangeTime.value[1],
        ctx.logsView.value,
        ctx.fieldMap.value.logs.severity,
        isDark.value,
      ]
      if (ctx.logsView.value === 'detail') {
        const column = ctx.fieldMap.value.logs.severity
        base.push(ctx.filters.value.filter((filter) => filter.key !== column && filter.key !== 'severity'))
      }
      return base
    },
    () => {
      if (!props.enabled) {
        return
      }
      load()
    },
    { deep: true, immediate: true }
  )

  watch(
    () => activeLevels.value.join('\0'),
    () => {
      paint()
    }
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
    border-radius: var(--gpt-radius-md);
    font-size: var(--gpt-font-base);
    color: var(--color-text-3);
  }

  .panel-error {
    color: rgb(var(--danger-6));
  }

  .panel-chart {
    display: flex;
    flex: 1;
    gap: var(--gpt-gap-md);
    min-height: 0;
    overflow: hidden;
    background: transparent;
  }

  .volume-plot {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }

  .volume-legend {
    display: flex;
    flex: 0 0 112px;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding-top: 4px;
    font-size: 11px;
    line-height: 16px;
    color: var(--color-text-2);
  }

  .legend-header,
  .legend-row {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto;
    column-gap: 6px;
    align-items: center;
  }

  .legend-row {
    width: 100%;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &.is-hidden {
      opacity: 0.35;
    }
  }

  .legend-header {
    grid-template-columns: 1fr auto;
    margin-bottom: 2px;
    color: var(--color-text-3);
    font-weight: var(--gpt-font-weight-control);

    .legend-total {
      color: var(--color-text-3);
    }
  }

  .legend-swatch {
    width: 10px;
    height: 3px;
    border-radius: 1px;
  }

  .legend-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .legend-total {
    font-variant-numeric: tabular-nums;
    color: var(--color-text-1);
  }
</style>
