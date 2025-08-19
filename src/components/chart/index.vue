<template>
  <div ref="chartContainer" class="chart" :style="{ height: height }"></div>
</template>

<script setup lang="ts">
  import { ref, onMounted, onBeforeUnmount, onUnmounted, nextTick, watch } from 'vue'
  import * as echarts from 'echarts'
  import type { EChartsOption } from 'echarts'

  interface Props {
    options: EChartsOption
    height?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    height: '400px',
  })

  const emit = defineEmits<{
    (e: 'datazoom', value: any): void
  }>()

  const chartContainer = ref<HTMLDivElement>()
  let chartInstance: echarts.ECharts | null = null

  // Track when this instance is being unmounted due to key change
  const isUnmounting = ref(false)
  onBeforeUnmount(() => {
    isUnmounting.value = true
  })

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
      nextTick(() => {
        chartInstance?.dispatchAction({
          type: 'takeGlobalCursor',
          key: 'dataZoomSelect',
          dataZoomSelectActive: true,
        })
      })
      // Add event listeners
      chartInstance.on('datazoom', (event) => {
        emit('datazoom', event)
      })
    }
  })

  // Watch for options changes - run after DOM patch to avoid key change conflicts
  watch(
    () => props.options,
    (newOptions) => {
      // Skip if instance gone or unmounting due to key change
      if (!chartInstance || !chartContainer.value || isUnmounting.value) return

      nextTick(() => {
        console.log('🔄 Options changed, updating chart')
        chartInstance.setOption(newOptions, {
          notMerge: true,
          lazyUpdate: true,
        })
      })
    },
    { deep: true, flush: 'post' }
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
