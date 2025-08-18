<template>
  <div ref="chartContainer" class="chart" :style="{ height: height }"></div>
</template>

<script setup lang="ts">
  import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
  import * as echarts from 'echarts'
  import type { EChartsOption } from 'echarts'

  interface Props {
    options: EChartsOption
    height?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    height: '400px',
  })

  const chartContainer = ref<HTMLDivElement>()
  let chartInstance: echarts.ECharts | null = null

  const resizeChart = () => {
    if (chartInstance) {
      chartInstance.resize()
    }
  }

  onMounted(() => {
    if (chartContainer.value && props.options) {
      chartInstance = echarts.init(chartContainer.value)
      chartInstance.setOption(props.options, {
        notMerge: true,
        lazyUpdate: true,
      })
    }
  })

  // Watch for options changes and reset chart completely
  watch(
    () => props.options,
    (newOptions) => {
      if (newOptions && chartContainer.value) {
        console.log('🔄 Options changed, resetting chart completely')
        // Dispose existing chart
        if (chartInstance) {
          chartInstance.dispose()
          chartInstance = null
        }
        // Create new chart with new options
        chartInstance = echarts.init(chartContainer.value)
        chartInstance.setOption(newOptions, {
          notMerge: true,
          lazyUpdate: true,
        })
      }
    },
    { deep: true, immediate: false }
  )

  onUnmounted(() => {
    if (chartInstance) {
      chartInstance.dispose()
      chartInstance = null
    }
  })

  defineExpose({
    resizeChart,
    getInstance: () => chartInstance,
  })
</script>

<style scoped>
  .chart {
    width: 100%;
  }
</style>
