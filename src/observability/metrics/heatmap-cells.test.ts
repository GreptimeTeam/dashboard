import { describe, expect, it } from 'vitest'
import { formatHeatmapTooltip, selectVisibleHeatmapCells } from './prom-chart'

describe('selectVisibleHeatmapCells', () => {
  const cells: Array<[number, number, number]> = [
    [0, 0, 0.001],
    [0, 1, 0.16],
  ]

  it('keeps low-but-real cells on the main chart (Grafana 1e-9 floor)', () => {
    expect(selectVisibleHeatmapCells(cells)).toEqual(cells)
  })

  it('hides catalog cells below 1% of max', () => {
    expect(selectVisibleHeatmapCells(cells, { relativeHide: true })).toEqual([[0, 1, 0.16]])
  })
})

describe('formatHeatmapTooltip', () => {
  it('labels the cell value and bucket like Grafana', () => {
    expect(
      formatHeatmapTooltip({
        time: '15:04',
        bucket: '8 KiB – 128 MiB',
        value: '0.16',
        color: '#fee08b',
      })
    ).toBe('15:04<br/><span style="color:#fee08b">●</span> Value: 0.16<br/>Bucket: 8 KiB – 128 MiB')
  })
})
