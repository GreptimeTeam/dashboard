<template lang="pug">
a-card.metrics-chart(:bordered="false")
  .toolbar(v-if="hasData")
    a-space
      span Chart View
      span.series-count(v-if="seriesData.length > 0") 
        | ({{ seriesData.length }} {{ seriesData.length === 1 ? 'series' : 'series' }})

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
    loading?: boolean
    query?: string
  }>()

  // Chart state
  const chartRef = ref()
  const isStacked = ref(false)
  const chartHeight = ref('400px')

  // Computed properties
  const hasData = computed(() => props.data && props.data.length > 0)

  const seriesData = computed(() => {
    if (!hasData.value) return []
    return props.data.filter((series) => series.values && series.values.length > 0)
  })

  // Transform data for chart
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
      const data = item.values.map(([timestamp, value]: [number, string]) => [
        timestamp * 1000, // Convert to milliseconds
        parseFloat(value),
      ])

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
        boundaryGap: false,
        axisLine: {
          lineStyle: {
            color: 'var(--color-border)',
          },
        },
        axisLabel: {
          color: 'var(--color-text-secondary)',
          formatter: (value: number) => dayjs(value).format('HH:mm:ss'),
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: 'var(--color-border-light)',
            type: 'dashed',
          },
        },
      },
      yAxis: {
        type: 'value',
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
