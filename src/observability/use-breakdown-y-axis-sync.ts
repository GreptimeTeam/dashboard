import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'
import { absorbBreakdownYAxis, type BreakdownYAxisRange } from './metrics/breakdown-y-axis'

export interface BreakdownYAxisSync {
  range: Ref<BreakdownYAxisRange | null>
  epoch: Ref<number>
  stamp: () => number
  reset: () => void
  report: (values: Array<number | null | undefined>, seenGeneration: number) => BreakdownYAxisRange | null
}

const breakdownYAxisKey: InjectionKey<BreakdownYAxisSync> = Symbol('breakdown-y-axis')

/** Parent grid owns one shared extent. Cards report points as their own queries return. */
export function provideBreakdownYAxisSync(): BreakdownYAxisSync {
  const range = ref<BreakdownYAxisRange | null>(null)
  const epoch = ref(0)
  let generation = 0

  const sync: BreakdownYAxisSync = {
    range,
    epoch,
    stamp: () => generation,
    reset: () => {
      generation += 1
      range.value = null
      epoch.value += 1
    },
    report: (values, seenGeneration) => {
      if (seenGeneration !== generation) {
        return null
      }
      const next = absorbBreakdownYAxis(range.value, values)
      range.value = next.range
      if (next.changed) {
        epoch.value += 1
      }
      return next.range
    },
  }

  provide(breakdownYAxisKey, sync)
  return sync
}

export function useBreakdownYAxisSync(): BreakdownYAxisSync | null {
  return inject(breakdownYAxisKey, null)
}

export default provideBreakdownYAxisSync
