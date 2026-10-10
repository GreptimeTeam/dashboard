import { describe, expect, it } from 'vitest'
import { promInstantResultToTableRows } from './prom-instant-table'

describe('promInstantResultToTableRows', () => {
  it('returns empty array for empty input', () => {
    expect(promInstantResultToTableRows(null)).toEqual([])
    expect(promInstantResultToTableRows([])).toEqual([])
  })

  it('maps vector sample without labels', () => {
    const rows = promInstantResultToTableRows([
      {
        metric: { __name__: 'up' },
        value: [1700000000, '1'],
      },
    ])
    expect(rows).toEqual([
      {
        series: 'up',
        metricName: 'up',
        labels: [],
        values: '1',
        legend: undefined,
      },
    ])
  })

  it('formats labels and optional legend prefix', () => {
    const rows = promInstantResultToTableRows(
      [
        {
          metric: { __name__: 'http_requests_total', job: 'api', instance: '1' },
          value: [1700000000, '42'],
        },
      ],
      { legend: 'sum(rate)' }
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].series).toBe('sum(rate): http_requests_total{job="api", instance="1"}')
    expect(rows[0].labels).toEqual([
      { key: 'job', value: 'api' },
      { key: 'instance', value: '1' },
    ])
    expect(rows[0].values).toBe('42')
    expect(rows[0].legend).toBe('sum(rate)')
  })

  it('skips series without value', () => {
    expect(
      promInstantResultToTableRows([
        {
          metric: { __name__: 'up' },
        },
      ])
    ).toEqual([])
  })

  it('maps range matrix series to the last sample', () => {
    const rows = promInstantResultToTableRows([
      {
        metric: { __name__: 'up', job: 'api' },
        values: [
          [1700000000, '1'],
          [1700000060, '2'],
        ],
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].values).toBe('2')
    expect(rows[0].labels).toEqual([{ key: 'job', value: 'api' }])
  })
})
