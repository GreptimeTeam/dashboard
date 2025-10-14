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
            :show-any-time="false"
          )
          StepSelector(
            v-model:selection-type="stepSelectionType"
            v-model:step-value="currentStep"
            :unix-time-range="unixTimeRange"
          )

    a-space(style="margin-left: auto")
      a-checkbox(v-model="showFullSeriesName") {{ t('metrics.showFullSeriesName') }}
      a-radio-group(v-model="localChartType" type="button" size="small")
        a-radio(value="line") Lines
        a-radio(value="bar") Bars
        a-radio(value="scatter") Points
        a-radio(value="stacked-line") Stacked Lines

  .chart-section(v-if="hasData")
    .chart-container(style="padding: 24px 0")
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
  import { ref, computed, watch, nextTick, inject, type Ref, type ComputedRef } from 'vue'
  import { useWindowSize } from '@vueuse/core'
  import Chart from '@/components/raw-chart/index.vue'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'

  import dayjs from 'dayjs'
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

  const chartRef = ref()
  const localChartType = chartType

  const { height: windowHeight } = useWindowSize()

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

  const chartKey = computed(() => {
    return query.value + step.value
  })

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

  const graphHeight = 530
  const legendGap = 30
  const legendItemHeight = 15
  const legendItemGap = 8
  const legendHeight = computed(() => {
    const seriesCount = seriesData.value.length
    if (seriesCount === 0) return 0

    // Calculate height including itemGap: each item needs height + gap (except last item)
    const calculatedHeight = seriesCount * legendItemHeight + (seriesCount - 1) * (legendItemGap * 0.67)
    return calculatedHeight
  })
  const chartHeight = computed(() => {
    const baseHeight = graphHeight
    const dynamicHeight = legendHeight.value
    return baseHeight + dynamicHeight + legendGap
  })
  const showFullSeriesName = ref(false)
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

    // Precompute which label keys actually differ across series
    const differingKeys = (() => {
      const totalSeries = labelMapsInOrder.length
      // collect union of all label keys across series
      const allKeys = new Set<string>()
      labelMapsInOrder.forEach((lm) => {
        Object.keys(lm).forEach((k) => allKeys.add(k))
      })

      const diff = new Set<string>()
      // for each key, collect values across all series; treat missing as a distinct sentinel
      allKeys.forEach((key) => {
        const values = new Set<string>()
        labelMapsInOrder.forEach((lm) => {
          const v = lm[key]
          values.add(v === undefined ? '__MISSING__' : String(v))
        })
        // values.size > 1 means at least 2 series have different values for this key
        if (totalSeries === 1 || values.size > 1) {
          diff.add(key)
        }
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
        symbolSize = localChartType.value === 'scatter' ? 6 : 5
      }

      return {
        name: getSeriesName(index),
        type: getChartType(localChartType.value),
        data,
        smooth: false,
        symbol: shouldShowSymbols ? 'circle' : 'none',
        symbolSize: 5,
        lineStyle:
          localChartType.value === 'scatter'
            ? undefined
            : {
                width: 1.5,
                color: undefined,
                opacity: 1,
              },
        emphasis: {
          focus: 'series',
          lineStyle: {
            width: 2,
            opacity: 1,
          },
        },
        connectNulls: false,
        areaStyle: isStackedChart(localChartType.value)
          ? {
              opacity: 0.6,
            }
          : undefined,
      }
    })

    return {
      tooltip: {
        trigger: 'axis',
        confine: true,
        enterable: false,
        formatter: (params: any[]) => {
          if (!params || params.length === 0) return ''
          let content = `<div style="margin-bottom: 8px; font-weight: 600; color: #333;">${dayjs(
            params[0].value[0]
          ).format('YYYY-MM-DD HH:mm:ss')}</div>`

          params.forEach((param) => {
            const {
              color,
              seriesIndex: sIdx,
              value: [, value],
              seriesName,
            } = param
            if (value === null || value === undefined) return

            const displayName = seriesName

            content += `
              <div style="margin: 2px 0;">
                <span style="display: inline-block; width: 10px; height: 10px; background: ${color}; border-radius: 50%; margin-right: 8px;"></span>
                <span style="font-weight: 500;">${displayName}:</span>
                <span style="float: right; margin-left: 20px;">${value}</span>
              </div>
            `
          })

          return content
        },
      },
      legend: {
        bottom: 0,
        orient: 'vertical',
        top: graphHeight + 20,
        itemHeight: legendItemHeight,
        itemGap: legendItemGap,
      },
      grid: {
        left: 30,
        right: 30,
        bottom: legendHeight.value + legendGap,
        top: 30,
        containLabel: true,
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          yAxisIndex: 'none',
          zoomOnMouseWheel: false,
          moveOnMouseMove: true,
          preventDefaultMouseMove: false,
        },
      ],
      toolbox: {
        orient: 'vertical',
        itemSize: 15,
        top: -115,
        right: -1115,
        feature: {
          dataZoom: {
            yAxisIndex: 'none',
            title: {
              zoom: 'Zoom',
              back: 'Reset',
            },
          },
        },
      },

      xAxis: {
        type: 'time',
        axisLine: {
          show: true,
        },
        axisTick: {
          show: true,
          lineStyle: {
            width: 1,
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed',
          },
        },
      },
      yAxis: {
        type: 'value',
        min: (value: any) => {
          let minValue = Infinity
          series.forEach((s) => {
            if (s.data && Array.isArray(s.data)) {
              s.data.forEach((point: any) => {
                if (point && point[1] !== null && point[1] !== undefined) {
                  minValue = Math.min(minValue, point[1])
                }
              })
            }
          })
          return Math.floor(minValue * 0.999)
        },
        max: (value: any) => {
          let maxValue = -Infinity
          series.forEach((s) => {
            if (s.data && Array.isArray(s.data)) {
              s.data.forEach((point: any) => {
                if (point && point[1] !== null && point[1] !== undefined) {
                  maxValue = Math.max(maxValue, point[1])
                }
              })
            }
          })
          return Math.ceil(maxValue * 1.001)
        },
        axisLine: {
          show: true,
        },
        axisTick: {
          show: true,
          lineStyle: {
            width: 1,
          },
        },
        axisLabel: {
          color: 'var(--color-text-secondary)',
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed' as const,
          },
        },
      },
      series,
      animation: false,
      backgroundColor: 'transparent',
    } as EChartsOption
  })
</script>

<style lang="less" scoped>
  .metrics-chart {
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

    :deep(.echarts-toolbox) {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    :deep([class*='toolbox']) {
      display: none !important;
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
  .series-count {
    text-align: center;
    color: var(--color-text-secondary);
  }
</style>
