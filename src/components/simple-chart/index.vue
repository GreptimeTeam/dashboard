<template>
  <div ref="chartContainer" class="simple-chart" :style="{ height: height }"></div>
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

  // Chart initialization is handled by the watcher above

  // Chart is automatically updated when options change via the watcher above

  const resizeChart = () => {
    if (chartInstance) {
      chartInstance.resize()
    }
  }
  onMounted(() => {
    chartInstance = echarts.init(chartContainer.value)
    chartInstance.setOption(props.options, {
      notMerge: true,
      lazyUpdate: true,
    })
  })
  // Watch for options changes and reset chart completely
  watch(
    () => props.options,
    (newOptions) => {
      if (newOptions && chartContainer.value) {
        console.log('🔄 Options changed, resetting chart completely')
        chartInstance.setOption(newOptions, {
          notMerge: true,
          lazyUpdate: true,
        })
      }
    },
    { deep: true, immediate: true }
  )
  onBeforeMount(() => {
    if (chartInstance) {
      chartInstance.dispose()
      chartInstance = null
    }
  })

  defineExpose({
    resizeChart,
    getInstance: () => chartInstance,
  })

  // Chart is automatically initialized by the watcher when options are available

  onUnmounted(() => {
    if (chartInstance) {
      chartInstance.dispose()
      chartInstance = null
    }
  })
</script>

<style scoped>
  .simple-chart {
    width: 100%;
  }
</style>
