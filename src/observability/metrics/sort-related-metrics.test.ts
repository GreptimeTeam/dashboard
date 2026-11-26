import { afterEach, describe, expect, it } from 'vitest'
import { clearRelatedMetricsDistanceCache, levenshtein, sortRelatedMetrics } from './sort-related-metrics'

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('http_requests_total', 'http_requests_total')).toBe(0)
  })

  it('counts insertions and substitutions', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
  })
})

describe('sortRelatedMetrics', () => {
  afterEach(() => {
    clearRelatedMetricsDistanceCache()
  })

  it('puts the current metric first', () => {
    const sorted = sortRelatedMetrics(
      ['go_goroutines', 'http_requests_total', 'http_request_duration_seconds'],
      'http_requests_total'
    )
    expect(sorted[0]).toBe('http_requests_total')
  })

  it('ranks same-prefix names ahead of unrelated names', () => {
    const sorted = sortRelatedMetrics(
      ['go_goroutines', 'http_request_duration_seconds', 'process_cpu_seconds_total'],
      'http_requests_total'
    )
    expect(sorted.indexOf('http_request_duration_seconds')).toBeLessThan(sorted.indexOf('go_goroutines'))
    expect(sorted.indexOf('http_request_duration_seconds')).toBeLessThan(sorted.indexOf('process_cpu_seconds_total'))
  })

  it('does not mutate the input array', () => {
    const input = ['b_metric', 'a_metric']
    const sorted = sortRelatedMetrics(input, 'a_metric')
    expect(input).toEqual(['b_metric', 'a_metric'])
    expect(sorted[0]).toBe('a_metric')
  })
})
