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
  import Chart from '@/components/raw-chart/index.vue'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'

  import dayjs from 'dayjs'
  import type { EChartsOption } from 'echarts'
  import StepSelector from './step-selector.vue'
  import type { MetricsContext } from '../types'

  // Inject the metrics context
  const metricsContext = inject<MetricsContext>('metricsContext')

  // Destructure the context for easier access
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

  // Chart state
  const chartRef = ref()
  const localChartType = chartType

  // Watch for time range changes only - step changes are handled separately
  // to avoid multiple executions when time change causes step change
  watch(
    () => JSON.stringify({ time: time.value, rangeTime: rangeTime.value, step: currentStep.value }),
    () => {
      // Update URL parameters when time range changes
      updateQueryParams()
    }
  )

  // Helper functions for chart type handling
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

  // Handle range selection on chart
  const handleDataZoom = (event: any) => {
    if (!event.batch || !event.batch[0]) return

    const { startValue, endValue } = event.batch[0]

    if (!startValue || !endValue) return

    // Convert from milliseconds to seconds for time range
    const startTime = Math.floor(new Date(startValue).getTime() / 1000)
    const endTime = Math.floor(new Date(endValue).getTime() / 1000)
    // Call the time range update handler from context
    handleTimeRangeUpdate([startTime, endTime])
  }

  const isStackedChart = (type: string): boolean => {
    return type === 'stacked-line' || type === 'stacked-bar'
  }

  // Fill missing timestamps in time series data
  const fillMissingTimestamps = (series: any[], start: number, end: number, stepSeconds: number) => {
    if (!series || series.length === 0) return []

    // Step is already in seconds, no need to parse
    if (!stepSeconds) return series

    // Generate expected timestamps
    const expectedTimestamps: number[] = []
    let current = start
    while (current <= end) {
      expectedTimestamps.push(current)
      current += stepSeconds
    }

    // Fill missing data points
    return series.map((serie) => {
      const filledData: [number, string | number][] = []

      expectedTimestamps.forEach((timestamp) => {
        // Find existing data point for this timestamp
        const existingPoint = serie.values?.find((point: any) => point[0] === timestamp)

        if (existingPoint) {
          filledData.push(existingPoint)
        } else {
          // Fill with null for missing timestamps
          filledData.push([timestamp, null])
        }
      })

      return {
        ...serie,
        values: filledData,
      }
    })
  }

  // Computed properties
  const hasData = computed(() => rangeQueryResult.value && rangeQueryResult.value.length > 0)

  const seriesData = computed(() => {
    if (!hasData.value) return []

    let filteredData = rangeQueryResult.value.slice()

    // Fill missing timestamps if time range and step are available
    if (timeRange.value && timeRange.value.length === 2 && step.value) {
      const [start, end] = timeRange.value as [number, number]
      filteredData = fillMissingTimestamps(filteredData, start, end, step.value)
    }
    return filteredData
  })

  const graphHeight = 530
  const legendHeight = computed(() => {
    return Math.min(seriesData.value.length * 20, 240)
  })
  const legendGap = 30
  // Dynamic chart height based on series count
  const chartHeight = computed(() => {
    const baseHeight = graphHeight
    const dynamicHeight = legendHeight.value
    return baseHeight + dynamicHeight + legendGap
  })

  const chartOption = computed<EChartsOption>(() => {
    if (!hasData.value) return {}
    const series = seriesData.value.map((item, index) => {
      const metricName = item.metric.__name__ || 'unknown'
      const labels = { ...item.metric }
      delete labels.__name__

      // Create series name from metric and labels
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(', ')
      const seriesName = labelStr ? `${metricName}{${labelStr}}` : metricName

      // Transform values to chart data points
      const data = item.values.map(([timestamp, value]: [number, string | number]) => {
        if (value === null) {
          // Return null to create a gap in the chart
          return [timestamp * 1000, null]
        }
        return [timestamp * 1000, parseFloat(value as string)]
      })

      // Determine if we should show symbols based on data point count
      const shouldShowSymbols = localChartType.value === 'scatter' || data.length <= 20
      let symbolSize = 0
      if (shouldShowSymbols) {
        symbolSize = localChartType.value === 'scatter' ? 6 : 5
      }

      return {
        name: seriesName,
        type: getChartType(localChartType.value),
        data,
        smooth: false,
        symbol: shouldShowSymbols ? 'circle' : 'none',
        symbolSize: 5,
        lineStyle:
          localChartType.value === 'scatter'
            ? undefined
            : {
                width: 1.5, // Wider lines like Prometheus UI
                color: undefined, // Use default series color
                opacity: 1, // Full opacity for better visibility
              },
        emphasis: {
          focus: 'series',
          lineStyle: {
            width: 2, // Even wider on hover/focus
            opacity: 1,
          },
        },
        connectNulls: false, // Don't connect lines across null values (gaps)
        // Add area fill for stacked lines
        areaStyle: isStackedChart(localChartType.value)
          ? {
              opacity: 0.6,
            }
          : undefined,
        // Individual series tooltip - REMOVED: Not working properly for line charts
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
              seriesName,
              value: [, value],
            } = param

            // Skip tooltip for null values (filled gaps)
            if (value === null || value === undefined) return

            content += `
              <div style="margin: 2px 0;">
                <span style="display: inline-block; width: 10px; height: 10px; background: ${color}; border-radius: 50%; margin-right: 8px;"></span>
                <span style="font-weight: 500;">${seriesName}:</span>
                <span style="float: right; margin-left: 20px;">${value}</span>
              </div>
            `
          })

          return content
        },
      },
      legend: {
        bottom: 0,
        type: 'scroll',
        orient: 'vertical',
        top: graphHeight + 20,
      },
      grid: {
        left: 30,
        right: 30,
        bottom: legendHeight.value + legendGap, // Dynamic bottom margin based on series count
        top: 30,
        containLabel: true,
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          yAxisIndex: 'none',
          zoomOnMouseWheel: false, // Enable mouse wheel zoom
          moveOnMouseMove: true, // Enable mouse drag pan
          preventDefaultMouseMove: false, // Allow normal mouse behavior
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
        // Calculate min/max from actual data values
        min: (value: any) => {
          // Find the minimum non-null value across all series
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
          // Add some padding below the minimum value
          return Math.floor(minValue * 0.999)
        },
        max: (value: any) => {
          // Find the maximum non-null value across all series
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
          // Add some padding above the maximum value
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
      // Hide toolbox completely but keep zoom functionality
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    // Alternative approach - hide any toolbox elements
    :deep([class*='toolbox']) {
      display: none !important;
    }

    // Hide toolbox using multiple selectors to ensure it's hidden
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
