<template>
  <div ref="chartContainer" class="chart" :style="{ height: height }"></div>
</template>

<script setup lang="ts">
  import { ref, onMounted, onBeforeUnmount, onUnmounted, nextTick, watch } from 'vue'
  import { useResizeObserver } from '@vueuse/core'
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
  let removeWheelListener: (() => void) | null = null

  // Track when this instance is being unmounted due to key change
  const isUnmounting = ref(false)
  onBeforeUnmount(() => {
    isUnmounting.value = true
  })

  const attachWheelPassthrough = () => {
    if (!chartContainer.value) return
    const el = chartContainer.value
    const onWheel = (e: WheelEvent) => {
      // Do not call preventDefault so page can scroll; just block ECharts handlers
      e.stopImmediatePropagation()
    }
    el.addEventListener('wheel', onWheel, { capture: true, passive: false })
    removeWheelListener = () => {
      el.removeEventListener('wheel', onWheel, { capture: true } as any)
      removeWheelListener = null
    }
  }

  const resizeChart = () => {
    if (chartInstance && chartContainer.value && !isUnmounting.value) {
      try {
        chartInstance.resize()
      } catch (error) {
        console.warn('Failed to resize chart:', error)
      }
    }
  }

  // Use VueUse's useResizeObserver for automatic chart resizing
  useResizeObserver(chartContainer, () => {
    if (!isUnmounting.value) {
      resizeChart()
    }
  })

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
      // Ensure wheel scroll bubbles to page
      attachWheelPassthrough()
    }
  })

  // Watch for options changes - run after DOM patch to avoid key change conflicts
  watch(
    () => props.options,
    (newOptions) => {
      // Skip if instance gone or unmounting due to key change
      if (!chartInstance || !chartContainer.value || isUnmounting.value) return

      nextTick(() => {
        chartInstance.setOption(newOptions, {
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
      })
    },
    { deep: true, flush: 'post' }
  )

  onUnmounted(() => {
    if (removeWheelListener) removeWheelListener()
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
