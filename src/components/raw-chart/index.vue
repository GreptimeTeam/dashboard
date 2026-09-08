<template>
  <div class="chart-wrap" :class="{ 'chart-wrap--time-interaction': timeInteraction }" :style="{ height }">
    <div ref="chartContainer" class="chart" />
    <div
      v-if="timeInteraction && axisPanStyle"
      class="chart-xaxis-pan"
      data-raw-chart-axis-pan="1"
      :style="axisPanStyle"
      title="Drag to pan time range"
      @pointerdown="onAxisPointerDown"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted, onBeforeUnmount, onUnmounted, nextTick, watch, computed } from 'vue'
  import { useResizeObserver } from '@vueuse/core'
  import * as echarts from 'echarts'
  import type { EChartsOption } from 'echarts'
  import { attachTimeInteraction, getGridRect, toUnixTimeRangeSeconds, type ChartTimeRangeMs } from './time-interaction'

  interface Props {
    options: EChartsOption
    height?: string
    /**
     * Keep ECharts area-zoom brush cursor active (metrics-query style).
     * Ignored when `timeInteraction` is enabled.
     */
    brushSelect?: boolean
    /**
     * Grafana-style plot drag zoom + x-axis pan.
     * Emits `timeRangeChange` with unix-second `[start, end]` on commit.
     */
    timeInteraction?: boolean
    /** Authoritative time window (ms) for pan/zoom math. Falls back to axis min/max. */
    timeWindowMs?: ChartTimeRangeMs | null
  }

  const props = withDefaults(defineProps<Props>(), {
    height: '400px',
    brushSelect: true,
    timeInteraction: false,
    timeWindowMs: null,
  })

  const emit = defineEmits<{
    (e: 'datazoom', value: any): void
    (e: 'ready', chart: echarts.ECharts): void
    /** Unix seconds `[start, end]` — same shape as metrics-query dataZoom handler. */
    (e: 'timeRangeChange', value: [number, number]): void
  }>()

  const chartContainer = ref<HTMLDivElement>()
  const axisPanBox = ref<{ left: string; width: string; top: string; height: string } | null>(null)
  let chartInstance: echarts.ECharts | null = null
  let removeWheelListener: (() => void) | null = null
  let detachTimeInteraction: (() => void) | null = null
  let axisPointerDownHandler: ((e: PointerEvent) => void) | null = null
  /** Block Vue→ECharts option sync while the user is dragging (prevents axis snap-back). */
  let interactionLocked = false

  const isUnmounting = ref(false)
  onBeforeUnmount(() => {
    isUnmounting.value = true
  })

  const brushSelectEnabled = computed(() => props.brushSelect && !props.timeInteraction)

  const axisPanStyle = computed(() => {
    if (!axisPanBox.value) {
      return null
    }
    return {
      left: axisPanBox.value.left,
      width: axisPanBox.value.width,
      top: axisPanBox.value.top,
      height: axisPanBox.value.height,
    }
  })

  const attachWheelPassthrough = () => {
    if (!chartContainer.value) return
    const el = chartContainer.value
    const onWheel = (e: WheelEvent) => {
      e.stopImmediatePropagation()
    }
    el.addEventListener('wheel', onWheel, { capture: true, passive: false })
    removeWheelListener = () => {
      el.removeEventListener('wheel', onWheel, { capture: true } as any)
      removeWheelListener = null
    }
  }

  const activateBrushSelect = () => {
    if (!brushSelectEnabled.value || !chartInstance) {
      return
    }
    requestAnimationFrame(() => {
      chartInstance?.dispatchAction({
        type: 'takeGlobalCursor',
        key: 'dataZoomSelect',
        dataZoomSelectActive: true,
      })
    })
  }

  const syncAxisPanOverlay = () => {
    if (!props.timeInteraction || !chartInstance || isUnmounting.value) {
      axisPanBox.value = null
      return
    }
    const rect = getGridRect(chartInstance)
    if (!rect) {
      axisPanBox.value = null
      return
    }
    const dom = chartInstance.getDom()
    const axisTop = rect.y + rect.height
    const axisHeight = Math.max(28, dom.clientHeight - axisTop)
    axisPanBox.value = {
      left: `${rect.x}px`,
      width: `${rect.width}px`,
      top: `${axisTop}px`,
      height: `${axisHeight}px`,
    }
  }

  const resizeChart = () => {
    if (chartInstance && chartContainer.value && !isUnmounting.value) {
      try {
        chartInstance.resize()
        syncAxisPanOverlay()
      } catch (error) {
        console.warn('Failed to resize chart:', error)
      }
    }
  }

  useResizeObserver(chartContainer, () => {
    if (!isUnmounting.value) {
      resizeChart()
    }
  })

  const clearTimeInteraction = () => {
    detachTimeInteraction?.()
    detachTimeInteraction = null
    axisPointerDownHandler = null
    interactionLocked = false
    axisPanBox.value = null
  }

  const bindTimeInteraction = () => {
    clearTimeInteraction()
    if (!props.timeInteraction || !chartInstance || isUnmounting.value) {
      return
    }

    const bound = attachTimeInteraction(chartInstance, {
      isEnabled: () => props.timeInteraction && !isUnmounting.value,
      getTimeWindowMs: () => {
        if (props.timeWindowMs && props.timeWindowMs.toMs > props.timeWindowMs.fromMs) {
          return props.timeWindowMs
        }
        return null
      },
      onInteractionLock: (locked) => {
        interactionLocked = locked
      },
      onTimeRangeMs: (range) => {
        const unix = toUnixTimeRangeSeconds(range)
        if (!unix) {
          interactionLocked = false
          return
        }
        emit('timeRangeChange', unix)
        nextTick(() => {
          interactionLocked = false
          syncAxisPanOverlay()
        })
      },
    })

    detachTimeInteraction = bound.destroy
    axisPointerDownHandler = bound.onAxisPointerDown
    nextTick(() => syncAxisPanOverlay())
  }

  const onAxisPointerDown = (e: PointerEvent) => {
    axisPointerDownHandler?.(e)
  }

  const emitReady = () => {
    if (!chartInstance || isUnmounting.value) {
      return
    }
    emit('ready', chartInstance)
  }

  const initChartIfNeeded = () => {
    if (!chartContainer.value || !props.options || chartInstance || isUnmounting.value) {
      return
    }
    chartInstance = echarts.init(chartContainer.value)
    chartInstance.setOption(props.options, {
      notMerge: true,
      lazyUpdate: false,
    })
    nextTick(() => {
      activateBrushSelect()
      bindTimeInteraction()
      emitReady()
    })
    chartInstance.on('datazoom', (event) => {
      emit('datazoom', event)
    })
    attachWheelPassthrough()
  }

  onMounted(() => {
    initChartIfNeeded()
  })

  watch(
    () => props.options,
    (newOptions) => {
      if (!chartContainer.value || isUnmounting.value || !newOptions) return

      if (!chartInstance) {
        initChartIfNeeded()
        return
      }

      if (interactionLocked) {
        return
      }

      nextTick(() => {
        if (interactionLocked || !chartInstance || isUnmounting.value) {
          return
        }
        chartInstance.setOption(newOptions, {
          notMerge: true,
          lazyUpdate: false,
        })
        nextTick(() => {
          activateBrushSelect()
          syncAxisPanOverlay()
        })
      })
    },
    { deep: true, flush: 'post' }
  )

  watch(
    () => [props.brushSelect, props.timeInteraction] as const,
    () => {
      nextTick(() => {
        activateBrushSelect()
        bindTimeInteraction()
      })
    }
  )

  watch(
    () => props.timeWindowMs,
    () => {
      nextTick(() => syncAxisPanOverlay())
    },
    { deep: true }
  )

  onUnmounted(() => {
    clearTimeInteraction()
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
  .chart-wrap {
    position: relative;
    width: 100%;
  }

  .chart {
    width: 100%;
    height: 100%;
  }

  .chart-xaxis-pan {
    position: absolute;
    z-index: 3;
    box-sizing: border-box;
    cursor: grab;
    background: transparent;
    touch-action: none;
    user-select: none;
  }

  .chart-xaxis-pan:active {
    cursor: grabbing;
  }
</style>
