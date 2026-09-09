import { describe, expect, it } from 'vitest'
import {
  SPARKLINE_MAX_DATA_POINTS,
  HEATMAP_MAX_DATA_POINTS,
  calculateSparklineIntervalMs,
  calculateSparklineQueryStep,
  estimateSparklinePointCount,
  roundInterval,
} from './sparkline-step'

describe('sparkline-step', () => {
  it('roundInterval matches Grafana buckets', () => {
    expect(roundInterval(7200)).toBe(5000)
    expect(roundInterval(60000)).toBe(60000)
  })

  it('uses Grafana MEDIUM maxDataPoints for catalog sparklines', () => {
    expect(SPARKLINE_MAX_DATA_POINTS).toBe(250)
  })

  it('uses fewer maxDataPoints for catalog heatmaps (wider cells)', () => {
    expect(HEATMAP_MAX_DATA_POINTS).toBe(15)
    const rangeMs = 30 * 60 * 1000
    // 30m / 15 = 120s
    expect(calculateSparklineIntervalMs(rangeMs, { maxDataPoints: HEATMAP_MAX_DATA_POINTS })).toBe(120_000)
    expect(calculateSparklineQueryStep([0, 30 * 60], { maxDataPoints: HEATMAP_MAX_DATA_POINTS })).toBe('120')
  })

  it('uses 5s step for 30m range (MEDIUM maxDataPoints=250)', () => {
    const rangeMs = 30 * 60 * 1000
    const intervalMs = calculateSparklineIntervalMs(rangeMs)

    expect(intervalMs).toBe(5000)
    expect(calculateSparklineQueryStep([0, 30 * 60])).toBe('5')

    const points = estimateSparklinePointCount(rangeMs, intervalMs)
    expect(points).toBe(361)
  })

  it('matches Grafana calculateInterval with fixed maxDataPoints=250 (MEDIUM / list)', () => {
    const rangeMs = 30 * 60 * 1000
    expect(calculateSparklineIntervalMs(rangeMs, { maxDataPoints: 250 })).toBe(5000)
  })

  it('matches Grafana calculateInterval with fixed maxDataPoints=500 (HIGH / main chart)', () => {
    // 1h / 500 = 7.2s → roundInterval → 5s; 1h / 250 (MEDIUM) → 15s
    const rangeMs = 60 * 60 * 1000
    expect(calculateSparklineIntervalMs(rangeMs, { maxDataPoints: 500 })).toBe(5000)
    expect(calculateSparklineIntervalMs(rangeMs, { maxDataPoints: 250 })).toBe(15_000)
    expect(calculateSparklineQueryStep([0, 60 * 60], { maxDataPoints: 500 })).toBe('5')
  })

  it('honors datasource min interval floor', () => {
    const rangeMs = 30 * 60 * 1000
    expect(calculateSparklineIntervalMs(rangeMs, { minIntervalMs: 120_000 })).toBe(120_000)
  })

  it('scales step with longer ranges', () => {
    // 24h / 250 → ~5m (not 1h — avoids empty results on short sample bursts)
    expect(calculateSparklineQueryStep([0, 24 * 60 * 60])).toBe('300')
    // 6h / 250 ≈ 86.4s → roundInterval → 60s
    expect(calculateSparklineQueryStep([0, 6 * 60 * 60])).toBe('60')
  })
})
