import { describe, expect, it } from 'vitest'
import {
  formatMetricUnitValue,
  getPerSecondRateUnit,
  getUnit,
  getUnitFromMetric,
  resolveMetricPanelUnit,
} from './metric-units'

describe('getUnitFromMetric', () => {
  it('extracts trailing unit suffixes', () => {
    expect(getUnitFromMetric('go_gc_gomemlimit_bytes')).toBe('bytes')
    expect(getUnitFromMetric('go_gc_duration_seconds')).toBe('seconds')
    expect(getUnitFromMetric('node_rapl_package_joules_total')).toBe('joules')
  })

  it('returns null when no known unit', () => {
    expect(getUnitFromMetric('http_requests_total')).toBeNull()
    expect(getUnitFromMetric('ALERTS')).toBeNull()
  })
})

describe('getUnit / getPerSecondRateUnit', () => {
  it('maps gauge units', () => {
    expect(getUnit('go_memstats_alloc_bytes')).toBe('bytes')
    expect(getUnit('go_gc_duration_seconds')).toBe('s')
    expect(getUnit('http_requests_total')).toBe('none')
  })

  it('maps rate units like Grafana timeseries', () => {
    expect(getPerSecondRateUnit('http_requests_total')).toBe('cps')
    expect(getPerSecondRateUnit('go_memstats_alloc_bytes_total')).toBe('Bps')
    expect(getPerSecondRateUnit('go_gc_duration_seconds_total')).toBe('none')
    expect(getPerSecondRateUnit('node_rapl_package_joules_total')).toBe('watt')
  })

  it('resolveMetricPanelUnit switches on isRateQuery', () => {
    expect(resolveMetricPanelUnit('http_requests_total', true)).toBe('cps')
    expect(resolveMetricPanelUnit('go_memstats_alloc_bytes', false)).toBe('bytes')
  })

  it('formats ucum annotated units', () => {
    expect(formatMetricUnitValue(12, 'ucum:request')).toBe('12 request')
    expect(formatMetricUnitValue(0.5, 'ucum:request/s')).toBe('0.5 request/s')
  })
})

describe('formatMetricUnitValue', () => {
  it('formats cps like Grafana simpleCountUnit(c/s)', () => {
    expect(formatMetricUnitValue(0.3, 'cps')).toBe('0.3 c/s')
    expect(formatMetricUnitValue(3, 'cps')).toBe('3 c/s')
    expect(formatMetricUnitValue(1500, 'cps')).toBe('1.5K c/s')
  })

  it('formats Bps with SI prefixes', () => {
    expect(formatMetricUnitValue(500, 'Bps')).toBe('500 B/s')
    expect(formatMetricUnitValue(1500, 'Bps')).toBe('1.5 kB/s')
  })

  it('formats bytes with binary prefixes', () => {
    expect(formatMetricUnitValue(1024, 'bytes')).toBe('1 KiB')
    expect(formatMetricUnitValue(512, 'bytes')).toBe('512 B')
  })

  it('formats seconds durations', () => {
    expect(formatMetricUnitValue(0.3, 's')).toBe('300 ms')
    expect(formatMetricUnitValue(2, 's')).toBe('2 s')
  })
})
