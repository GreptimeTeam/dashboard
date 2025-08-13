<template lang="pug">
a-card.metrics-chart(:bordered="false")
  .toolbar(v-if="hasData")
    a-space
      span Chart View
      span.series-count(v-if="seriesData.length > 0") 
        | ({{ seriesData.length }} {{ seriesData.length === 1 ? 'series' : 'series' }}, step: {{ formatStep(step) }})

    a-space(style="margin-left: auto")
      a-button(type="outline" size="small" @click="toggleStacked")
        | {{ isStacked ? 'Unstack' : 'Stack' }}

  .chart-section(v-if="hasData")
    Chart(
      ref="chartRef"
      :option="chartOption"
      :loading="loading"
      :style="{ height: chartHeight }"
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
  const isStacked = ref(false)
  const chartHeight = ref('400px')

  // Format step from seconds to human-readable format
  const formatStep = (stepSeconds: number): string => {
    if (stepSeconds < 60) return `${stepSeconds}s`
    if (stepSeconds < 3600) return `${Math.floor(stepSeconds / 60)}m`
    if (stepSeconds < 86400) return `${Math.floor(stepSeconds / 3600)}h`
    return `${Math.floor(stepSeconds / 86400)}d`
  }

  // Fill missing timestamps in time series data
  const fillMissingTimestamps = (series: any[], start: number, end: number, stepSeconds: number) => {
    if (!series || series.length === 0) return []

    // Step is already in seconds, no need to parse
    if (!stepSeconds) return series

    console.log('=== fillMissingTimestamps called ===')
    console.log('Input series:', series)
    console.log('Start:', start, 'End:', end, 'Step (seconds):', stepSeconds)

    // Generate expected timestamps
    const expectedTimestamps: number[] = []
    let current = start
    while (current <= end) {
      expectedTimestamps.push(current)
      current += stepSeconds
    }

    console.log('Expected timestamps:', expectedTimestamps)

    // Fill missing data points
    return series.map((serie) => {
      console.log('Processing series:', serie.metric?.__name__)
      console.log('Original values:', serie.values)

      const filledData: [number, string | number][] = []

      expectedTimestamps.forEach((timestamp) => {
        // Find existing data point for this timestamp
        const existingPoint = serie.values?.find((point: any) => point[0] === timestamp)

        if (existingPoint) {
          console.log(`Found data for timestamp ${timestamp}:`, existingPoint)
          filledData.push(existingPoint)
        } else {
          // Fill with null for missing timestamps
          console.log(`No data for timestamp ${timestamp}, filling with null`)
          filledData.push([timestamp, null])
        }
      })

      console.log('Filled data:', filledData)

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
      console.log('Calling fillMissingTimestamps with:', { start, end, step: props.step })
      filteredData = fillMissingTimestamps(filteredData, start, end, props.step)
      console.log('After filling timestamps:', filteredData)
    } else {
      console.log('Skipping timestamp filling - missing timeRange or step')
    }

    return filteredData
  })

  // Transform data for chart
  const chartOption = computed(() => {
    if (!hasData.value) return {}
    console.log('seriesData', seriesData.value)
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
        type: 'line',
        data,
        smooth: false,
        symbol: 'none',
        lineStyle: {
          width: 1.5,
        },
        emphasis: {
          focus: 'series',
        },
        stack: isStacked.value ? 'total' : undefined,
        connectNulls: false, // Don't connect lines across null values (gaps)
        showSymbol: false, // Hide symbols for cleaner look
      }
    })

    return {
      title: {
        show: false,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          animation: false,
          label: {
            backgroundColor: 'var(--color-bg-popup)',
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

  // Methods
  const toggleStacked = () => {
    isStacked.value = !isStacked.value
  }

  // Watch for data changes and resize chart
  watch(
    () => props.data,
    () => {
      if (chartRef.value) {
        nextTick(() => {
          chartRef.value.resize()
        })
      }
    },
    { deep: true }
  )

  // Expose methods
  defineExpose({
    resize: () => {
      if (chartRef.value) {
        chartRef.value.resize()
      }
    },
  })
</script>

<style lang="less" scoped>
  .metrics-chart {
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-bg-container);
      height: 50px;
      .arco-space {
        align-items: center;
      }

      .series-count {
        color: var(--color-text-secondary);
        font-size: 12px;
        font-weight: normal;
      }
    }

    .chart-section {
      padding: 16px;
    }

    .empty-state {
      padding: 60px 20px;
      text-align: center;

      .empty-icon {
        width: 48px;
        height: 48px;
        color: var(--color-text-disabled);
        margin-bottom: 16px;
      }

      :deep(.arco-empty-description) {
        color: var(--color-text-secondary);
        font-size: 14px;
      }
    }
  }
</style>
