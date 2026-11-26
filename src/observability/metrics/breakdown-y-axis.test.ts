import { describe, expect, it } from 'vitest'
import { absorbBreakdownYAxis } from './breakdown-y-axis'

describe('absorbBreakdownYAxis', () => {
  it('ignores zeros and does not pin a constant series', () => {
    expect(absorbBreakdownYAxis(null, [0, 1, 0, null])).toEqual({ range: null, changed: false })
  })

  it('establishes a range from non-zero samples and expands it later', () => {
    const first = absorbBreakdownYAxis(null, [1, 5, 0])
    expect(first).toEqual({ range: { min: 1, max: 5 }, changed: true })

    const within = absorbBreakdownYAxis(first.range, [2, 3])
    expect(within).toEqual({ range: { min: 1, max: 5 }, changed: false })

    const wider = absorbBreakdownYAxis(first.range, [-2, 10])
    expect(wider).toEqual({ range: { min: -2, max: 10 }, changed: true })
  })
})
