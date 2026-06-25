<template lang="pug">
a-card.metrics-chart(:bordered="false")
  .section-title
    a-space
      .tab-controls
        a-space
          TimeRangeSelect(
            v-model:time-length="time"
            v-model:time-range="rangeTime"
            button-type="outline"
            button-size="small"
            :show-any-time="false"
          )
          StepSelector(
            v-model:selection-type="stepSelectionType"
            v-model:step-value="currentStep"
            :unix-time-range="unixTimeRange"
          )

    a-space(style="margin-left: auto")
      a-checkbox(v-model="showFullSeriesName") {{ t('metrics.showFullSeriesName') }}
      a-radio-group.chart-type-toggle(v-model="localChartType" type="button" size="small")
        a-radio(value="line")
          span.chart-type-option
            svg.icon-16
              use(href="#line")
            span.chart-type-label Lines
        a-radio(value="bar")
          span.chart-type-option
            svg.icon-16
              use(href="#bar")
            span.chart-type-label Bars
        a-radio(value="scatter")
          span.chart-type-option
            svg.icon-16
              use(href="#point")
            span.chart-type-label Points
        a-radio(value="stacked-line")
          span.chart-type-option
            svg.icon-16
              use(href="#stack")
            span.chart-type-label Stacked Lines

  .chart-section(v-if="hasData")
    .chart-container(ref="chartContainerRef")
      Chart(
        :key="chartKey"
        ref="chartRef"
        :height="chartHeight + 'px'"
        :options="chartOption"
        @datazoom="handleDataZoom"
      )

  .empty-state(v-else)
    a-empty(description="No data to display")
      template(#image)
        svg.icon.empty-icon
          use(href="#chart-line")
      | Execute a PromQL query to see chart visualization
</template>

<script setup lang="ts">
  import { ref, computed, watch, inject, nextTick } from 'vue'
  import { useElementSize } from '@vueuse/core'
  import Chart from '@/components/raw-chart/index.vue'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'
  import chartTheme from '@/components/chart/chartTheme.json'
  import { useDateTimeFormat } from '@/hooks'

  import type { EChartsOption } from 'echarts'
  import { useI18n } from 'vue-i18n'
  import StepSelector from './step-selector.vue'
  import type { MetricsContext } from '../types'

  const metricsContext = inject<MetricsContext>('metricsContext')
  const {
    rangeQueryResult,
    queryLoading: loading,
    currentQuery: query,
    currentTimeRange: timeRange,
    queryStep: step,
    chartType,
    time,
    rangeTime,
    unixTimeRange,
    stepSelectionType,
    currentStep,
    handleTimeRangeUpdate,
    updateQueryParams,
  } = metricsContext

  const { t } = useI18n()

  const { formatDateTime } = useDateTimeFormat()

  const METRICS_CHART_COLORS = chartTheme.color as string[]
  /** Fixed height of the line/bar plot area (excluding legend). */
  const GRAPH_HEIGHT = 400
  const LEGEND_ITEM_HEIGHT = 14
  const LEGEND_LIST_ROW_HEIGHT = LEGEND_ITEM_HEIGHT + 6
  const LEGEND_ICON_WIDTH = 14
  const LEGEND_TO_GRID_GAP = 16
  /** Space between legend block and canvas bottom */
  const LEGEND_BOTTOM_INSET = 12
  const AXIS_LABEL_STYLE = { color: 'rgba(71, 52, 96, 0.45)', fontSize: 11 }
  const SPLIT_LINE_STYLE = { type: 'solid' as const, color: 'rgba(71, 52, 96, 0.06)' }
  const AXIS_LINE_STYLE = { lineStyle: { color: 'rgba(71, 52, 96, 0.12)' } }

  const formatMetricValue = (value: number): string => {
    if (!Number.isFinite(value)) return String(value)
    if (Number.isInteger(value)) return String(value)
    if (Math.abs(value) >= 1e6 || (Math.abs(value) > 0 && Math.abs(value) < 1e-4)) {
      return value.toExponential(3)
    }
    return String(Number(value.toPrecision(6)))
  }

  const chartRef = ref()
  const chartContainerRef = ref<HTMLElement>()
  const { width: chartContainerWidth } = useElementSize(chartContainerRef)
  const localChartType = chartType

  watch(
    () => JSON.stringify({ time: time.value, rangeTime: rangeTime.value, step: currentStep.value }),
    () => {
      updateQueryParams()
    }
  )
  const getChartType = (type: string): string => {
    switch (type) {
      case 'stacked-line':
        return 'line'
      case 'scatter':
        return 'scatter'
      case 'bar':
        return 'bar'
      default:
        return 'line'
    }
  }

  const handleDataZoom = (event: any) => {
    if (!event.batch || !event.batch[0]) return

    const { startValue, endValue } = event.batch[0]

    if (!startValue || !endValue) return

    const startTime = Math.floor(new Date(startValue).getTime() / 1000)
    const endTime = Math.floor(new Date(endValue).getTime() / 1000)
    handleTimeRangeUpdate([startTime, endTime])
  }

  const isStackedChart = (type: string): boolean => {
    return type === 'stacked-line' || type === 'stacked-bar'
  }

  const fillMissingTimestamps = (series: any[], start: number, end: number, stepSeconds: number) => {
    if (!series || series.length === 0) return []

    if (!stepSeconds) return series

    const expectedTimestamps: number[] = []
    let current = start
    while (current <= end) {
      expectedTimestamps.push(current)
      current += stepSeconds
    }

    return series.map((serie) => {
      const filledData: [number, string | number][] = []

      expectedTimestamps.forEach((timestamp) => {
        const existingPoint = serie.values?.find((point: any) => point[0] === timestamp)

        if (existingPoint) {
          filledData.push(existingPoint)
        } else {
          filledData.push([timestamp, null])
        }
      })

      return {
        ...serie,
        values: filledData,
      }
    })
  }

  const hasData = computed(() => rangeQueryResult.value && rangeQueryResult.value.length > 0)

  const seriesData = computed(() => {
    if (!hasData.value) return []

    let filteredData = rangeQueryResult.value.slice()

    if (timeRange.value && timeRange.value.length === 2 && step.value) {
      const [start, end] = timeRange.value as [number, number]
      filteredData = fillMissingTimestamps(filteredData, start, end, step.value)
    }
    return filteredData
  })

  const showFullSeriesName = ref(false)
  /** When set, only this series is shown (solo mode). Disables legend-hover dimming. */
  const soloSeriesName = ref<string | null>(null)

  const chartKey = computed(() => {
    return `${query.value}-${step.value}-${showFullSeriesName.value}`
  })

  // Reset solo mode whenever series names are recomputed (query/step/showFullSeriesName change),
  // otherwise the stale soloSeriesName no longer matches any legend name and hides everything.
  watch(chartKey, () => {
    soloSeriesName.value = null
  })

  const formatChartAxisTime = (value: number): string => {
    const range = timeRange.value as [number, number] | undefined
    if (!range || range.length !== 2) {
      return formatDateTime(value, 'TimestampMillisecond', 'HH:mm:ss') ?? ''
    }
    const spanMs = (range[1] - range[0]) * 1000
    const oneDay = 86400 * 1000
    const oneHour = 3600 * 1000
    if (spanMs > oneDay * 7) {
      return formatDateTime(value, 'TimestampMillisecond', 'MM-DD') ?? ''
    }
    if (spanMs > oneDay) {
      return formatDateTime(value, 'TimestampMillisecond', 'MM-DD HH:mm') ?? ''
    }
    if (spanMs > oneHour) {
      return formatDateTime(value, 'TimestampMillisecond', 'HH:mm') ?? ''
    }
    return formatDateTime(value, 'TimestampMillisecond', 'HH:mm:ss') ?? ''
  }

  const estimateLegendAreaHeight = (count: number) => {
    if (count === 0) return 0
    return count * LEGEND_LIST_ROW_HEIGHT + 8 + LEGEND_BOTTOM_INSET
  }

  const seriesCount = computed(() => seriesData.value.length)

  const legendAreaHeight = computed(() => estimateLegendAreaHeight(seriesCount.value))

  /** Plot area fixed; legend height is additive below the grid. */
  const chartHeight = computed(() => GRAPH_HEIGHT + legendAreaHeight.value + LEGEND_TO_GRID_GAP)

  // Attach legendselectchanged event to implement solo mode:
  // clicking a legend item shows only that series and hides all others.
  // The actual selection state is driven by `selected` map in chartOption (recomputed when soloSeriesName changes).
  // While in solo mode, legend-hover dimming is disabled via emphasis.focus in chartOption.
  // Attach legendselectchanged event to implement solo mode:
  // clicking a legend item shows only that series and hides all others.
  // The actual selection state is driven by `selected` map in chartOption (recomputed when soloSeriesName changes).
  // While in solo mode, legend-hover dimming is disabled via emphasis.focus in chartOption.
  // Watch chartKey so the handler is re-attached when the chart is recreated
  // (e.g., when toggling showFullSeriesName, which changes :key on the Chart component).
  watch(
    [hasData, chartKey],
    () => {
      if (!hasData.value) return
      nextTick(() => {
        const chartComponent = chartRef.value
        if (!chartComponent) return
        const instance = chartComponent.getInstance()
        if (!instance) return

        const handler = (params: any) => {
          const { name } = params
          if (name === soloSeriesName.value) {
            soloSeriesName.value = null
          } else {
            soloSeriesName.value = name
          }
        }

        instance.off('legendselectchanged', handler)
        instance.on('legendselectchanged', handler)
      })
    },
    { immediate: true }
  )

  const chartOption = computed<EChartsOption>(() => {
    if (!hasData.value) return {}
    // Option: control whether to display full series name or compact unique-label name

    const metricNamesInOrder: string[] = []
    const labelMapsInOrder: Record<string, string>[] = []
    const fullNamesInOrder: string[] = []

    // Collect metric names, label maps, and full names in order
    seriesData.value.forEach((item) => {
      const metricName = item.metric.__name__ || 'unknown'
      const labels = { ...item.metric }
      delete labels.__name__
      metricNamesInOrder.push(metricName)
      labelMapsInOrder.push(labels)

      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(', ')
      fullNamesInOrder.push(labelStr ? `${metricName}{${labelStr}}` : metricName)
    })

    // Label keys whose values differ across series (shared labels are hidden in compact mode)
    const differingKeys = (() => {
      const totalSeries = labelMapsInOrder.length
      if (totalSeries <= 1) return new Set<string>()

      const allKeys = new Set<string>()
      labelMapsInOrder.forEach((lm) => {
        Object.keys(lm).forEach((k) => allKeys.add(k))
      })

      const diff = new Set<string>()
      allKeys.forEach((key) => {
        const values = new Set<string>()
        labelMapsInOrder.forEach((lm) => {
          const v = lm[key]
          values.add(v === undefined ? '__MISSING__' : String(v))
        })
        if (values.size > 1) diff.add(key)
      })
      return diff
    })()

    // Helper to build compact display name using only differing labels
    const buildDisplayName = (idx: number): string => {
      const metricName = metricNamesInOrder[idx] || 'unknown'
      const lm = labelMapsInOrder[idx] || {}
      const pairs: string[] = []
      Object.keys(lm).forEach((k) => {
        if (differingKeys.has(k)) pairs.push(`${k}="${lm[k]}"`)
      })
      const diffStr = pairs.length > 0 ? `{${pairs.join(', ')}}` : ''
      return `${metricName}${diffStr}`
    }

    const getSeriesName = (idx: number): string => {
      return showFullSeriesName.value ? fullNamesInOrder[idx] : buildDisplayName(idx)
    }

    const series = seriesData.value.map((item, index) => {
      const data = (item.values as Array<[number, string | number]>).map(([timestamp, value]) => {
        if (value === null) {
          return [timestamp * 1000, null]
        }
        return [timestamp * 1000, parseFloat(value as string)]
      })

      const shouldShowSymbols = localChartType.value === 'scatter' || data.length <= 20
      let symbolSize = 0
      if (shouldShowSymbols) {
        symbolSize = localChartType.value === 'scatter' ? 6 : 4
      }
      const stacked = isStackedChart(localChartType.value)

      return {
        name: getSeriesName(index),
        type: getChartType(localChartType.value),
        data,
        smooth: false,
        symbol: shouldShowSymbols ? 'circle' : 'none',
        symbolSize,
        ...(stacked ? { stack: 'total' } : {}),
        lineStyle:
          localChartType.value === 'scatter'
            ? undefined
            : {
                width: 2,
              },
        emphasis: {
          focus: soloSeriesName.value ? 'none' : 'series',
          lineStyle: {
            width: 2.5,
          },
        },
        connectNulls: false,
        areaStyle: stacked
          ? {
              opacity: 0.35,
            }
          : undefined,
      }
    })

    const legendNames = series.map((s) => s.name as string)
    const gridBottom = legendAreaHeight.value + LEGEND_TO_GRID_GAP

    const legendTextStyle = {
      fontSize: 11,
      lineHeight: LEGEND_ITEM_HEIGHT,
      color: 'rgba(71, 52, 96, 0.65)',
    }

    const legendOption = {
      type: 'plain',
      orient: 'vertical',
      left: 'center',
      bottom: LEGEND_BOTTOM_INSET,
      width: Math.min(
        (chartContainerWidth.value || 900) * 0.92,
        Math.max(...legendNames.map((name) => name.length * 6.5 + LEGEND_ICON_WIDTH + 20), 120)
      ),
      height: Math.max(legendAreaHeight.value - LEGEND_BOTTOM_INSET - 8, LEGEND_LIST_ROW_HEIGHT),
      itemWidth: LEGEND_ICON_WIDTH,
      itemHeight: LEGEND_ITEM_HEIGHT,
      itemGap: 6,
      textStyle: legendTextStyle,
      selected: soloSeriesName.value
        ? Object.fromEntries(legendNames.map((n) => [n, n === soloSeriesName.value]))
        : undefined,
    }

    return {
      color: METRICS_CHART_COLORS,
      tooltip: {
        trigger: 'axis',
        confine: true,
        appendToBody: true,
        enterable: false,
        axisPointer: {
          type: 'line',
          lineStyle: {
            color: 'rgba(112, 47, 237, 0.35)',
            type: 'dashed',
          },
        },
        formatter: (params: any) => {
          const items = Array.isArray(params) ? params : [params]
          if (!items.length) return ''
          const timeValue = items[0].value?.[0] ?? items[0].axisValue
          let content = `<div style="margin-bottom: 6px; font-weight: 600; font-size: 12px;">${formatChartAxisTime(
            timeValue
          )}</div>`

          const sorted = [...items].sort((a, b) => {
            const av = a.value?.[1]
            const bv = b.value?.[1]
            if (av == null && bv == null) return 0
            if (av == null) return 1
            if (bv == null) return -1
            return Number(bv) - Number(av)
          })

          sorted.forEach((param) => {
            const {
              color,
              value: [, value],
              seriesIndex,
            } = param
            if (value === null || value === undefined) return

            const tooltipName = fullNamesInOrder[seriesIndex] ?? param.seriesName

            content += `
              <div style="margin: 2px 0; font-size: 12px; line-height: 1.4;">
                <span style="display: inline-block; width: 8px; height: 8px; background: ${color}; border-radius: 50%; margin-right: 6px;"></span>
                <span>${tooltipName}:</span>
                <span style="float: right; margin-left: 16px; font-variant-numeric: tabular-nums;">${formatMetricValue(
                  Number(value)
                )}</span>
              </div>
            `
          })

          return content
        },
      },
      legend: legendOption,
      grid: {
        left: 0,
        right: 0,
        top: 8,
        bottom: gridBottom,
        containLabel: true,
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'none',
          zoomOnMouseWheel: false,
          moveOnMouseWheel: false,
          moveOnMouseMove: true,
        },
      ],
      xAxis: {
        type: 'time',
        axisLine: {
          show: true,
          ...AXIS_LINE_STYLE,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          ...AXIS_LABEL_STYLE,
          hideOverlap: true,
          formatter: (value: number) => formatChartAxisTime(value),
        },
        axisPointer: {
          label: {
            ...AXIS_LABEL_STYLE,
            formatter: (params: any) => formatChartAxisTime(params.value),
          },
        },
        splitLine: {
          show: true,
          lineStyle: SPLIT_LINE_STYLE,
        },
      },
      yAxis: {
        type: 'value',
        scale: !isStackedChart(localChartType.value),
        min: isStackedChart(localChartType.value) ? 0 : undefined,
        axisLine: {
          show: true,
          ...AXIS_LINE_STYLE,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          ...AXIS_LABEL_STYLE,
          formatter: (value: number) => formatMetricValue(value),
        },
        splitLine: {
          show: true,
          lineStyle: SPLIT_LINE_STYLE,
        },
      },
      series,
      animation: false,
      backgroundColor: 'transparent',
    } as EChartsOption
  })
</script>

<style lang="less" scoped>
  .chart-type-option {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    line-height: 1;

    svg {
      flex-shrink: 0;
      color: currentColor;
    }
  }

  .chart-type-label {
    font-size: var(--gpt-font-sm);
    white-space: nowrap;
  }

  .metrics-chart {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;

    :deep(.arco-card-body) {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
    }

    .section-title {
      flex: 0 0 auto;
    }

    .chart-section {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    .chart-container {
      flex: 0 0 auto;
    }

    :deep(.chart-type-toggle.arco-radio-group-button) {
      height: var(--gpt-control-height-sm);
      padding: 0;
      overflow: visible;
      background: var(--gpt-bg-panel);
      border: 1px solid var(--gpt-border-strong);
      border-radius: var(--gpt-radius-sm);
      box-shadow: none;

      .arco-radio-button {
        position: relative;
        z-index: 0;
        height: 100%;
        margin: 0;
        border: none;
        border-radius: var(--gpt-radius-sm);
        color: var(--gpt-text-secondary);

        &::before {
          display: none;
        }

        &:first-of-type,
        &:last-of-type {
          border-radius: var(--gpt-radius-sm);
        }

        &:not(.arco-radio-checked):not(.arco-radio-disabled):hover {
          z-index: 1;
          color: var(--gpt-text-primary);
          background: var(--grey-bg-color);
        }
      }

      .arco-radio-button-content {
        height: 100%;
        display: flex;
        align-items: center;
        padding: 0 10px;
      }

      .arco-radio-button.arco-radio-checked {
        z-index: 2;
        color: var(--brand-color);
        background: var(--light-brand-color);
        border: none;

        &::after {
          content: '';
          position: absolute;
          right: 0px;
          bottom: 0px;
          left: 0px;
          height: 2px;
          background: var(--brand-color);
          border-radius: 1px;
        }
      }
    }

    :deep(.section-title) {
      border-bottom: none;
    }

    .chart-container {
      padding: var(--gpt-gap-md) var(--gpt-page-padding-x) var(--gpt-gap-lg);
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--color-text-secondary);

      .empty-icon {
        width: 64px;
        height: 64px;
        margin-bottom: 16px;
        opacity: 0.5;
      }
    }

    :deep(.echarts-toolbox),
    :deep(.ec-toolbox),
    :deep([class*='ec-toolbox']),
    :deep([class*='toolbox']) {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      width: 0 !important;
      height: 0 !important;
      overflow: hidden !important;
    }
  }
</style>
