import { describe, expect, it } from 'vitest'
import breakSparklineGaps from './sparkline-gaps'

describe('breakSparklineGaps', () => {
  it('inserts a null when a middle segment is missing samples', () => {
    // step=60: points every minute, then a 5-minute hole
    const points: Array<[number, number | null]> = [
      [0, 1],
      [60, 2],
      [120, 3],
      [420, 4],
      [480, 5],
    ]
    const filled = breakSparklineGaps(points, 60)
    expect(filled).toEqual([
      [0, 1],
      [60, 2],
      [120, 3],
      [180, null],
      [420, 4],
      [480, 5],
    ])
  })

  it('does not break regular series when server step is coarser than query step', () => {
    // query asked 60s but samples arrive every 120s
    const points: Array<[number, number | null]> = [
      [0, 1],
      [120, 2],
      [240, 3],
      [360, 4],
    ]
    expect(breakSparklineGaps(points, 60)).toEqual(points)
  })

  it('leaves short series unchanged', () => {
    expect(breakSparklineGaps([[10, 1]], 60)).toEqual([[10, 1]])
    expect(breakSparklineGaps([], 60)).toEqual([])
  })
})
