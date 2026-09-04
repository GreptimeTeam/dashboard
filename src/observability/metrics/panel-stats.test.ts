import { describe, expect, it } from 'vitest'
import { formatMetricAxisValue, formatMetricPanelValue } from './panel-stats'

describe('panel-stats formatters', () => {
  it('formats counter rate axis like Grafana cps (c/s, not bare /s)', () => {
    expect(formatMetricAxisValue(0.3, { kind: 'counter', forAxis: true })).toBe('0.3 c/s')
    expect(formatMetricAxisValue(0.003, { kind: 'counter', forAxis: true })).toBe('0.003 c/s')
    expect(formatMetricAxisValue(3, { kind: 'counter', forAxis: true })).toBe('3 c/s')
    expect(formatMetricAxisValue(1500, { kind: 'counter', forAxis: true })).toBe('1.5K c/s')
  })

  it('uses Bps for byte counters when metric name is known', () => {
    expect(
      formatMetricAxisValue(1500, {
        kind: 'counter',
        metricName: 'go_memstats_alloc_bytes_total',
        forAxis: true,
      })
    ).toBe('1.5 kB/s')
  })

  it('uses duration unit for seconds gauges', () => {
    expect(
      formatMetricAxisValue(0.3, {
        kind: 'gauge',
        metricName: 'go_gc_duration_seconds',
        forAxis: true,
      })
    ).toBe('300 ms')
  })

  it('uses scientific only for very small unitless magnitudes', () => {
    expect(formatMetricAxisValue(3e-4, { kind: 'gauge', forAxis: true })).toBe('3.00e-4')
  })

  it('omits rate unit for non-rate kinds without a name unit', () => {
    expect(formatMetricAxisValue(0.3, { kind: 'gauge', forAxis: true })).toBe('0.3')
    expect(formatMetricPanelValue(0.3)).toBe('0.3')
  })
})
