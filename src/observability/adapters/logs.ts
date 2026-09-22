import editorApi from '@/api/editor'
import type { ColumnType, TSColumn } from '@/types/query'
import { TsTypeMapping } from '@/utils/date-time'
import useTableSchemaStore from '@/store/modules/table-schema'
import type { DrilldownContext } from '../context'
import { loadDrilldownSettings } from '../drilldown-settings'
import { filtersToSqlWhere } from '../filters'
import {
  discoverFieldColumns,
  discoverLabelColumns,
  discoverLogLabelKeys,
  discoverLogsContainsColumns,
  isLogsRoleValue,
  listJsonAttributeColumns,
  resolveLogsTimeColumn,
  sampleJsonAttributeFieldKeys,
  type SchemaColumn,
} from '../logs/field-map'
import { isOtelResourceLabelChip } from '../semantics'
import { normalizeLogLevelName, UNKNOWN_LOG_LEVEL } from '../logs/level-color'
import { buildSeverityLevelsPredicate } from '../logs/level-visibility'
import { escapeSqlString, logsColumnExpr, quoteIdent } from '../logs/query-state'
import { pivotLogVolumeByName, pivotLogVolumeRows, type LogVolumeSeries } from '../logs/volume-series'
import { grafanaAutoIntervalSeconds } from '../logs/volume-step'
import resolveLogsRoles from '../logs/resolved-roles'

const LABEL_VALUES_LIMIT = 20
const LOGS_ROWS_LIMIT = 100
/** Grafana service-selection preview (`maxLines: 100`). Not a page size. */
export const OVERVIEW_PREVIEW_LIMIT = 100

/** Overview cards show a short field set, not every schema column. */
export function overviewPreviewColumns(fieldMap: Record<string, string>): string[] {
  return [
    ...new Set(
      [fieldMap.time, fieldMap.severity, fieldMap.body, fieldMap.traceId, fieldMap.trace_id].filter(
        (name): name is string => Boolean(name)
      )
    ),
  ]
}

function selectLogColumns(schemaNames: string[], requested: string[] | undefined, timeCol?: string): string[] {
  const available = new Set(schemaNames)
  if (!requested?.length) {
    return schemaNames.filter(Boolean)
  }
  const picked = [...new Set(requested.filter((name) => available.has(name)))]
  if (timeCol && available.has(timeCol) && !picked.includes(timeCol)) {
    picked.unshift(timeCol)
  }
  return picked.length ? picked : schemaNames.filter(Boolean)
}

function volumeRangeMs(ctx: DrilldownContext): number {
  const unixRange = ctx.unixTimeRange()
  if (unixRange.length === 2) {
    const start = Number(unixRange[0])
    const end = Number(unixRange[1])
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return (end - start) * 1000
    }
  }
  if (ctx.time.value > 0) {
    return ctx.time.value * 60 * 1000
  }
  return 30 * 60 * 1000
}

function bucketToUnixSeconds(raw: unknown): number | null {
  if (raw == null) {
    return null
  }
  if (typeof raw === 'string' && raw.includes('T')) {
    const ms = Date.parse(raw)
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
  }
  const num = Number(raw)
  if (!Number.isFinite(num)) {
    return null
  }
  // Heuristic: ns / us / ms / s
  if (num > 1e16) {
    return Math.floor(num / 1e9)
  }
  if (num > 1e13) {
    return Math.floor(num / 1e6)
  }
  if (num > 1e11) {
    return Math.floor(num / 1e3)
  }
  return Math.floor(num)
}

async function loadSchema(tableName: string): Promise<SchemaColumn[]> {
  try {
    return await useTableSchemaStore().ensureTableSchema(tableName)
  } catch {
    return []
  }
}

function schemaHasColumn(columns: SchemaColumn[], columnName: string): boolean {
  if (!columnName) {
    return false
  }
  return columns.some((column) => column.name === columnName)
}

function resolveLogsTimeColumnFallback(fieldMap: Record<string, string>, columns?: SchemaColumn[]): string | undefined {
  const fromMap = resolveLogsTimeColumn(fieldMap)
  if (fromMap) {
    return fromMap
  }
  return columns?.find((column) => column.semantic_type === 'TIMESTAMP')?.name
}

/**
 * Time + Context filters WHERE for Logs Drilldown.
 * On overview (`logsView=overview`), label filters are skipped so candidate panels stay visible (compose mode).
 * Detail applies full filters. Pass `includeLabelFilters` to override.
 */
function appendExtraWhere(where: string, extra?: string): string {
  const clause = extra?.trim()
  if (!clause) {
    return where
  }
  return where ? `${where} AND (${clause})` : clause
}

export async function buildLogsContextWhere(
  ctx: DrilldownContext,
  options?: {
    extraEquals?: Array<{ column: string; value: string }>
    /** Default: true on detail, false on overview. */
    includeLabelFilters?: boolean
    /** Skip this chip key when applying filters (e.g. severity picker). */
    excludeFilterKey?: string
    /** Preloaded schema — skips an extra loadSchema inside this helper. */
    columns?: SchemaColumn[]
    /**
     * Absolute unix-seconds window. When set, preferred over live
     * `ctx.unixTimeRange()` so scroll loadMore does not drift.
     */
    unixRange?: readonly [number, number] | number[] | null
  }
): Promise<string> {
  const tableName = ctx.logsTable.value
  if (!tableName) {
    return ''
  }

  const fieldMap = ctx.fieldMap.value.logs
  const whereParts: string[] = []
  const liveRange = ctx.unixTimeRange()
  const unixRange =
    options?.unixRange != null && options.unixRange.length === 2
      ? [Number(options.unixRange[0]), Number(options.unixRange[1])]
      : liveRange
  const tracesLogsDrawer = ctx.signal.value === 'traces' && Boolean(ctx.logsTraceId.value?.trim())
  const includeLabelFilters = options?.includeLabelFilters ?? (ctx.logsView.value === 'detail' || tracesLogsDrawer)
  const needsColumns =
    includeLabelFilters ||
    (unixRange.length === 2 && !resolveLogsTimeColumn(fieldMap)) ||
    // Panel/row predicates may name a JSON chip label — the schema resolves its container.
    Boolean(options?.extraEquals?.length)
  const columns = needsColumns ? options?.columns ?? (await loadSchema(tableName)) : options?.columns

  if (unixRange.length === 2) {
    const timeColumn = resolveLogsTimeColumnFallback(fieldMap, columns)
    if (timeColumn) {
      whereParts.push(`${quoteIdent(timeColumn)} >= FROM_UNIXTIME(${unixRange[0]})`)
      whereParts.push(`${quoteIdent(timeColumn)} <= FROM_UNIXTIME(${unixRange[1]})`)
    }
  }

  if (includeLabelFilters && columns) {
    const settings = loadDrilldownSettings().logs
    whereParts.push(
      ...filtersToSqlWhere(ctx.filters.value, fieldMap, {
        excludeKey: options?.excludeFilterKey,
        columns: columns.map((column) => column.name),
        jsonColumns: listJsonAttributeColumns(columns),
        // Attribute columns are typed (int / boolean / …): comparisons need typed literals.
        typeOf: (column) => ctx.signalColumnTypes.value.logs?.[column],
        containsColumns: discoverLogsContainsColumns(columns, fieldMap, {
          include: settings.labelInclude,
          exclude: settings.labelExclude,
        }),
      })
    )
  }

  const columnNames = columns?.map((column) => column.name) ?? []
  options?.extraEquals?.forEach(({ column, value }) => {
    whereParts.push(`${logsColumnExpr(column, columnNames)} = '${escapeSqlString(value)}'`)
  })

  const logsTraceId = ctx.logsTraceId.value?.trim()
  // Same role source the traces page uses to show the affordance: settings fill roles the
  // runtime map has not resolved, so the jump filters as soon as it is offered.
  const traceRoles = resolveLogsRoles(ctx)
  const logsTraceColumn = traceRoles.traceId || traceRoles.trace_id
  if (ctx.signal.value === 'traces' && logsTraceId && logsTraceColumn) {
    whereParts.push(`${quoteIdent(logsTraceColumn)} = '${escapeSqlString(logsTraceId)}'`)
  }

  return whereParts.join(' AND ')
}

/** Logs WHERE — requires at least one mapped label filter (not time alone). */
export async function buildLogsWhere(ctx: DrilldownContext): Promise<string> {
  const tableName = ctx.logsTable.value
  if (!tableName) {
    return ''
  }

  const columns = await loadSchema(tableName)
  const fieldMap = ctx.fieldMap.value.logs
  const settings = loadDrilldownSettings().logs
  const whereParts = filtersToSqlWhere(ctx.filters.value, fieldMap, {
    columns: columns.map((column) => column.name),
    jsonColumns: listJsonAttributeColumns(columns),
    typeOf: (column) => ctx.signalColumnTypes.value.logs?.[column],
    containsColumns: discoverLogsContainsColumns(columns, fieldMap, {
      include: settings.labelInclude,
      exclude: settings.labelExclude,
    }),
  })
  if (!whereParts.length) {
    return ''
  }

  const unixRange = ctx.unixTimeRange()
  if (unixRange.length === 2) {
    const timeColumn = await resolveLogsTimeColumnFallback(tableName, ctx.fieldMap.value.logs)
    if (timeColumn) {
      whereParts.push(`${quoteIdent(timeColumn)} >= FROM_UNIXTIME(${unixRange[0]})`)
      whereParts.push(`${quoteIdent(timeColumn)} <= FROM_UNIXTIME(${unixRange[1]})`)
    }
  }

  return whereParts.join(' AND ')
}

export type ServiceVolumeRow = {
  key: string
  count: number
}

/** GROUP BY primaryGroupBy — used when a real group column exists (no fake All-logs card). */
export async function fetchServiceVolumes(ctx: DrilldownContext, limit = 200): Promise<ServiceVolumeRow[]> {
  const tableName = ctx.logsTable.value
  const groupCol = (ctx.fieldMap.value.logs.primaryGroupBy ?? '').trim()
  if (!tableName || !groupCol) {
    return []
  }

  const columns = await loadSchema(tableName)
  const columnNames = columns.map((column) => column.name)
  if (!isLogsRoleValue(groupCol, new Set(columnNames))) {
    return []
  }
  const groupExpr = logsColumnExpr(groupCol, columnNames)

  const where = await buildLogsContextWhere(ctx, { columns })
  if (!where) {
    return []
  }

  try {
    const sql = `SELECT ${groupExpr} AS group_key, COUNT(*) AS cnt
FROM ${quoteIdent(tableName)}
WHERE ${where}
GROUP BY group_key
ORDER BY cnt DESC
LIMIT ${limit}`
    const response = await editorApi.runSQL(sql)
    const rows = response?.output?.[0]?.records?.rows
    if (!Array.isArray(rows)) {
      return []
    }
    return rows.map((row) => ({
      key: row[0] == null || row[0] === '' ? 'unknown' : String(row[0]),
      count: Number(row[1]) || 0,
    }))
  } catch (error) {
    console.error('Failed to fetch service volumes:', error)
    return []
  }
}

export async function listLabelKeys(ctx: DrilldownContext): Promise<string[]> {
  const tableName = ctx.logsTable.value
  if (!tableName) {
    return []
  }
  const columns = await loadSchema(tableName)
  const settings = loadDrilldownSettings().logs
  return discoverLogLabelKeys(tableName, columns, ctx.fieldMap.value.logs, {
    include: settings.labelInclude,
    exclude: settings.labelExclude,
    // The semantic service identity is a label even when JSON sampling misses it.
    identityChip: ctx.entityFilterKeys.value.logs?.service,
  })
}

/** Non-groupable remainder plus JSON attribute keys. Not a user-facing Fields picker. */
export async function listFieldKeys(ctx: DrilldownContext): Promise<string[]> {
  const tableName = ctx.logsTable.value
  if (!tableName) {
    return []
  }
  const columns = await loadSchema(tableName)
  const settings = loadDrilldownSettings().logs
  const l1 = discoverFieldColumns(columns, ctx.fieldMap.value.logs, {
    include: settings.fieldInclude,
    exclude: settings.fieldExclude,
    labelInclude: settings.labelInclude,
    labelExclude: settings.labelExclude,
  })
  const jsonColumns = listJsonAttributeColumns(columns)
  const l2 = (await sampleJsonAttributeFieldKeys(tableName, jsonColumns)).filter(
    (key) => !isOtelResourceLabelChip(key, jsonColumns)
  )
  return [...new Set([...l1, ...l2])].sort((a, b) => a.localeCompare(b))
}

export type LabelValueRow = {
  value: string
  count: number
}

export async function fetchLabelValues(
  ctx: DrilldownContext,
  labelCol: string,
  options?: { limit?: number; excludeFilterKey?: string }
): Promise<LabelValueRow[]> {
  const tableName = ctx.logsTable.value
  const limit = options?.limit ?? LABEL_VALUES_LIMIT
  if (!tableName || !labelCol) {
    return []
  }
  const schema = await loadSchema(tableName)
  const columnNames = schema.map((column) => column.name)
  // Labels may be JSON chips (`resource_attributes.service.name`) — same shape as a role.
  if (!isLogsRoleValue(labelCol, new Set(columnNames))) {
    return []
  }
  const labelExpr = logsColumnExpr(labelCol, columnNames)

  const where = await buildLogsContextWhere(ctx, {
    excludeFilterKey: options?.excludeFilterKey,
    columns: schema,
  })
  if (!where) {
    return []
  }

  try {
    const sql = `SELECT ${labelExpr} AS value, COUNT(*) AS cnt
FROM ${quoteIdent(tableName)}
WHERE ${where} AND ${labelExpr} IS NOT NULL
GROUP BY value
ORDER BY cnt DESC
LIMIT ${limit}`
    const response = await editorApi.runSQL(sql)
    const rows = response?.output?.[0]?.records?.rows
    if (!Array.isArray(rows)) {
      return []
    }
    return rows.map((row) => ({
      value: row[0] == null ? '' : String(row[0]),
      count: Number(row[1]) || 0,
    }))
  } catch (error) {
    console.error('Failed to fetch label values:', error)
    return []
  }
}

/** Distinct severity/level values for the detail-page level filter. */
export async function fetchSeverityLevels(ctx: DrilldownContext): Promise<LabelValueRow[]> {
  const severityCol = ctx.fieldMap.value.logs.severity
  if (!severityCol) {
    return []
  }
  return fetchLabelValues(ctx, severityCol, {
    excludeFilterKey: severityCol,
  })
}

export async function buildLogsWhereForValue(ctx: DrilldownContext, labelCol: string, value: string): Promise<string> {
  return buildLogsContextWhere(ctx, { extraEquals: [{ column: labelCol, value }] })
}

export type LogsRowsResult = {
  columns: ColumnType[]
  data: Array<Record<string, unknown>>
  /** Preferred: full TS column with schema data_type for formatting. */
  tsColumn: TSColumn | null
  /** @deprecated Prefer tsColumn */
  tsColumnName: string | null
  hasMore: boolean
}

function normalizeTsDataType(raw?: string): string | undefined {
  if (!raw) {
    return undefined
  }
  return TsTypeMapping[raw as keyof typeof TsTypeMapping] || raw
}

export async function fetchLogsRows(
  ctx: DrilldownContext,
  options?: {
    labelCol?: string
    value?: string
    limit?: number
    /** Keyset cursor: load rows older than this timestamp (exclusive). */
    beforeTs?: unknown
    /** Offset for unique row keys when appending pages. */
    keyOffset?: number
    /**
     * Panel-local severity selection (overview legend click).
     * Empty means no extra predicate. Detail uses context filters instead.
     */
    levels?: string[]
    /** When set, SELECT only these columns (missing names are dropped). Empty falls back to the full schema. */
    columns?: string[]
    /** Extra AND clause (logs-tab body search). Must not be a shared context filter. */
    extraWhere?: string
    /**
     * Frozen absolute unix-seconds window for this table fetch / loadMore.
     * Prefer over live toolbar range so scroll pages stay inside Search bounds.
     */
    unixRange?: readonly [number, number] | number[] | null
  }
): Promise<LogsRowsResult> {
  const tableName = ctx.logsTable.value
  const empty: LogsRowsResult = { columns: [], data: [], tsColumn: null, tsColumnName: null, hasMore: false }
  if (!tableName) {
    return empty
  }

  const fieldMap = ctx.fieldMap.value.logs
  const schema = await loadSchema(tableName)
  // The panel label may be a JSON chip (`resource_attributes.service.name`), not a column.
  if (options?.labelCol && !isLogsRoleValue(options.labelCol, new Set(schema.map((column) => column.name)))) {
    return empty
  }
  const extraEquals =
    options?.labelCol && options.value !== undefined ? [{ column: options.labelCol, value: options.value }] : undefined
  const where = appendExtraWhere(
    await buildLogsContextWhere(ctx, { extraEquals, columns: schema, unixRange: options?.unixRange }),
    options?.extraWhere
  )
  if (!where) {
    return empty
  }

  const schemaNames = schema.map((column) => column.name).filter(Boolean)
  const timeCol = resolveLogsTimeColumn(fieldMap)
  const safeSelectCols = selectLogColumns(schemaNames, options?.columns, timeCol)
  if (!safeSelectCols.length) {
    return empty
  }
  const limit = options?.limit ?? LOGS_ROWS_LIMIT
  const keyOffset = options?.keyOffset ?? 0

  const whereParts = [where]
  const severityCol = fieldMap.severity
  if (options?.levels?.length && severityCol && schemaHasColumn(schema, severityCol)) {
    const levelPredicate = buildSeverityLevelsPredicate(severityCol, options.levels)
    if (levelPredicate) {
      whereParts.push(levelPredicate)
    }
  }
  if (timeCol && options?.beforeTs !== undefined && options.beforeTs !== null && options.beforeTs !== '') {
    const cursor = options.beforeTs
    const literal =
      typeof cursor === 'number' || /^\d+$/.test(String(cursor))
        ? String(cursor)
        : `'${escapeSqlString(String(cursor))}'`
    whereParts.push(`${quoteIdent(timeCol)} < ${literal}`)
  }

  const order = timeCol ? `ORDER BY ${quoteIdent(timeCol)} DESC` : ''

  try {
    const sql = `SELECT ${safeSelectCols.map(quoteIdent).join(', ')}
FROM ${quoteIdent(tableName)}
WHERE ${whereParts.join(' AND ')}
${order}
LIMIT ${limit}`
    const response = await editorApi.runSQL(sql)
    const records = response?.output?.[0]?.records
    const schemas = records?.schema?.column_schemas ?? []
    const rows = records?.rows ?? []

    const columns: ColumnType[] = schemas.map((columnSchema: { name: string; data_type?: string }) => ({
      name: columnSchema.name,
      data_type: normalizeTsDataType(columnSchema.data_type) || columnSchema.data_type || 'String',
      title: columnSchema.name,
    }))

    const data = (Array.isArray(rows) ? rows : []).map((row: unknown[], index: number) => {
      const record: Record<string, unknown> = { key: keyOffset + index }
      columns.forEach((column, colIndex) => {
        record[column.name] = Array.isArray(row) ? row[colIndex] : null
      })
      return record
    })

    const timeSchema = timeCol ? columns.find((column) => column.name === timeCol) : undefined
    const tsColumn: TSColumn | null = timeCol
      ? { name: timeCol, data_type: timeSchema?.data_type || 'TimestampMillisecond' }
      : null

    return {
      columns,
      data,
      tsColumn,
      tsColumnName: timeCol ?? null,
      hasMore: data.length >= limit,
    }
  } catch (error) {
    console.error('Failed to fetch log rows:', error)
    return empty
  }
}

/**
 * Volume bars for drilldown: stacked `COUNT(*)` per `$__auto` bucket, grouped by severity.
 * Step matches Grafana `count_over_time([$__auto])` (plot width, not a fixed 1m bin).
 */
export async function fetchLogVolumeTimeseries(
  ctx: DrilldownContext,
  options?: { labelCol?: string; value?: string; plotWidthPx?: number; extraWhere?: string }
): Promise<LogVolumeSeries[]> {
  const tableName = ctx.logsTable.value
  const fieldMap = ctx.fieldMap.value.logs
  if (!tableName) {
    return []
  }
  const schema = await loadSchema(tableName)
  const timeColumn = resolveLogsTimeColumnFallback(fieldMap, schema)
  if (!timeColumn) {
    return []
  }
  // Breakdown/labels may be JSON chips (`resource_attributes.service.name`), not just columns.
  if (options?.labelCol && !isLogsRoleValue(options.labelCol, new Set(schema.map((column) => column.name)))) {
    return []
  }

  const severityCol = fieldMap.severity || ''
  const breakdownIsSeverity = Boolean(severityCol && options?.labelCol === severityCol)
  const groupByLevel = Boolean(severityCol) && !breakdownIsSeverity && schemaHasColumn(schema, severityCol)
  const extraEquals =
    options?.labelCol && options.value !== undefined ? [{ column: options.labelCol, value: options.value }] : undefined
  // Keep every level in the legend. Severity selection hides series and filters the sibling table.
  const where = appendExtraWhere(
    await buildLogsContextWhere(ctx, {
      extraEquals,
      excludeFilterKey: severityCol || undefined,
      columns: schema,
    }),
    options?.extraWhere
  )
  if (!where) {
    return []
  }

  const interval = grafanaAutoIntervalSeconds(volumeRangeMs(ctx), options?.plotWidthPx ?? 0)
  const levelSelect = groupByLevel ? `,\n  ${quoteIdent(severityCol)} AS log_level` : ''
  const levelGroup = groupByLevel ? ', log_level' : ''
  const sql = `SELECT
  date_bin('${interval} seconds', ${quoteIdent(timeColumn)}) AS time_bucket${levelSelect},
  COUNT(*) AS event_count
FROM ${quoteIdent(tableName)}
WHERE ${where}
GROUP BY time_bucket${levelGroup}
ORDER BY time_bucket ASC`

  try {
    const response = await editorApi.runSQL(sql)
    const rows = response?.output?.[0]?.records?.rows
    if (!Array.isArray(rows)) {
      return []
    }
    const parsed = rows
      .map((row): { unix: number; level: string | null; count: number } | null => {
        const unix = bucketToUnixSeconds(row?.[0])
        if (unix == null) {
          return null
        }
        let level: string | null = null
        if (groupByLevel) {
          level = row?.[1] == null ? null : String(row[1])
        }
        const countIndex = groupByLevel ? 2 : 1
        return { unix, level, count: Number(row?.[countIndex]) || 0 }
      })
      .filter((row): row is { unix: number; level: string | null; count: number } => row != null)
    const singleSeriesName = breakdownIsSeverity ? normalizeLogLevelName(options?.value) : UNKNOWN_LOG_LEVEL
    return pivotLogVolumeRows(parsed, { groupByLevel, singleSeriesName })
  } catch (error) {
    console.error('Failed to fetch log volume timeseries:', error)
    return []
  }
}

/**
 * Volume for one Add label column: `COUNT(*)` per `$__auto` bucket, stacked by that column's top values.
 * Does not split by severity. Top values come from `fetchLabelValues` (count in the current where, limit 20).
 */
export async function fetchLogVolumeByColumn(
  ctx: DrilldownContext,
  options: { column: string; plotWidthPx?: number }
): Promise<LogVolumeSeries[]> {
  const column = options.column.trim()
  const tableName = ctx.logsTable.value
  const fieldMap = ctx.fieldMap.value.logs
  if (!tableName || !column) {
    return []
  }
  const schema = await loadSchema(tableName)
  const timeColumn = resolveLogsTimeColumnFallback(fieldMap, schema)
  const columnNames = schema.map((item) => item.name)
  if (!timeColumn || !isLogsRoleValue(column, new Set(columnNames))) {
    return []
  }

  const values = await fetchLabelValues(ctx, column)
  if (!values.length) {
    return []
  }

  const where = await buildLogsContextWhere(ctx, { columns: schema })
  if (!where) {
    return []
  }

  const inList = values.map((row) => `'${escapeSqlString(row.value)}'`).join(', ')
  const interval = grafanaAutoIntervalSeconds(volumeRangeMs(ctx), options.plotWidthPx ?? 0)
  const quoted = logsColumnExpr(column, columnNames)
  const sql = `SELECT
  date_bin('${interval} seconds', ${quoteIdent(timeColumn)}) AS time_bucket,
  ${quoted} AS series,
  COUNT(*) AS event_count
FROM ${quoteIdent(tableName)}
WHERE ${where} AND ${quoted} IS NOT NULL AND ${quoted} IN (${inList})
GROUP BY time_bucket, series
ORDER BY time_bucket ASC`

  try {
    const response = await editorApi.runSQL(sql)
    const rows = response?.output?.[0]?.records?.rows
    if (!Array.isArray(rows)) {
      return []
    }
    const parsed = rows
      .map((row): { unix: number; name: string; count: number } | null => {
        const unix = bucketToUnixSeconds(row?.[0])
        if (unix == null) {
          return null
        }
        return {
          unix,
          name: row?.[1] == null ? '' : String(row[1]),
          count: Number(row?.[2]) || 0,
        }
      })
      .filter((row): row is { unix: number; name: string; count: number } => row != null)
    return pivotLogVolumeByName(parsed)
  } catch (error) {
    console.error('Failed to fetch column log volume:', error)
    return []
  }
}

export { discoverLabelColumns }
