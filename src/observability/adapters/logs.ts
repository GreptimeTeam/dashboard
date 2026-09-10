import editorApi from '@/api/editor'
import type { ColumnType, TSColumn } from '@/types/query'
import { TsTypeMapping } from '@/utils/date-time'
import type { DrilldownContext } from '../context'
import { loadDrilldownSettings } from '../drilldown-settings'
import { filtersToSqlWhere } from '../filters'
import {
  defaultLogSelectColumns,
  discoverLabelColumns,
  resolveLogsTimeColumn,
  type SchemaColumn,
} from '../logs/field-map'
import { escapeSqlString, quoteIdent } from '../logs/query-state'

const RELATED_LOGS_PREVIEW_LIMIT = 100
const LABEL_VALUES_LIMIT = 20
const LOGS_ROWS_LIMIT = 100

function volumeIntervalSeconds(ctx: DrilldownContext): number {
  if (ctx.time.value > 0) {
    const minutes = ctx.time.value
    if (minutes <= 60) return 60
    if (minutes <= 720) return 300
    if (minutes <= 1440) return 900
    return 3600
  }
  if (ctx.rangeTime.value.length === 2) {
    const start = Number(ctx.rangeTime.value[0])
    const end = Number(ctx.rangeTime.value[1])
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      const diffMinutes = (end - start) / 60
      if (diffMinutes <= 60) return 60
      if (diffMinutes <= 720) return 300
      if (diffMinutes <= 1440) return 900
      return 3600
    }
  }
  return 60
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
    return await editorApi.getTableSchema(tableName)
  } catch {
    return []
  }
}

async function tableHasColumn(tableName: string, columnName: string): Promise<boolean> {
  if (!tableName || !columnName) {
    return false
  }
  const columns = await loadSchema(tableName)
  return columns.some((column) => column.name === columnName)
}

async function resolveLogsTimeColumnFallback(
  tableName: string,
  fieldMap: Record<string, string>
): Promise<string | undefined> {
  const fromMap = resolveLogsTimeColumn(fieldMap)
  if (fromMap) {
    return fromMap
  }
  const columns = await loadSchema(tableName)
  return columns.find((column) => column.semantic_type === 'TIMESTAMP')?.name
}

/**
 * Time + Context filters WHERE for Logs Drilldown (filters optional).
 * Unlike Related logs, time alone is enough for overview volume.
 */
export async function buildLogsContextWhere(
  ctx: DrilldownContext,
  options?: { extraEquals?: Array<{ column: string; value: string }> }
): Promise<string> {
  const tableName = ctx.logsTable.value
  if (!tableName) {
    return ''
  }

  const fieldMap = ctx.fieldMap.value.logs
  const whereParts: string[] = []
  const unixRange = ctx.unixTimeRange()

  if (unixRange.length === 2) {
    const timeColumn = await resolveLogsTimeColumnFallback(tableName, fieldMap)
    if (timeColumn) {
      whereParts.push(`${quoteIdent(timeColumn)} >= FROM_UNIXTIME(${unixRange[0]})`)
      whereParts.push(`${quoteIdent(timeColumn)} <= FROM_UNIXTIME(${unixRange[1]})`)
    }
  }

  whereParts.push(...filtersToSqlWhere(ctx.filters.value, fieldMap))

  options?.extraEquals?.forEach(({ column, value }) => {
    whereParts.push(`${quoteIdent(column)} = '${escapeSqlString(value)}'`)
  })

  return whereParts.join(' AND ')
}

/** True when at least one filter maps to a column on the bound logs table. */
export function canShowRelatedLogs(ctx: DrilldownContext): boolean {
  if (!ctx.logsTable.value) {
    return false
  }
  return filtersToSqlWhere(ctx.filters.value, ctx.fieldMap.value.logs).length > 0
}

/** Related logs WHERE — requires at least one mapped label filter (not time alone). */
export async function buildLogsWhere(ctx: DrilldownContext): Promise<string> {
  const tableName = ctx.logsTable.value
  if (!tableName) {
    return ''
  }

  const whereParts = filtersToSqlWhere(ctx.filters.value, ctx.fieldMap.value.logs)
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

export async function relatedLogsCount(ctx: DrilldownContext): Promise<number> {
  const tableName = ctx.logsTable.value
  const where = await buildLogsWhere(ctx)
  if (!tableName || !where) {
    return 0
  }

  try {
    const response = await editorApi.runSQL(`SELECT COUNT(*) FROM ${quoteIdent(tableName)} WHERE ${where}`)
    const rows = response?.output?.[0]?.records?.rows
    if (!Array.isArray(rows) || !Array.isArray(rows[0])) {
      return 0
    }
    return Number(rows[0][0]) || 0
  } catch (error) {
    console.error('Failed to count related logs:', error)
    return 0
  }
}

export async function relatedLogsPreview(
  ctx: DrilldownContext,
  limit = RELATED_LOGS_PREVIEW_LIMIT
): Promise<string[][]> {
  const tableName = ctx.logsTable.value
  const where = await buildLogsWhere(ctx)
  if (!tableName || !where) {
    return []
  }

  try {
    const columns = await loadSchema(tableName)
    const fieldMap = ctx.fieldMap.value.logs
    const timeColumn = resolveLogsTimeColumn(fieldMap) || columns.find((c) => c.semantic_type === 'TIMESTAMP')?.name
    const bodyColumn =
      fieldMap.body ||
      columns.find((column) => column.name === 'body' || column.name === 'log_body')?.name ||
      columns.find((column) => column.semantic_type === 'FIELD')?.name

    const selectColumns = [timeColumn, bodyColumn].filter(Boolean) as string[]
    if (!selectColumns.length) {
      selectColumns.push(columns[0]?.name ?? '1')
    }

    const query = `SELECT ${selectColumns.map((col) => quoteIdent(col)).join(', ')} FROM ${quoteIdent(
      tableName
    )} WHERE ${where} LIMIT ${limit}`
    const response = await editorApi.runSQL(query)
    const rows = response?.output?.[0]?.records?.rows
    return Array.isArray(rows) ? rows.map((row) => (Array.isArray(row) ? row.map(String) : [])) : []
  } catch (error) {
    console.error('Failed to preview related logs:', error)
    return []
  }
}

export type ServiceVolumeRow = {
  key: string
  count: number
}

/** GROUP BY primaryGroupBy — used when a real group column exists (no fake All-logs card). */
export async function fetchServiceVolumes(ctx: DrilldownContext, limit = 200): Promise<ServiceVolumeRow[]> {
  const tableName = ctx.logsTable.value
  const groupCol = ctx.fieldMap.value.logs.primaryGroupBy
  if (!tableName || !groupCol) {
    return []
  }

  const where = await buildLogsContextWhere(ctx)
  if (!where) {
    return []
  }

  try {
    const sql = `SELECT ${quoteIdent(groupCol)} AS group_key, COUNT(*) AS cnt
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
  return discoverLabelColumns(columns, ctx.fieldMap.value.logs, {
    include: settings.labelInclude,
    exclude: settings.labelExclude,
  })
}

export type LabelValueRow = {
  value: string
  count: number
}

export async function fetchLabelValues(
  ctx: DrilldownContext,
  labelCol: string,
  limit = LABEL_VALUES_LIMIT
): Promise<LabelValueRow[]> {
  const tableName = ctx.logsTable.value
  if (!tableName || !labelCol) {
    return []
  }
  if (!(await tableHasColumn(tableName, labelCol))) {
    return []
  }

  const where = await buildLogsContextWhere(ctx)
  if (!where) {
    return []
  }

  try {
    const sql = `SELECT ${quoteIdent(labelCol)} AS value, COUNT(*) AS cnt
FROM ${quoteIdent(tableName)}
WHERE ${where} AND ${quoteIdent(labelCol)} IS NOT NULL
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
  }
): Promise<LogsRowsResult> {
  const tableName = ctx.logsTable.value
  const empty: LogsRowsResult = { columns: [], data: [], tsColumn: null, tsColumnName: null, hasMore: false }
  if (!tableName) {
    return empty
  }

  const fieldMap = ctx.fieldMap.value.logs
  if (options?.labelCol && !(await tableHasColumn(tableName, options.labelCol))) {
    return empty
  }
  const extraEquals =
    options?.labelCol && options.value !== undefined ? [{ column: options.labelCol, value: options.value }] : undefined
  const where = await buildLogsContextWhere(ctx, { extraEquals })
  if (!where) {
    return empty
  }

  const selectCols = defaultLogSelectColumns(fieldMap).filter(Boolean)
  if (!selectCols.length) {
    return empty
  }
  // Drop role columns that disappeared after a table switch (defensive).
  const schema = await loadSchema(tableName)
  const schemaNames = new Set(schema.map((column) => column.name))
  const safeSelectCols = selectCols.filter((name) => schemaNames.has(name))
  if (!safeSelectCols.length) {
    return empty
  }

  const timeCol = resolveLogsTimeColumn(fieldMap)
  const limit = options?.limit ?? LOGS_ROWS_LIMIT
  const keyOffset = options?.keyOffset ?? 0

  const whereParts = [where]
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
 * Volume timeseries for drilldown mini charts: `[unixSec, count]` ascending.
 * Uses the same date_bin step rules as CountChart, without that component's UI.
 */
export async function fetchLogVolumeTimeseries(
  ctx: DrilldownContext,
  options?: { labelCol?: string; value?: string; limit?: number }
): Promise<Array<[number, number]>> {
  const tableName = ctx.logsTable.value
  const fieldMap = ctx.fieldMap.value.logs
  const timeColumn = await resolveLogsTimeColumnFallback(tableName || '', fieldMap)
  if (!tableName || !timeColumn) {
    return []
  }
  if (options?.labelCol && !(await tableHasColumn(tableName, options.labelCol))) {
    return []
  }

  const extraEquals =
    options?.labelCol && options.value !== undefined ? [{ column: options.labelCol, value: options.value }] : undefined
  const where = await buildLogsContextWhere(ctx, { extraEquals })
  if (!where) {
    return []
  }

  const interval = volumeIntervalSeconds(ctx)
  const limit = options?.limit ?? 200
  const sql = `SELECT
  date_bin('${interval} seconds', ${quoteIdent(timeColumn)}) AS time_bucket,
  COUNT(*) AS event_count
FROM ${quoteIdent(tableName)}
WHERE ${where}
GROUP BY time_bucket
ORDER BY time_bucket ASC
LIMIT ${limit}`

  try {
    const response = await editorApi.runSQL(sql)
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
        return [unix, Number(row?.[1]) || 0]
      })
      .filter((point): point is [number, number] => point != null)
  } catch (error) {
    console.error('Failed to fetch log volume timeseries:', error)
    return []
  }
}

export { discoverLabelColumns }
