import { describe, expect, it } from 'vitest'
import {
  aggregateDurationHeatmapRows,
  bucketToUnixSeconds,
  breakdownSeriesIntervalSeconds,
  buildBreakdownSeriesSql,
  buildBreakdownValuesSql,
  sharedBreakdownYAxis,
  buildDurationHeatmapSql,
  buildRedTimeseriesSql,
  buildRootListOrderAndExtraWhere,
  redMetricBarColor,
  redMetricChartKind,
  redMetricPanelUnit,
  volumeIntervalSecondsFromRange,
} from './red-queries'

describe('traces red-queries', () => {
  it('builds rate metric as count per second', () => {
    const expr = buildRedTimeseriesSql({
      tableName: 'opentelemetry_traces',
      where: '"parent_span_id" IS NULL',
      timeColumn: 'timestamp',
      statusColumn: 'span_status_code',
      durationColumn: 'duration_nano',
      metric: 'rate',
      intervalSeconds: 60,
    })
    expect(expr).toContain("date_bin('60 seconds'")
    expect(expr).toContain('COUNT(*) * 1.0 / 60')
  })

  it('builds errors metric as error rate', () => {
    const expr = buildRedTimeseriesSql({
      tableName: 'opentelemetry_traces',
      where: '1=1',
      timeColumn: 'timestamp',
      statusColumn: 'span_status_code',
      durationColumn: 'duration_nano',
      metric: 'errors',
      intervalSeconds: 60,
    })
    expect(expr).toContain('STATUS_CODE_ERROR')
    expect(expr).toContain('SUM(CASE WHEN')
    expect(expr).toContain('* 1.0 / 60')
  })

  it('builds duration metric as avg seconds', () => {
    const expr = buildRedTimeseriesSql({
      tableName: 'opentelemetry_traces',
      where: '1=1',
      timeColumn: 'timestamp',
      statusColumn: 'span_status_code',
      durationColumn: 'duration_nano',
      metric: 'duration',
      intervalSeconds: 60,
    })
    expect(expr).toContain('AVG("duration_nano") / 1000000000.0')
  })

  it('maps RED metrics to Grafana panel units', () => {
    expect(redMetricPanelUnit('rate')).toBe('ucum:spans/s')
    expect(redMetricPanelUnit('errors')).toBe('ucum:errors/s')
    expect(redMetricPanelUnit('duration')).toBe('s')
  })

  it('uses Grafana chart kinds for RED panels', () => {
    expect(redMetricChartKind('rate')).toBe('bar')
    expect(redMetricChartKind('errors')).toBe('bar')
    expect(redMetricChartKind('duration')).toBe('heatmap')
    expect(redMetricBarColor('errors', false)).toBe('#E02F44')
    expect(redMetricBarColor('rate', false)).toBe('#bdc4cd')
  })

  it('builds duration heatmap SQL with le CASE', () => {
    const sql = buildDurationHeatmapSql({
      tableName: 'opentelemetry_traces',
      where: '"parent_span_id" IS NULL',
      timeColumn: 'timestamp',
      durationColumn: 'duration_nano',
      intervalSeconds: 60,
    })
    expect(sql).toContain("date_bin('60 seconds'")
    expect(sql).toContain('CASE')
    expect(sql).toContain("THEN '0.001'")
    expect(sql).toContain("ELSE '+Inf'")
    expect(sql).toContain('GROUP BY time_bucket, le')
  })

  it('aggregates duration heatmap rows into dense grid', () => {
    const heatmap = aggregateDurationHeatmapRows([
      { timeUnix: 100, le: '0.01', count: 3 },
      { timeUnix: 100, le: '1', count: 1 },
      { timeUnix: 160, le: '0.01', count: 5 },
    ])
    expect(heatmap.times).toEqual([100, 160])
    expect(heatmap.buckets[0]).toBe('0.001')
    expect(heatmap.cells).toContainEqual([0, 2, 3])
    expect(heatmap.cells).toContainEqual([1, 2, 5])
    expect(heatmap.maxValue).toBe(5)
  })

  it('orders slow list by duration and filters errors', () => {
    const slow = buildRootListOrderAndExtraWhere('duration', {
      time: 'timestamp',
      status: 'span_status_code',
      duration: 'duration_nano',
    })
    expect(slow.orderBy).toBe('"duration_nano" DESC')
    expect(slow.extraWhere).toHaveLength(0)

    const errors = buildRootListOrderAndExtraWhere('errors', {
      time: 'timestamp',
      status: 'span_status_code',
      duration: 'duration_nano',
    })
    expect(errors.extraWhere[0]).toContain('STATUS_CODE_ERROR')
    expect(errors.orderBy).toBe('"timestamp" DESC')
  })

  it('parses bucket timestamps', () => {
    expect(bucketToUnixSeconds('2024-01-01T00:00:00Z')).toBe(1704067200)
    expect(bucketToUnixSeconds(1704067200)).toBe(1704067200)
    expect(bucketToUnixSeconds(1704067200000)).toBe(1704067200)
  })

  it('picks volume interval from relative minutes', () => {
    expect(volumeIntervalSecondsFromRange(30, [])).toBe(60)
    expect(volumeIntervalSecondsFromRange(120, [])).toBe(300)
    expect(volumeIntervalSecondsFromRange(2000, [])).toBe(3600)
  })

  it('builds one grouped breakdown series for the listed values', () => {
    const sql = buildBreakdownSeriesSql({
      tableName: 'opentelemetry_traces',
      where: '"parent_span_id" IS NULL',
      timeColumn: 'timestamp',
      groupByColumn: 'service_name',
      statusColumn: 'span_status_code',
      durationColumn: 'duration_nano',
      metric: 'rate',
      intervalSeconds: 60,
      values: ['frontend', "o'brien"],
    })
    expect(sql).toContain('date_bin(\'60 seconds\', "timestamp")')
    expect(sql).toContain("\"service_name\" IN ('frontend', 'o''brien')")
    expect(sql).toContain('COUNT(*) * 1.0 / 60')
    expect(sql).toContain('GROUP BY time_bucket, "service_name"')
    expect(sql).not.toContain('LIMIT')
  })

  it('shares a non-negative Y axis from plotted peaks', () => {
    expect(
      sharedBreakdownYAxis([
        [
          [1, 2],
          [2, 4],
        ],
        [[1, 9]],
      ])
    ).toEqual({ yMin: 0, yMax: 9 })
    expect(sharedBreakdownYAxis([[[1, 0]]])).toEqual({ yMin: 0, yMax: 1 })
  })

  it('sizes breakdown buckets from the window, not a fixed 60s step', () => {
    expect(breakdownSeriesIntervalSeconds([0, 60])).toBeGreaterThanOrEqual(1)
    expect(breakdownSeriesIntervalSeconds([0, 24 * 3600])).toBeGreaterThan(60)
  })

  it('builds breakdown values ranked by RED', () => {
    const sql = buildBreakdownValuesSql({
      tableName: 'opentelemetry_traces',
      where: '"parent_span_id" IS NULL',
      groupByColumn: 'service_name',
      statusColumn: 'span_status_code',
      durationColumn: 'duration_nano',
      metric: 'errors',
      limit: 10,
    })
    expect(sql).toContain('GROUP BY "service_name"')
    expect(sql).toContain('STATUS_CODE_ERROR')
    expect(sql).toContain('ORDER BY metric_value DESC')
    expect(sql).toContain('LIMIT 10')
  })
})
