import { describe, expect, it, vi } from 'vitest'

import {
  declaredMetricKindFromSemantics,
  declaredMetricUnitFromSemantics,
  declaredTemporalityFromSemantics,
  mapDeclaredMetricType,
  type MetricTableSemantics,
} from './table-semantics'
import { mapUcumToPanelUnit, resolveMetricPanelUnit } from './metrics/metric-units'
import { inferPromQL, shouldApplyRate } from './metrics/infer-promql'

vi.mock('@/api/editor', () => ({
  default: {
    runSQL: vi.fn(),
  },
}))

describe('table-semantics', () => {
  it('maps declared OTLP metric.type strings', () => {
    expect(mapDeclaredMetricType('counter')).toBe('counter')
    expect(mapDeclaredMetricType('histogram')).toBe('histogram')
    expect(mapDeclaredMetricType('ExponentialHistogram')).toBe('histogram')
    expect(mapDeclaredMetricType('UpDownCounter')).toBe('updown_counter')
    expect(mapDeclaredMetricType('gauge')).toBe('gauge')
    expect(mapDeclaredMetricType('mystery')).toBeNull()
  })

  it('only trusts metadata_quality=declared for kind/unit/temporality', () => {
    const declared: MetricTableSemantics = {
      tableName: 'gen_ai_client_token_usage',
      metadataQuality: 'declared',
      metricType: 'histogram',
      metricUnit: 's',
      metricTemporality: 'cumulative',
    }
    expect(declaredMetricKindFromSemantics(declared)).toBe('histogram')
    expect(declaredMetricUnitFromSemantics(declared)).toBe('s')
    expect(declaredTemporalityFromSemantics(declared)).toBe('cumulative')

    const inferred: MetricTableSemantics = {
      ...declared,
      metadataQuality: 'inferred',
    }
    expect(declaredMetricKindFromSemantics(inferred)).toBeNull()
    expect(declaredMetricUnitFromSemantics(inferred)).toBeNull()
    expect(declaredTemporalityFromSemantics(null)).toBeNull()
  })
})

describe('UCUM unit mapping', () => {
  it('maps common UCUM to panel units', () => {
    expect(mapUcumToPanelUnit('s', false)).toBe('s')
    expect(mapUcumToPanelUnit('s', true)).toBe('none')
    expect(mapUcumToPanelUnit('By', false)).toBe('bytes')
    expect(mapUcumToPanelUnit('By', true)).toBe('Bps')
    expect(mapUcumToPanelUnit('1', false)).toBe('percentunit')
    expect(mapUcumToPanelUnit('{request}', true)).toBe('ucum:request/s')
    expect(mapUcumToPanelUnit('{token}', false)).toBe('ucum:token')
  })

  it('prefers semantic unit over name heuristic', () => {
    expect(resolveMetricPanelUnit('drilldown_demo_cpu_usage', false, { semanticUnit: '1' })).toBe('percentunit')
    expect(resolveMetricPanelUnit('http_requests_total', true, { semanticUnit: '{request}' })).toBe('ucum:request/s')
    expect(resolveMetricPanelUnit('http_requests_total', true)).toBe('cps')
  })
})

describe('temporality / rate', () => {
  it('skips rate for delta counters', () => {
    expect(shouldApplyRate('counter', 'cumulative')).toBe(true)
    expect(shouldApplyRate('counter', 'delta')).toBe(false)
    expect(inferPromQL('demo_total', undefined, { kind: 'counter', temporality: 'delta' })).toBe('sum(demo_total)')
    expect(inferPromQL('demo_total', undefined, { kind: 'counter', temporality: 'cumulative' })).toBe(
      'sum(rate(demo_total[5m]))'
    )
  })
})
