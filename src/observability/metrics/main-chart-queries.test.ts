import { describe, expect, it } from 'vitest'
import buildMainChartQueries from './main-chart-queries'
import { defaultPrefsForMetric, resolvePrefsForMetric } from './main-chart-config'

describe('main-chart-queries', () => {
  it('uses sum(rate) for counter default', () => {
    const prefs = defaultPrefsForMetric('http_requests_total')
    const plan = buildMainChartQueries('http_requests_total', undefined, prefs)
    expect(plan.panel).toBe('timeseries')
    expect(plan.queries).toHaveLength(1)
    expect(plan.queries[0].expr).toBe('sum(rate(http_requests_total[5m]))')
    expect(plan.queries[0].legend).toBe('sum(rate)')
  })

  it('builds min+max for gauge configure', () => {
    const prefs = resolvePrefsForMetric('process_resident_memory_bytes', { agg: 'min_max' })
    const plan = buildMainChartQueries('process_resident_memory_bytes', 'job="api"', prefs)
    expect(plan.queries.map((q) => q.expr)).toEqual([
      'min(process_resident_memory_bytes{job="api"})',
      'max(process_resident_memory_bytes{job="api"})',
    ])
  })

  it('builds heatmap and percentile queries for histogram', () => {
    const heatmap = buildMainChartQueries(
      'http_request_duration_seconds',
      undefined,
      defaultPrefsForMetric('http_request_duration_seconds')
    )
    expect(heatmap.panel).toBe('heatmap')
    expect(heatmap.queries[0].expr).toContain('by (le)')

    const percentiles = buildMainChartQueries(
      'http_request_duration_seconds',
      undefined,
      resolvePrefsForMetric('http_request_duration_seconds', { variant: 'percentiles' })
    )
    expect(percentiles.panel).toBe('timeseries')
    expect(percentiles.queries).toHaveLength(3)
    expect(percentiles.queries[0].expr).toContain('histogram_quantile(0.99')
    expect(percentiles.queries[0].legend).toBe('p99')
  })
})
