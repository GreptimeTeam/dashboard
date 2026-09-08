import { describe, expect, it } from 'vitest'
import formatTimeAxisLabel, {
  SPARKLINE_AXIS_PLOT_WIDTH_PX,
  calculateTimeAxisTicks,
  calculateYAxisSplitNumber,
  generateTimeAxisTicks,
  mapTimeTicksToCategoryIndexes,
  pickTimeAxisIntervalMs,
} from './chart-time-axis'

describe('chart-time-axis', () => {
  it('picks 5m ticks for 30m range on sparkline width (Grafana-like density)', () => {
    const rangeMs = 30 * 60 * 1000
    const intervalMs = pickTimeAxisIntervalMs(rangeMs, SPARKLINE_AXIS_PLOT_WIDTH_PX)
    expect(intervalMs).toBe(5 * 60 * 1000)
  })

  it('places denser x ticks when plot is wider (main chart)', () => {
    const rangeMs = 30 * 60 * 1000
    const catalog = pickTimeAxisIntervalMs(rangeMs, SPARKLINE_AXIS_PLOT_WIDTH_PX)
    const main = pickTimeAxisIntervalMs(rangeMs, 960)
    expect(main).toBeLessThanOrEqual(catalog)
  })

  it('places the first tick at the axis start and omits the clipped end tick', () => {
    const start = new Date(2026, 0, 1, 10, 2, 0).getTime()
    const end = start + 30 * 60 * 1000
    const ticks = generateTimeAxisTicks(start, end, 5 * 60 * 1000)
    expect(ticks[0]).toBe(start)
    expect(ticks).toHaveLength(6)
    expect(ticks[ticks.length - 1]).toBe(start + 25 * 60 * 1000)
    expect(ticks.every((t, i) => i === 0 || t - ticks[i - 1] === 5 * 60 * 1000)).toBe(true)
  })

  it('formats 30m / 5m ticks as HH:mm', () => {
    const ts = new Date(2026, 0, 1, 10, 15, 0).getTime()
    expect(formatTimeAxisLabel(ts, 30 * 60 * 1000, 5 * 60 * 1000)).toBe('10:15')
  })

  it('formats sub-minute ticks as HH:mm:ss', () => {
    const ts = new Date(2026, 0, 1, 10, 15, 30).getTime()
    expect(formatTimeAxisLabel(ts, 5 * 60 * 1000, 30 * 1000)).toBe('10:15:30')
  })

  it('returns tick set for sparkline option wiring', () => {
    const start = new Date(2026, 0, 1, 10, 0, 0).getTime()
    const end = start + 30 * 60 * 1000
    const { intervalMs, ticks } = calculateTimeAxisTicks(start, end)
    expect(intervalMs).toBe(5 * 60 * 1000)
    expect(ticks.length).toBeGreaterThanOrEqual(5)
    expect(ticks.length).toBeLessThanOrEqual(7)
  })

  it('derives denser y splitNumber for taller main chart', () => {
    expect(calculateYAxisSplitNumber(168)).toBeLessThan(calculateYAxisSplitNumber(280))
    expect(calculateYAxisSplitNumber(280)).toBeGreaterThanOrEqual(5)
    expect(calculateYAxisSplitNumber(280)).toBeLessThanOrEqual(10)
  })

  it('maps heatmap category labels evenly like timeseries customValues', () => {
    const start = 1_000_000
    const end = start + 60_000
    const ticks = [start, start + 20_000, start + 40_000]
    const labels = mapTimeTicksToCategoryIndexes(7, ticks, start, end)

    expect([...labels.keys()].sort((a, b) => a - b)).toEqual([0, 2, 4])
    expect(labels.get(0)).toBe(start)
    expect(labels.get(2)).toBe(start + 20_000)
    expect(labels.get(4)).toBe(start + 40_000)
  })

  it('keeps unique heatmap label indexes when ticks collide after rounding', () => {
    const labels = mapTimeTicksToCategoryIndexes(2, [0, 10, 20], 0, 1000)
    expect(labels.size).toBeLessThanOrEqual(2)
    expect(labels.has(0)).toBe(true)
  })
})
