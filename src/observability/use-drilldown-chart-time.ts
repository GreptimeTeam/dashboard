import { computed } from 'vue'
import type { DrilldownContext } from './context'

export default function useDrilldownChartTime(ctx: DrilldownContext) {
  const timeWindowMs = computed(() => {
    const range = ctx.unixTimeRange()
    if (range.length !== 2) {
      return null
    }
    return { fromMs: range[0] * 1000, toMs: range[1] * 1000 }
  })

  const onTimeRangeChange = ([startSec, endSec]: [number, number]) => {
    if (!(endSec > startSec)) {
      return
    }
    ctx.rangeTime.value = [String(startSec), String(endSec)]
    ctx.time.value = 0
    ctx.triggerRefresh()
  }

  return {
    timeWindowMs,
    onTimeRangeChange,
  }
}
