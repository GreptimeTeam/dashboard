import { computed } from 'vue'
import type { DrilldownContext } from './context'

export default function useDrilldownChartTime(ctx: DrilldownContext) {
  const timeWindowMs = computed(() => {
    const range = ctx.query.unixTimeRange()
    if (range.length !== 2) {
      return null
    }
    return { fromMs: range[0] * 1000, toMs: range[1] * 1000 }
  })

  const onTimeRangeChange = ([startSec, endSec]: [number, number]) => {
    if (!(endSec > startSec)) {
      return
    }
    ctx.query.rangeTime.value = [String(startSec), String(endSec)]
    ctx.query.time.value = 0
    ctx.actions.triggerRefresh()
  }

  return {
    timeWindowMs,
    onTimeRangeChange,
  }
}
