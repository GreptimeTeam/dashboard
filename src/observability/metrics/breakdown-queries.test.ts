import { describe, expect, it } from 'vitest'
import { buildBreakdownGroupByExpr, buildBreakdownValueExpr, histogramSumMetricName } from './breakdown-queries'

describe('breakdown-queries', () => {
  it('maps histogram names to _sum series', () => {
    expect(histogramSumMetricName('http_request_duration_seconds')).toBe('http_request_duration_seconds_sum')
    expect(histogramSumMetricName('http_request_duration_seconds_bucket')).toBe('http_request_duration_seconds_sum')
    expect(histogramSumMetricName('latency_sum')).toBe('latency_sum')
  })

  it('builds counter group-by and value exprs', () => {
    expect(buildBreakdownGroupByExpr('http_requests_total', 'job', undefined, 'counter')).toBe(
      'sum(rate(http_requests_total[5m])) by (job)'
    )
    expect(buildBreakdownValueExpr('http_requests_total', 'job', 'api', 'env="prod"', 'counter')).toBe(
      'sum(rate(http_requests_total{env="prod",job="api"}[5m]))'
    )
  })

  it('builds gauge avg and histogram sum-by-label', () => {
    expect(buildBreakdownGroupByExpr('process_resident_memory_bytes', 'instance', undefined, 'gauge')).toBe(
      'avg(process_resident_memory_bytes) by (instance)'
    )
    expect(buildBreakdownGroupByExpr('http_request_duration_seconds', 'job', undefined, 'histogram')).toBe(
      'sum(rate(http_request_duration_seconds_sum[5m])) by (job)'
    )
    expect(buildBreakdownValueExpr('http_request_duration_seconds', 'job', 'api', undefined, 'histogram')).toBe(
      'sum(rate(http_request_duration_seconds_sum{job="api"}[5m]))'
    )
  })
})
