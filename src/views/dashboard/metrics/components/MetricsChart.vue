<template lang="pug">
a-card.metrics-chart(:bordered="false")
  .section-title(v-if="hasData")
    a-space
      span Chart View
      span.series-count(v-if="seriesData.length > 0") 
        | ({{ seriesData.length }} {{ seriesData.length === 1 ? 'series' : 'series' }}, step: {{ step }}s)

    a-space(style="margin-left: auto")
      a-radio-group(v-model="chartType" type="button" size="small")
        a-radio(value="line") Lines
        a-radio(value="bar") Bars
        a-radio(value="scatter") Points
        a-radio(value="stacked-line") Stacked Lines

  .chart-section(v-if="hasData")
    .chart-container(style="padding: 16px 0")
      Chart(
        ref="chartRef"
        :option="chartOption"
        :loading="loading"
        :style="{ height: '560px' }"
      )

  .empty-state(v-else)
    a-empty(description="No data to display")
      template(#image)
        svg.icon.empty-icon
          use(href="#chart-line")
      | Execute a PromQL query to see chart visualization
</template>

<script setup lang="ts">
  import { ref, computed, watch, nextTick } from 'vue'
  import Chart from '@/components/chart/index.vue'
  import dayjs from 'dayjs'

  const props = defineProps<{
    data: any[]
    loading: boolean
    query: string
    timeRange: number[] | []
    step: number // Step in seconds, not string format
  }>()

  // Chart state
  const chartRef = ref()
  const chartType = ref('line') // Default to 'line'

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
  const hasData = computed(() => props.data && props.data.length > 0)

  const seriesData = computed(() => {
    if (!hasData.value) return []

    let filteredData = props.data.filter((series) => series.values && series.values.length > 0)

    // Fill missing timestamps if time range and step are available
    if (props.timeRange && props.timeRange.length === 2 && props.step) {
      const [start, end] = props.timeRange as [number, number]
      filteredData = fillMissingTimestamps(filteredData, start, end, props.step)
    }
    return filteredData
  })

  const chartOption = computed(() => {
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
      // Don't filter out null values - let ECharts handle them with connectNulls: false

      return {
        name: seriesName,
        type: getChartType(chartType.value),
        data,
        smooth: false,
        symbol: chartType.value === 'scatter' ? 'circle' : 'none',
        symbolSize: chartType.value === 'scatter' ? 4 : 0,
        lineStyle:
          chartType.value === 'scatter'
            ? undefined
            : {
                width: 1.5,
              },
        emphasis: {
          focus: 'series',
        },
        connectNulls: false, // Don't connect lines across null values (gaps)
        showSymbol: chartType.value === 'scatter', // Show symbols only for scatter/points
        // Add area fill for stacked lines
        areaStyle: isStackedChart(chartType.value)
          ? {
              opacity: 0.6,
            }
          : undefined,
      }
    })

    // watchEffect(() => {
    //   console.log('chartOption', chartOption.value, props.data)
    // })

    return {
      tooltip: {
        trigger: 'axis',
        confine: true, // Prevent tooltip from going outside chart bounds
        enterable: false, // Prevent mouse from entering tooltip
        axisPointer: {
          type: 'cross', // Restored cross-hair functionality
          animation: false,
          label: {
            backgroundColor: 'var(--color-bg-popup)',
            show: false, // Hide the axis pointer label to reduce interference
          },
        },
        formatter: (params: any[]) => {
          if (!params || params.length === 0) return ''

          const time = dayjs(params[0].value[0]).format('YYYY-MM-DD HH:mm:ss')
          let content = `<div style="margin-bottom: 4px; font-weight: 600;">${time}</div>`

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
        type: 'scroll',
        orient: 'horizontal',
        bottom: 0,
        data: series.map((s) => s.name),
        selected: series.reduce((acc, s) => {
          acc[s.name] = true
          return acc
        }, {} as Record<string, boolean>),
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: series.length > 0 ? '15%' : '3%',
        top: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'time',
        axisLabel: {
          formatter: (value: number) => dayjs(value).format('HH:mm'),
          interval: 0,
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed',
            color: 'var(--color-border)',
          },
        },
        axisLine: {
          lineStyle: {
            color: 'var(--color-border)',
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
          return minValue === Infinity ? 0 : Math.floor(minValue * 0.9)
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
          return maxValue === -Infinity ? 100 : Math.ceil(maxValue * 1.1)
        },
        axisLine: {
          lineStyle: {
            color: 'var(--color-border)',
          },
        },
        axisLabel: {
          color: 'var(--color-text-secondary)',
        },
        splitLine: {
          lineStyle: {
            color: 'var(--color-border-light)',
            type: 'dashed',
          },
        },
      },
      series,
      animation: false,
      backgroundColor: 'transparent',
    }
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
  }
</style>
