import { describe, expect, it } from 'vitest'

import {
  declaredMetricKindFromSemantics,
  declaredMetricUnitFromSemantics,
  declaredTemporalityFromSemantics,
  mapDeclaredMetricType,
  type TableSemantics,
} from './model'

describe('semantics/model metric declaration', () => {
  it('maps the DB-side metric.type whitelist', () => {
    expect(mapDeclaredMetricType('counter')).toBe('counter')
    expect(mapDeclaredMetricType('histogram')).toBe('histogram')
    expect(mapDeclaredMetricType('gauge')).toBe('gauge')
    expect(mapDeclaredMetricType('updown_counter')).toBe('updown_counter')
    expect(mapDeclaredMetricType('summary')).toBe('summary')
    expect(mapDeclaredMetricType('gauge_histogram')).toBe('gauge_histogram')
    expect(mapDeclaredMetricType('info')).toBe('gauge')
    expect(mapDeclaredMetricType('stateset')).toBe('gauge')
    // Server-side "I do not know" sentinels must not fall back to a name guess.
    expect(mapDeclaredMetricType('mixed')).toBe('unknown')
    expect(mapDeclaredMetricType('unknown')).toBe('unknown')
    // Not in the DB whitelist, so these can never appear.
    expect(mapDeclaredMetricType('ExponentialHistogram')).toBeNull()
    expect(mapDeclaredMetricType('updowncounter')).toBeNull()
    expect(mapDeclaredMetricType('mystery')).toBeNull()
  })

  it('gates only kind on metadata_quality; unit/temporality are usable when present', () => {
    const declared: TableSemantics = {
      tableName: 'gen_ai_client_token_usage',
      metadataQuality: 'declared',
      metricType: 'histogram',
      metricUnit: 's',
      metricTemporality: 'cumulative',
    }
    expect(declaredMetricKindFromSemantics(declared)).toBe('histogram')
    expect(declaredMetricUnitFromSemantics(declared)).toBe('s')
    expect(declaredTemporalityFromSemantics(declared)).toBe('cumulative')

    const inferred: TableSemantics = {
      ...declared,
      metadataQuality: 'inferred',
    }
    expect(declaredMetricKindFromSemantics(inferred)).toBeNull()
    // `metadata_quality` describes `metric.type` only — the unit is never guessed.
    expect(declaredMetricUnitFromSemantics(inferred)).toBe('s')
    expect(declaredTemporalityFromSemantics(inferred)).toBe('cumulative')
    expect(declaredMetricUnitFromSemantics(null)).toBeNull()
    expect(declaredTemporalityFromSemantics(null)).toBeNull()
  })
})
