import { describe, expect, it, vi } from 'vitest'

import { declaredMetricKindFromSemantics, mapDeclaredMetricType, type MetricTableSemantics } from './table-semantics'

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

  it('only trusts metadata_quality=declared', () => {
    const declared: MetricTableSemantics = {
      tableName: 'gen_ai_client_token_usage',
      metadataQuality: 'declared',
      metricType: 'histogram',
    }
    expect(declaredMetricKindFromSemantics(declared)).toBe('histogram')

    const inferred: MetricTableSemantics = {
      ...declared,
      metadataQuality: 'inferred',
    }
    expect(declaredMetricKindFromSemantics(inferred)).toBeNull()
    expect(declaredMetricKindFromSemantics(null)).toBeNull()
  })
})
