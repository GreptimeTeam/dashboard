import { describe, expect, it } from 'vitest'
import type { CachedMainChart } from '@/observability/use-metric-main-chart'
import mainChartCachedToTableRows from './main-chart-table'

describe('mainChartCachedToTableRows', () => {
  it('returns empty for null', () => {
    expect(mainChartCachedToTableRows(null)).toEqual([])
  })

  it('maps one Prom series per row from rawByQuery (not aggregated legend lines)', () => {
    const cached: CachedMainChart = {
      kind: 'timeseries',
      name: 'http_requests_total',
      timeRange: [0, 100],
      series: [
        {
          legend: 'sum(rate)',
          expr: 'sum(rate(http_requests_total[5m]))',
          points: [[1, 99]],
        },
      ],
      rawByQuery: [
        {
          legend: 'sum(rate)',
          expr: 'sum(rate(http_requests_total[5m]))',
          series: [
            {
              metric: { __name__: 'http_requests_total', job: 'api', instance: '1' },
              values: [
                [1, '10'],
                [2, '12'],
              ],
            },
            {
              metric: { __name__: 'http_requests_total', job: 'api', instance: '2' },
              values: [[2, '20']],
            },
          ],
        },
      ],
    }

    const rows = mainChartCachedToTableRows(cached)
    expect(rows).toHaveLength(2)
    expect(rows[0].series).toBe('http_requests_total{job="api", instance="1"}')
    expect(rows[0].values).toBe('12')
    expect(rows[0].labels).toEqual([
      { key: 'job', value: 'api' },
      { key: 'instance', value: '1' },
    ])
    expect(rows[1].series).toBe('http_requests_total{job="api", instance="2"}')
    expect(rows[1].values).toBe('20')
  })

  it('prefixes legend when multiple main-chart queries', () => {
    const cached: CachedMainChart = {
      kind: 'timeseries',
      name: 'demo',
      timeRange: [0, 100],
      series: [],
      rawByQuery: [
        {
          legend: 'min',
          expr: 'min(demo)',
          series: [{ metric: { __name__: 'demo', env: 'prod' }, values: [[1, '1']] }],
        },
        {
          legend: 'max',
          expr: 'max(demo)',
          series: [{ metric: { __name__: 'demo', env: 'prod' }, values: [[1, '9']] }],
        },
      ],
    }
    const rows = mainChartCachedToTableRows(cached)
    expect(rows.map((row) => row.series)).toEqual(['min: demo{env="prod"}', 'max: demo{env="prod"}'])
  })

  it('returns empty when timeseries cache lacks rawByQuery', () => {
    const cached = {
      kind: 'timeseries' as const,
      name: 'demo',
      timeRange: [0, 100] as [number, number],
      series: [{ legend: 'avg', expr: 'avg(demo)', points: [[1, 1] as [number, number]] }],
    }
    expect(mainChartCachedToTableRows(cached as CachedMainChart)).toEqual([])
  })

  it('maps heatmap raw bucket series', () => {
    const cached: CachedMainChart = {
      kind: 'heatmap',
      name: 'latency_bucket',
      expr: 'sum(rate(latency_bucket[5m])) by (le)',
      timeRange: [0, 1],
      heatmap: { times: [], buckets: [], cells: [], minValue: 0, maxValue: 0 },
      rawSeries: [
        {
          metric: { __name__: 'latency_bucket', le: '0.1' },
          values: [[1, '3']],
        },
      ],
    }
    const rows = mainChartCachedToTableRows(cached)
    expect(rows).toHaveLength(1)
    expect(rows[0].series).toBe('latency_bucket{le="0.1"}')
    expect(rows[0].values).toBe('3')
  })
})
