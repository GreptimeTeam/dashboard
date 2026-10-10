import { describe, expect, it } from 'vitest'
import useTimeRange from './use-time-range'

describe('useTimeRange', () => {
  it('prefers absolute rangeTime over relative time when both are set', () => {
    const { time, rangeTime, unixTimeRange } = useTimeRange({ time: 30 })
    time.value = 30
    rangeTime.value = ['1000', '2000']
    expect(unixTimeRange()).toEqual([1000, 2000])
  })

  it('uses relative window when rangeTime is empty', () => {
    const { time, rangeTime, unixTimeRange } = useTimeRange({ time: 30 })
    time.value = 30
    rangeTime.value = []
    const [start, end] = unixTimeRange()
    expect(end - start).toBe(30 * 60)
  })
})
