import { describe, expect, it } from 'vitest'
import expandHeatmapTimeGrid from './heatmap-time-grid'

describe('expandHeatmapTimeGrid', () => {
  it('keeps a dense query-aligned series on the same columns', () => {
    const times = [1000, 1010, 1020]
    const cells: Array<[number, number, number]> = [
      [0, 0, 1],
      [2, 1, 4],
    ]
    const expanded = expandHeatmapTimeGrid(times, cells, [1000, 1020], 10)
    expect(expanded.times).toEqual(times)
    expect(expanded.cells).toEqual(cells)
  })

  it('leaves empty columns when samples only cover the end of the window', () => {
    const expanded = expandHeatmapTimeGrid([1090], [[0, 1, 5]], [1000, 1100], 10)
    expect(expanded.times[0]).toBe(1000)
    expect(expanded.times[expanded.times.length - 1]).toBe(1100)
    expect(expanded.cells).toEqual([[9, 1, 5]])
    expect(expanded.times).toHaveLength(11)
  })

  it('keeps a hole in the middle blank', () => {
    const expanded = expandHeatmapTimeGrid(
      [1000, 1030],
      [
        [0, 0, 2],
        [1, 0, 3],
      ],
      [1000, 1030],
      10
    )
    expect(expanded.times).toEqual([1000, 1010, 1020, 1030])
    expect(expanded.cells).toEqual([
      [0, 0, 2],
      [3, 0, 3],
    ])
  })

  it('does not invent columns when the step already covers the window', () => {
    const times = [1000]
    const cells: Array<[number, number, number]> = [[0, 0, 1]]
    expect(expandHeatmapTimeGrid(times, cells, [1000, 1005], 60)).toEqual({ times, cells })
  })
})
