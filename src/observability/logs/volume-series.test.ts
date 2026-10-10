import { describe, expect, it } from 'vitest'
import { pivotLogVolumeByName, pivotLogVolumeRows } from './volume-series'

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

  it('stacks arbitrary names with the largest total on top', () => {
    const series = pivotLogVolumeByName([
      { unix: 10, name: 'checkout', count: 2 },
      { unix: 10, name: 'payments', count: 8 },
      { unix: 20, name: 'checkout', count: 1 },
    ])
    expect(series.map((item) => item.name)).toEqual(['checkout', 'payments'])
    expect(series[0].points).toEqual([
      [10, 2],
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
