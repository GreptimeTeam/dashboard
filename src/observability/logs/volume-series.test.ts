import { describe, expect, it } from 'vitest'
import { pivotLogVolumeRows } from './volume-series'

describe('pivotLogVolumeRows', () => {
  it('stacks levels with unknown at the bottom and error above info', () => {
    const series = pivotLogVolumeRows(
      [
        { unix: 10, level: 'error', count: 2 },
        { unix: 10, level: 'info', count: 5 },
        { unix: 20, level: 'info', count: 1 },
        { unix: 20, level: null, count: 3 },
      ],
      { groupByLevel: true, singleSeriesName: 'unknown' }
    )
    expect(series.map((item) => item.name)).toEqual(['unknown', 'info', 'error'])
    expect(series[0].points).toEqual([
      [10, 0],
      [20, 3],
    ])
    expect(series[1].points).toEqual([
      [10, 5],
      [20, 1],
    ])
  })

  it('keeps a single colored series when the breakdown label is severity', () => {
    const series = pivotLogVolumeRows(
      [
        { unix: 10, level: null, count: 4 },
        { unix: 20, level: null, count: 1 },
      ],
      { groupByLevel: false, singleSeriesName: 'error' }
    )
    expect(series).toEqual([
      {
        name: 'error',
        points: [
          [10, 4],
          [20, 1],
        ],
      },
    ])
  })
})
