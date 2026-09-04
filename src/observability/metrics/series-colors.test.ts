import { describe, expect, it } from 'vitest'
import getSeriesColorByIndex, {
  GRAFANA_SERIES_PALETTE_DARK,
  GRAFANA_SERIES_PALETTE_LIGHT,
  SERIES_FILL_OPACITY,
} from './series-colors'

describe('series-colors', () => {
  it('matches Grafana getColorByIndex (palette length 8, cycles)', () => {
    expect(GRAFANA_SERIES_PALETTE_DARK).toHaveLength(8)
    expect(GRAFANA_SERIES_PALETTE_LIGHT).toHaveLength(8)
    expect(getSeriesColorByIndex(0, true)).toBe('#73BF69')
    expect(getSeriesColorByIndex(2, true)).toBe('#5794F2')
    expect(getSeriesColorByIndex(8, true)).toBe(getSeriesColorByIndex(0, true))
  })

  it('uses light theme hues when isDark is false', () => {
    expect(getSeriesColorByIndex(0, false)).toBe('#56A64B')
    expect(getSeriesColorByIndex(2, false)).toBe('#3274D9')
  })

  it('uses Grafana timeseries fillOpacity of 9%', () => {
    expect(SERIES_FILL_OPACITY).toBe(0.09)
  })
})
