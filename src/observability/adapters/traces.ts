import editorApi from '@/api/editor'
import { processSpanData, type Span } from '@/views/dashboard/traces/utils'
import type { ColumnType } from '@/types/query'
import type { DrilldownContext } from '../context'
import { filtersToSqlWhere } from '../filters'
import { boundSignalDatabase } from '../signal-database'
import { escapeSqlString, quoteIdent } from '../logs/query-state'
import { buildDefaultTracesFieldMap } from '../traces/field-map'
import {
  bucketToUnixSeconds,
  breakdownSeriesIntervalSeconds,
  buildBreakdownSeriesSql,
  buildBreakdownValuesSql,
  buildDurationHeatmapSql,
  buildRedTimeseriesSql,
  buildRootListOrderAndExtraWhere,
  aggregateDurationHeatmapRows,
  sharedBreakdownYAxis,
  volumeIntervalSecondsFromRange,
  type RedMetric,
} from '../traces/red-queries'
import type { HistogramHeatmapData } from '../metrics/prom-chart'

export type { RedMetric }

const ROOT_SPAN_LIMIT = 100

function fieldMap(ctx: DrilldownContext): Record<string, string> {
  const mapped = ctx.semantics.traces.fieldMap.value
  return Object.keys(mapped).length ? mapped : buildDefaultTracesFieldMap()
}

function timeColumn(ctx: DrilldownContext): string {
  return fieldMap(ctx).time || fieldMap(ctx).timestamp || 'timestamp'
}

function parentColumn(ctx: DrilldownContext): string {
  return fieldMap(ctx).parentSpanId || 'parent_span_id'
}

function traceIdColumn(ctx: DrilldownContext): string {
  return fieldMap(ctx).traceId || 'trace_id'
}

function durationColumn(ctx: DrilldownContext): string {
  return fieldMap(ctx).duration || fieldMap(ctx).duration_nano || 'duration_nano'
}

function statusColumn(ctx: DrilldownContext): string {
  return fieldMap(ctx).status || fieldMap(ctx).span_status_code || 'span_status_code'
}

/** Shared WHERE: time range + label chips + root-span population. */
export function buildTracesContextWhere(
  ctx: DrilldownContext,
  options?: {
    rootOnly?: boolean
    extraEquals?: Array<{ column: string; value: string }>
    extraWhere?: string[]
  }
): string {
  const tableName = ctx.semantics.traces.table.value
  if (!tableName) {
    return ''
  }

  const map = fieldMap(ctx)
  const whereParts: string[] = []
  const unixRange = ctx.query.unixTimeRange()
  const tsCol = timeColumn(ctx)

  if (unixRange.length === 2) {
    whereParts.push(`${quoteIdent(tsCol)} >= FROM_UNIXTIME(${unixRange[0]})`)
    whereParts.push(`${quoteIdent(tsCol)} <= FROM_UNIXTIME(${unixRange[1]})`)
  }

  if (options?.rootOnly !== false) {
    whereParts.push(`${quoteIdent(parentColumn(ctx))} IS NULL`)
  }

  whereParts.push(
    ...filtersToSqlWhere(ctx.query.filters.value, map, {
      columns: ctx.semantics.traces.columns.value,
      // Trace tables flatten attributes into physical dotted columns. Before the schema
      // bind completes, JSON-chip guessing would misread `resource_attributes.service.name`
      // as a `json_get_string("resource_attributes", …)` path — SQL the server rejects.
      // Skip the chip read; the bind triggers a refresh with the real column list.
      jsonChipWithoutColumns: false,
      // Attribute columns are typed (bigint / boolean / …): literals must render accordingly,
      // e.g. `"x" > 1000000000` and `"flag" = TRUE` instead of quoted strings.
      typeOf: (column) => ctx.semantics.traces.columnTypes.value?.[column],
    })
  )

  options?.extraEquals?.forEach(({ column, value }) => {
    whereParts.push(`${quoteIdent(column)} = '${escapeSqlString(value)}'`)
  })

  options?.extraWhere?.forEach((clause) => {
    if (clause.trim()) {
      whereParts.push(clause)
    }
  })

  return whereParts.join(' AND ')
}

export interface RootSpanRow {
  trace_id: string
  service_name?: string
  span_name?: string
  timestamp?: number | string
  duration_nano?: number
  span_status_code?: string
  [key: string]: unknown
}

/**
 * Canonical alias → physical column. Rows and table columns keep the canonical keys,
 * so readers do not care which column the table actually stores the role in.
 */
function rootSpanSelectColumns(ctx: DrilldownContext): Array<{ alias: string; column: string }> {
  const map = fieldMap(ctx)
  return [
    { alias: 'timestamp', column: timeColumn(ctx) },
    { alias: 'trace_id', column: map.traceId || map.trace_id || 'trace_id' },
    { alias: 'service_name', column: map.service || map.service_name || 'service_name' },
    { alias: 'span_name', column: map.spanName || map.span_name || 'span_name' },
    { alias: 'duration_nano', column: durationColumn(ctx) },
    { alias: 'span_status_code', column: statusColumn(ctx) },
    { alias: 'span_kind', column: map.kind || map.span_kind || 'span_kind' },
  ]
}

function recordsToObjects(records: {
  schema?: { column_schemas?: Array<{ name: string }> }
  rows?: unknown[][]
}): RootSpanRow[] {
  const schemas = records?.schema?.column_schemas ?? []
  const rows = records?.rows
  if (!Array.isArray(rows) || !schemas.length) {
    return []
  }
  return rows.map((row) => {
    const obj: RootSpanRow = { trace_id: '' }
    schemas.forEach((col, index) => {
      obj[col.name] = row[index]
    })
    return obj
  })
}

export interface RootSpanListResult {
  rows: RootSpanRow[]
  columns: ColumnType[]
}

function columnsFromRecords(records: {
  schema?: { column_schemas?: Array<{ name: string; data_type?: string }> }
}): ColumnType[] {
  const schemas = records?.schema?.column_schemas ?? []
  return schemas.map((col) => ({
    name: col.name,
    data_type: col.data_type || 'String',
    title: col.name,
  }))
}

/** Root spans for traces home list (TraceTable-compatible columns + rows). */
export async function fetchRootSpanList(
  ctx: DrilldownContext,
  options?: { limit?: number; redMetric?: RedMetric }
): Promise<RootSpanListResult> {
  const empty: RootSpanListResult = { rows: [], columns: [] }
  const tableName = ctx.semantics.traces.table.value
  if (!tableName) {
    return empty
  }

  const baseWhere = buildTracesContextWhere(ctx, { rootOnly: true })
  if (!baseWhere) {
    return empty
  }

  const redMetric = options?.redMetric ?? 'rate'
  const { extraWhere, orderBy } = buildRootListOrderAndExtraWhere(redMetric, {
    time: timeColumn(ctx),
    status: statusColumn(ctx),
    duration: durationColumn(ctx),
  })
  const where = [baseWhere, ...extraWhere].join(' AND ')

  const limit = options?.limit ?? ROOT_SPAN_LIMIT
  // Whole row: the list's Columns picker must be able to show every column of the table,
  // not only the roles this view maps. Role aliases are added on top when the field map
  // points a role at a different column, so the canonical keys stay readable.
  const roleAliases = rootSpanSelectColumns(ctx).filter(({ alias, column }) => alias !== column)
  const selectCols = [
    '*',
    ...roleAliases.map(({ alias, column }) => `${quoteIdent(column)} AS ${quoteIdent(alias)}`),
  ].join(', ')
  const sql = `SELECT ${selectCols}
FROM ${quoteIdent(tableName)}
WHERE ${where}
ORDER BY ${orderBy}
LIMIT ${limit}`

  try {
    const response = await editorApi.runSQL(sql, boundSignalDatabase(ctx, 'traces'))
    const records = response?.output?.[0]?.records
    return {
      rows: recordsToObjects(records),
      columns: columnsFromRecords(records),
    }
  } catch (error) {
    console.error('Failed to fetch root span list:', error)
    return empty
  }
}

/** RED timeseries `[unixSec, value]` for Rate / Errors bar panels. */
export async function fetchRedTimeseries(
  ctx: DrilldownContext,
  metric: RedMetric,
  options?: { extraEquals?: Array<{ column: string; value: string }> }
): Promise<Array<[number, number]>> {
  const tableName = ctx.semantics.traces.table.value
  if (!tableName) {
    return []
  }
  const where = buildTracesContextWhere(ctx, { rootOnly: true, extraEquals: options?.extraEquals })
  if (!where) {
    return []
  }
  const intervalSeconds = volumeIntervalSecondsFromRange(ctx.query.time.value, ctx.query.rangeTime.value)
  const sql = buildRedTimeseriesSql({
    tableName,
    where,
    timeColumn: timeColumn(ctx),
    statusColumn: statusColumn(ctx),
    durationColumn: durationColumn(ctx),
    metric,
    intervalSeconds,
  })
  try {
    const response = await editorApi.runSQL(sql, boundSignalDatabase(ctx, 'traces'))
    const rows = response?.output?.[0]?.records?.rows
    if (!Array.isArray(rows)) {
      return []
    }
    return rows
      .map((row): [number, number] | null => {
        const unix = bucketToUnixSeconds(row?.[0])
        if (unix == null) {
          return null
        }
        const value = Number(row?.[1])
        return [unix, Number.isFinite(value) ? value : 0]
      })
      .filter((point): point is [number, number] => point != null)
  } catch (error) {
    console.error(`Failed to fetch RED timeseries (${metric}):`, error)
    return []
  }
}

/** Duration distribution heatmap (time × duration bucket) for Grafana-aligned Duration panel. */
export async function fetchDurationHeatmap(
  ctx: DrilldownContext,
  options?: { extraEquals?: Array<{ column: string; value: string }> }
): Promise<HistogramHeatmapData | null> {
  const tableName = ctx.semantics.traces.table.value
  if (!tableName) {
    return null
  }
  const where = buildTracesContextWhere(ctx, { rootOnly: true, extraEquals: options?.extraEquals })
  if (!where) {
    return null
  }
  const intervalSeconds = volumeIntervalSecondsFromRange(ctx.query.time.value, ctx.query.rangeTime.value)
  const sql = buildDurationHeatmapSql({
    tableName,
    where,
    timeColumn: timeColumn(ctx),
    durationColumn: durationColumn(ctx),
    intervalSeconds,
  })
  try {
    const response = await editorApi.runSQL(sql, boundSignalDatabase(ctx, 'traces'))
    const rows = response?.output?.[0]?.records?.rows
    if (!Array.isArray(rows)) {
      return null
    }
    const parsed = rows
      .map((row) => {
        const timeUnix = bucketToUnixSeconds(row?.[0])
        const le = row?.[1] == null ? '' : String(row[1])
        const count = Number(row?.[2])
        if (timeUnix == null || !le || !Number.isFinite(count)) {
          return null
        }
        return { timeUnix, le, count }
      })
      .filter((item): item is { timeUnix: number; le: string; count: number } => item != null)
    const heatmap = aggregateDurationHeatmapRows(parsed)
    if (!heatmap.cells.length) {
      return null
    }
    return heatmap
  } catch (error) {
    console.error('Failed to fetch duration heatmap:', error)
    return null
  }
}

export interface BreakdownAttrValue {
  value: string
  metricValue: number
}

export interface BreakdownSeriesResult {
  series: Record<string, Array<[number, number]>>
  yAxis: { yMin: number; yMax: number }
}

/** One grouped timeseries for the listed breakdown cards. Cards do not query themselves. */
export async function fetchBreakdownSeries(
  ctx: DrilldownContext,
  metric: RedMetric,
  groupByColumn: string,
  values: string[]
): Promise<BreakdownSeriesResult> {
  const empty: BreakdownSeriesResult = { series: {}, yAxis: { yMin: 0, yMax: 1 } }
  const tableName = ctx.semantics.traces.table.value
  const listed = values.filter(Boolean)
  if (!tableName || !groupByColumn || !listed.length) {
    return empty
  }
  const where = buildTracesContextWhere(ctx, { rootOnly: true })
  const unixRange = ctx.query.unixTimeRange()
  if (!where || unixRange.length !== 2) {
    return empty
  }
  const intervalSeconds = breakdownSeriesIntervalSeconds(unixRange)
  const sql = buildBreakdownSeriesSql({
    tableName,
    where,
    timeColumn: timeColumn(ctx),
    groupByColumn,
    statusColumn: statusColumn(ctx),
    durationColumn: durationColumn(ctx),
    metric,
    intervalSeconds,
    values: listed,
  })
  try {
    const response = await editorApi.runSQL(sql, boundSignalDatabase(ctx, 'traces'))
    const rows = response?.output?.[0]?.records?.rows
    if (!Array.isArray(rows)) {
      return empty
    }
    const series: Record<string, Array<[number, number]>> = {}
    rows.forEach((row) => {
      const unix = bucketToUnixSeconds(row?.[0])
      const attr = row?.[1] == null ? '' : String(row[1])
      const value = Number(row?.[2])
      if (unix == null || !attr || !Number.isFinite(value)) {
        return
      }
      const points = series[attr] ?? []
      points.push([unix, value])
      series[attr] = points
    })
    return { series, yAxis: sharedBreakdownYAxis(Object.values(series)) }
  } catch (error) {
    console.error('Failed to fetch traces breakdown series:', error)
    return empty
  }
}

/** Top attribute values ranked by current RED aggregate (Phase B). */
export async function fetchBreakdownAttrValues(
  ctx: DrilldownContext,
  metric: RedMetric,
  groupByColumn: string,
  options?: { limit?: number }
): Promise<BreakdownAttrValue[]> {
  const tableName = ctx.semantics.traces.table.value
  if (!tableName || !groupByColumn) {
    return []
  }
  const where = buildTracesContextWhere(ctx, { rootOnly: true })
  if (!where) {
    return []
  }
  const sql = buildBreakdownValuesSql({
    tableName,
    where,
    groupByColumn,
    statusColumn: statusColumn(ctx),
    durationColumn: durationColumn(ctx),
    metric,
    limit: options?.limit,
  })
  try {
    const response = await editorApi.runSQL(sql, boundSignalDatabase(ctx, 'traces'))
    const rows = response?.output?.[0]?.records?.rows
    if (!Array.isArray(rows)) {
      return []
    }
    return rows
      .map((row): BreakdownAttrValue | null => {
        const value = row?.[0] == null ? '' : String(row[0])
        if (!value) {
          return null
        }
        const metricValue = Number(row?.[1])
        return { value, metricValue: Number.isFinite(metricValue) ? metricValue : 0 }
      })
      .filter((item): item is BreakdownAttrValue => item != null)
  } catch (error) {
    console.error('Failed to fetch traces breakdown values:', error)
    return []
  }
}

/** All spans for one trace (Gantt). Scoped to the active time window for partition pruning. */
export async function fetchTraceSpans(ctx: DrilldownContext, traceId: string): Promise<Span[]> {
  const tableName = ctx.semantics.traces.table.value
  if (!tableName || !traceId.trim()) {
    return []
  }

  const idCol = traceIdColumn(ctx)
  const tsCol = timeColumn(ctx)
  const unixRange = ctx.query.unixTimeRange()
  const whereParts = [`${quoteIdent(idCol)} = '${escapeSqlString(traceId.trim())}'`]
  if (unixRange.length === 2) {
    whereParts.push(`${quoteIdent(tsCol)} >= FROM_UNIXTIME(${unixRange[0]})`)
    whereParts.push(`${quoteIdent(tsCol)} <= FROM_UNIXTIME(${unixRange[1]})`)
  }
  const sql = `SELECT *
FROM ${quoteIdent(tableName)}
WHERE ${whereParts.join(' AND ')}
ORDER BY ${quoteIdent(tsCol)} ASC`

  try {
    const response = await editorApi.runSQL(sql, boundSignalDatabase(ctx, 'traces'))
    const records = response?.output?.[0]?.records
    if (!records) {
      return []
    }
    return processSpanData(
      records as {
        schema: { column_schemas: Array<{ name: string; data_type: string }> }
        rows: unknown[][]
      }
    )
  } catch (error) {
    console.error('Failed to fetch trace spans:', error)
    return []
  }
}

/**
 * The service universe is cached in `ctx.session.traceLogs.traceServices`, keyed by
 * database, table, column, time window and limit: resolveServiceTargets re-runs on every
 * table load and the settings modal re-runs it on open — without the cache each pass
 * would repeat the DISTINCT scan. Leaving Explore drops the map; a failed fetch evicts its key.
 */
const TRACE_SERVICES_CACHE_LIMIT = 50

/**
 * Every service seen in the current time window — the routing key universe for
 * trace → logs auto-association, wider than one page of root spans. Results are
 * cached for the session per (database, table, window).
 */
export async function fetchTraceServices(ctx: DrilldownContext, options?: { limit?: number }): Promise<string[]> {
  const tableName = ctx.semantics.traces.table.value
  if (!tableName) {
    return []
  }

  const serviceCol = fieldMap(ctx).service || 'service_name'
  const tsCol = timeColumn(ctx)
  const unixRange = ctx.query.unixTimeRange()
  const windowKey = unixRange.length === 2 ? `${unixRange[0]}-${unixRange[1]}` : 'all'
  const limit = options?.limit ?? 200
  const cacheKey = `${boundSignalDatabase(ctx, 'traces')}\0${tableName}\0${serviceCol}\0${windowKey}\0${limit}`
  const traceServicesCache = ctx.session.traceLogs.traceServices
  const cached = traceServicesCache.get(cacheKey)
  if (cached) {
    return cached
  }
  if (traceServicesCache.size > TRACE_SERVICES_CACHE_LIMIT) {
    traceServicesCache.clear()
  }

  const where =
    unixRange.length === 2
      ? `WHERE ${quoteIdent(tsCol)} >= FROM_UNIXTIME(${unixRange[0]}) AND ${quoteIdent(tsCol)} <= FROM_UNIXTIME(${
          unixRange[1]
        })`
      : ''
  const sql = `SELECT DISTINCT ${quoteIdent(serviceCol)}
FROM ${quoteIdent(tableName)}
${where}
ORDER BY 1
LIMIT ${limit}`

  const request = editorApi
    .runSQL(sql, boundSignalDatabase(ctx, 'traces'))
    .then((response) => {
      const rows = response?.output?.[0]?.records?.rows ?? []
      return rows.map((row) => String(row?.[0] ?? '').trim()).filter(Boolean)
    })
    .catch((error) => {
      console.error('Failed to fetch trace services:', error)
      traceServicesCache.delete(cacheKey)
      return []
    })
  traceServicesCache.set(cacheKey, request)
  return request
}
