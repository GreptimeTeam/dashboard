<template lang="pug">
.logs-volume-mini-chart(ref="targetRef" :class="{ 'is-legend-bottom': legend === 'bottom' }")
  DrilldownChartPanel(
    ref="chartPanelRef"
    :option="chartOption"
    :height="height"
    :loading="loading || !ready"
    :error="error ? t('drilldown.main.sparklineError') : null"
    :empty-message="isEmpty ? t('drilldown.main.sparklineNoData') : null"
    :render-key="chartRenderKey"
    :chart-class="{ 'logs-volume-mini-chart__chart--bottom': legend === 'bottom' }"
    :show-footer="legend === 'bottom' && legendRows.length > 0"
  )
    template(#aside)
      .volume-legend(v-if="legendRows.length && legend !== 'bottom'")
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
    template(#footer)
      .drilldown-query-legend-list(v-if="legend === 'bottom' && legendRows.length")
        button.drilldown-query-legend.logs-volume-mini-chart__legend-button(
          v-for="row in legendRows"
          :key="row.name"
          type="button"
          :class="{ 'is-hidden': isLevelHidden(row.name) }"
          :title="row.name"
          @click="onLegendClick(row.name)"
        )
          span.legend-swatch(:style="{ background: row.color }")
          span.legend-name {{ row.name }}
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type MaybeRefOrGetter } from 'vue'
  import type { EChartsOption } from 'echarts'
  import { storeToRefs } from 'pinia'
  import { useI18n } from 'vue-i18n'
  import { toggleLegendSolo } from '@/components/raw-chart/legend-solo'
  import { useAppStore } from '@/store'
  import { useDrilldownContext } from '@/observability/context'
  import { fetchLogVolumeByColumn, fetchLogVolumeTimeseries } from '@/observability/adapters/logs'
  import { addFilter, splitFilterOrValues } from '@/observability/filters'
  import { formatLogCountShort, logLevelColor, normalizeLogLevelName } from '@/observability/logs/level-color'
  import getSeriesColorByIndex from '@/observability/metrics/series-colors'
  import buildLogVolumeBarsOption from '@/observability/logs/volume-bars'
  import { LOG_VOLUME_FALLBACK_WIDTH_PX, LOG_VOLUME_LEGEND_WIDTH_PX } from '@/observability/logs/volume-step'
  import type { LogVolumeSeries } from '@/observability/logs/volume-series'
  import { BREAKDOWN_CHART_HEIGHT } from '@/observability/metrics/panel-stats'
  import useLazyPanelQuery from '@/observability/use-lazy-panel-query'
  import DrilldownChartPanel from '../components/drilldown-chart-panel.vue'

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
      /** `column` stacks the column's top values. Default stacks severity. */
      breakdown?: 'severity' | 'column'
      legend?: 'side' | 'bottom'
      /** Extra AND clause (logs-tab body search). Not applied on overview. */
      extraWhere?: string
    }>(),
    {
      height: BREAKDOWN_CHART_HEIGHT,
      lazy: true,
      enabled: true,
      selectedLevels: () => [],
      syncSeverityFilter: false,
      breakdown: 'severity',
      legend: 'side',
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
  const columnSolo = ref<string | null>(null)
  const isEmpty = ref(false)
  const containerWidth = ref(0)
  const plotWidth = ref(0)
  const chartPanelRef = ref<InstanceType<typeof DrilldownChartPanel> | null>(null)
  let requestVersion = 0
  let resizeObserver: ResizeObserver | null = null

  const showChart = computed(() => Boolean(chartOption.value) && !loading.value && !error.value)
  const plotWidthPx = computed(() => {
    if (plotWidth.value > 0) {
      return plotWidth.value
    }
    if (containerWidth.value <= 0) {
      return LOG_VOLUME_FALLBACK_WIDTH_PX
    }
    if (props.legend === 'bottom') {
      return containerWidth.value
    }
    return Math.max(80, containerWidth.value - LOG_VOLUME_LEGEND_WIDTH_PX)
  })
  const widthBucket = computed(() => Math.round(plotWidthPx.value / 16) * 16)
  /** Ignore a 0×0 hidden pane so the chart key and query stay on the last real width. */
  const stableWidthBucket = ref(0)
  watch(widthBucket, (next) => {
    if (next > 0 && (plotWidth.value > 0 || containerWidth.value > 0)) {
      stableWidthBucket.value = next
    }
  })
  const chartRenderKey = computed(
    () =>
      `${props.breakdown}:${props.labelCol ?? ''}:${props.labelValue ?? ''}:${ctx.refreshKey.value}:${
        ctx.time.value
      }:${ctx.rangeTime.value.join(',')}:${stableWidthBucket.value}`
  )
  function seriesColor(name: string): string {
    if (props.breakdown !== 'column') {
      return logLevelColor(name, isDark.value)
    }
    const index = seriesList.value.findIndex((series) => series.name === name)
    return getSeriesColorByIndex(Math.max(0, index), isDark.value)
  }

  const legendRows = computed(() =>
    [...seriesList.value].reverse().map((series) => ({
      name: series.name,
      color: seriesColor(series.name),
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

  function isSeriesSelected(name: string): boolean {
    if (props.breakdown === 'column') {
      return !columnSolo.value || columnSolo.value === name
    }
    if (!activeLevels.value.length) {
      return true
    }
    const selected = new Set(activeLevels.value.map(normalizeLogLevelName))
    return selected.has(normalizeLogLevelName(name))
  }

  function isLevelHidden(name: string): boolean {
    return !isSeriesSelected(name)
  }

  function paint() {
    if (!seriesList.value.length) {
      return
    }
    const matched = seriesList.value.filter((series) => isSeriesSelected(series.name))
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
      colorFor: props.breakdown === 'column' ? (name) => seriesColor(name) : undefined,
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
    if (props.breakdown === 'column') {
      columnSolo.value = toggleLegendSolo(columnSolo.value, name)
      paint()
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
    const plot = chartPanelRef.value?.plotRef?.clientWidth ?? 0
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
      const plotWidthForQuery =
        plotWidth.value > 0 || containerWidth.value > 0 ? widthBucket.value : stableWidthBucket.value
      const series =
        props.breakdown === 'column' && props.labelCol
          ? await fetchLogVolumeByColumn(ctx, {
              column: props.labelCol,
              plotWidthPx: plotWidthForQuery,
            })
          : await fetchLogVolumeTimeseries(ctx, {
              labelCol: props.labelCol,
              value: props.labelValue,
              plotWidthPx: plotWidthForQuery,
              extraWhere: props.extraWhere,
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
      if (chartPanelRef.value?.plotRef && resizeObserver) {
        resizeObserver.observe(chartPanelRef.value.plotRef)
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
        props.breakdown,
        props.labelCol,
        props.labelValue,
        stableWidthBucket.value,
        ctx.logsTable.value,
        ctx.refreshKey.value,
        ctx.time.value,
        ctx.rangeTime.value[0],
        ctx.rangeTime.value[1],
        ctx.logsView.value,
        ctx.fieldMap.value.logs.severity,
        props.extraWhere,
        isDark.value,
      ]
      if (ctx.logsView.value === 'detail') {
        const column = ctx.fieldMap.value.logs.severity
        const filters =
          props.breakdown === 'column'
            ? ctx.filters.value
            : ctx.filters.value.filter((filter) => filter.key !== column && filter.key !== 'severity')
        base.push(filters)
      }
      return base
    },
    () => {
      if (!props.enabled || stableWidthBucket.value <= 0) {
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

  .logs-volume-mini-chart :deep(.drilldown-chart-panel__chart) {
    display: flex;
    flex: 1;
    gap: var(--gpt-gap-md);
    min-height: 0;
    overflow: hidden;
    background: transparent;
  }

  .logs-volume-mini-chart :deep(.chart-wrap) {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }

  .logs-volume-mini-chart.is-legend-bottom :deep(.logs-volume-mini-chart__chart--bottom) {
    flex: 0 0 auto;
    overflow: hidden;
    border-radius: var(--gpt-radius-md);
    background: var(--gpt-bg-panel);
  }

  .logs-volume-mini-chart__legend-button {
    display: inline-flex;
    align-items: center;
    gap: var(--gpt-gap-sm);
    max-width: 100%;
    padding: 0;
    overflow: hidden;
    border: 0;
    background: transparent;
    font-size: var(--gpt-font-sm);
    line-height: 1.2;
    color: var(--gpt-text-secondary);
    cursor: pointer;

    &.is-hidden {
      opacity: 0.35;
    }
  }

  .logs-volume-mini-chart__legend-button .legend-swatch {
    width: 12px;
    height: 3px;
    border-radius: var(--gpt-radius-xs);
  }

  .logs-volume-mini-chart__legend-button .legend-name {
    overflow: hidden;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
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
