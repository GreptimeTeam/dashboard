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

/** Group key as emitted by the breakdown SQL: NULL and empty both fold into the none group. */
const noneGroup = (expr: string) => `COALESCE(NULLIF(CAST(${expr} AS STRING), ''), 'none')`

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
      groupByColumns: ['service_name'],
      statusColumn: 'span_status_code',
      durationColumn: 'duration_nano',
      metric: 'rate',
      intervalSeconds: 60,
      values: [['frontend'], ["o'brien"]],
    })
    expect(sql).toContain('date_bin(\'60 seconds\', "timestamp")')
    expect(sql).toContain(`${noneGroup('"service_name"')} IN ('frontend', 'o''brien')`)
    expect(sql).toContain('COUNT(*) * 1.0 / 60')
    expect(sql).toContain(`GROUP BY time_bucket, ${noneGroup('"service_name"')}`)
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

  it('groups JSON2 attribute dimensions by expression instead of identifier', () => {
    const valuesSql = buildBreakdownValuesSql({
      tableName: 'opentelemetry_traces_v2',
      where: '"parent_span_id" IS NULL',
      groupByColumns: ['span_attributes.http.request.method'],
      groupByColumnSql: [`json_get_string("span_attributes", '$."http.request.method"')`],
      statusColumn: 'span_status_code',
      durationColumn: 'duration_nano',
      metric: 'rate',
      limit: 10,
    })
    const methodExpr = `json_get_string("span_attributes", '$."http.request.method"')`
    expect(valuesSql).toContain(`${noneGroup(methodExpr)} AS attr_value`)
    expect(valuesSql).toContain(`GROUP BY ${noneGroup(methodExpr)}`)
    expect(valuesSql).not.toContain('"span_attributes.http.request.method"')

    const seriesSql = buildBreakdownSeriesSql({
      tableName: 'opentelemetry_traces_v2',
      where: '"parent_span_id" IS NULL',
      timeColumn: 'timestamp',
      groupByColumns: ['resource_attributes.service.version'],
      groupByColumnSql: [`json_get_string("resource_attributes", '$."service.version"')`],
      statusColumn: 'span_status_code',
      durationColumn: 'duration_nano',
      metric: 'errors',
      intervalSeconds: 60,
      values: [['1.4.2']],
    })
    expect(seriesSql).toContain(
      `${noneGroup(`json_get_string("resource_attributes", '$."service.version"')`)} IN ('1.4.2')`
    )
  })

  it('keeps spans missing a dimension in the none group', () => {
    const sql = buildBreakdownValuesSql({
      tableName: 'opentelemetry_traces',
      where: '"parent_span_id" IS NULL',
      groupByColumns: ['resource_attributes.browser.language'],
      statusColumn: 'span_status_code',
      durationColumn: 'duration_nano',
      metric: 'rate',
      limit: 10,
    })
    expect(sql).toContain(`${noneGroup('"resource_attributes.browser.language"')} AS attr_value`)
    expect(sql).not.toContain('IS NOT NULL')
  })

  it('casts the group value to a string so numeric columns can be compared with the literals', () => {
    const sql = buildBreakdownValuesSql({
      tableName: 'opentelemetry_traces',
      where: '"parent_span_id" IS NULL',
      groupByColumns: ['span_attributes.http.response.status_code'],
      statusColumn: 'span_status_code',
      durationColumn: 'duration_nano',
      metric: 'rate',
      limit: 10,
    })
    expect(sql).toContain(`CAST("span_attributes.http.response.status_code" AS STRING)`)
    // The raw column must never meet a string literal directly.
    expect(sql).not.toContain(`NULLIF("span_attributes.http.response.status_code", '')`)
  })

  it('builds breakdown values ranked by RED', () => {
    const sql = buildBreakdownValuesSql({
      tableName: 'opentelemetry_traces',
      where: '"parent_span_id" IS NULL',
      groupByColumns: ['service_name'],
      statusColumn: 'span_status_code',
      durationColumn: 'duration_nano',
      metric: 'errors',
      limit: 10,
    })
    expect(sql).toContain(`GROUP BY ${noneGroup('"service_name"')}`)
    expect(sql).not.toContain('IS NOT NULL')
    expect(sql).toContain('STATUS_CODE_ERROR')
    expect(sql).toContain('ORDER BY metric_value DESC')
    expect(sql).toContain('LIMIT 10')
  })

  it('groups by several columns and matches each value tuple', () => {
    const methodExpr = `json_get_string("span_attributes", '$."http.request.method"')`
    const valuesSql = buildBreakdownValuesSql({
      tableName: 'opentelemetry_traces',
      where: '"parent_span_id" IS NULL',
      groupByColumns: ['service_name', 'span_attributes.http.request.method'],
      groupByColumnSql: [undefined, methodExpr],
      statusColumn: 'span_status_code',
      durationColumn: 'duration_nano',
      metric: 'rate',
      limit: 10,
    })
    expect(valuesSql).toContain(`${noneGroup('"service_name"')} AS attr_0`)
    expect(valuesSql).toContain(`${noneGroup(methodExpr)} AS attr_1`)
    expect(valuesSql).not.toContain('IS NOT NULL')
    expect(valuesSql).toContain(`GROUP BY ${noneGroup('"service_name"')}, ${noneGroup(methodExpr)}`)

    const seriesSql = buildBreakdownSeriesSql({
      tableName: 'opentelemetry_traces',
      where: '"parent_span_id" IS NULL',
      timeColumn: 'timestamp',
      groupByColumns: ['service_name', 'span_name'],
      statusColumn: 'span_status_code',
      durationColumn: 'duration_nano',
      metric: 'rate',
      intervalSeconds: 60,
      values: [
        ['frontend', 'GET'],
        ['frontend', "o'brien"],
      ],
    })
    const serviceExpr = noneGroup('"service_name"')
    const spanExpr = noneGroup('"span_name"')
    expect(seriesSql).toContain(`${serviceExpr} = 'frontend' AND ${spanExpr} = 'GET'`)
    expect(seriesSql).toContain(`${serviceExpr} = 'frontend' AND ${spanExpr} = 'o''brien'`)
    expect(seriesSql).toContain(`GROUP BY time_bucket, ${serviceExpr}, ${spanExpr}`)
    expect(seriesSql).not.toContain(' IN (')
  })
})
