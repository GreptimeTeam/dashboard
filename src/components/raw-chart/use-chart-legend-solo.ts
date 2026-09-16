import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { toggleLegendSolo } from './legend-solo'

type ChartInstance = {
  on: (event: 'legendselectchanged', handler: (params: { name?: string }) => void) => void
  off: (event: 'legendselectchanged', handler: (params: { name?: string }) => void) => void
}

type ChartHandle = {
  getInstance: () => ChartInstance | null
}

/**
 * Bind ECharts `legendselectchanged` to solo mode.
 * Callers still put `legendSoloSelected` on the option so `setOption({ notMerge: true })` does not wipe it.
 */
export default function useChartLegendSolo(options: {
  getChart: () => ChartHandle | undefined
  enabled: () => boolean
  resetKey: () => unknown
}) {
  const soloSeriesName = ref<string | null>(null)
  let boundChart: ChartInstance | null = null
  let handler: ((params: { name?: string }) => void) | null = null

  function detach() {
    if (boundChart && handler) {
      boundChart.off('legendselectchanged', handler)
    }
    boundChart = null
    handler = null
  }

  function attach() {
    detach()
    const instance = options.getChart()?.getInstance() ?? null
    if (!instance) {
      return
    }
    handler = (params) => {
      const name = params?.name
      if (!name) {
        return
      }
      soloSeriesName.value = toggleLegendSolo(soloSeriesName.value, name)
    }
    instance.on('legendselectchanged', handler)
    boundChart = instance
  }

  watch(options.resetKey, () => {
    soloSeriesName.value = null
  })

  watch(
    [options.enabled, options.resetKey],
    () => {
      if (!options.enabled()) {
        return
      }
      nextTick(() => {
        attach()
      })
    },
    { immediate: true }
  )

  onBeforeUnmount(detach)

  return { soloSeriesName }
}
