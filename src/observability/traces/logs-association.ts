import editorApi from '@/api/editor'
import type { ColumnType } from '@/types/query'
import { TsTypeMapping } from '@/utils/date-time'
import useTableSchemaStore from '@/store/modules/table-schema'
import type { DrilldownContext } from '../context'
import { loadDrilldownSettings, type TraceLogsMapping } from '../drilldown-settings'
import { buildLogsFieldMap, type SchemaColumn } from '../logs/field-map'
import { escapeSqlString, quoteIdent } from '../logs/query-state'
import { listSignalTables } from '../semantics'
import type { LogsRowsResult } from '../adapters/logs'

export type TraceLogsSource = 'explicit' | 'service' | 'current'

export interface TraceLogsTarget {
  service: string
  database: string
  table: string
  source: TraceLogsSource
}

export interface TraceLogsQueryResult extends LogsRowsResult {
  /** False when no trace-id column could be resolved for this table. */
  traceAssociationReady: boolean
}

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function targetFromMapping(mapping: TraceLogsMapping): TraceLogsTarget {
  return { ...mapping, source: 'explicit' }
}

function isSameTarget(left: TraceLogsTarget, right: TraceLogsTarget): boolean {
  return left.database === right.database && left.table === right.table
}

/**
 * Resolve service-scoped targets without changing the Logs page binding.
 * Explicit mappings win; same-name tables are the lightweight OTel-friendly match;
 * the current Logs binding is the compatibility fallback.
 */
export async function resolveTraceLogsTargets(
  ctx: DrilldownContext,
  services: Array<string | undefined>
): Promise<TraceLogsTarget[]> {
  const requestedServices = [...new Set(services.map(normalizeName).filter(Boolean))]
  const settings = loadDrilldownSettings(ctx.tracesDatabase.value)
  const explicitMappings = settings.traces.traceLogsMappings ?? []
  const targets: TraceLogsTarget[] = []

  requestedServices.forEach((service) => {
    const mapping = explicitMappings.find((item) => item.service === service)
    if (mapping) {
      targets.push(targetFromMapping(mapping))
    }
  })

  const unmatchedServices = requestedServices.filter((service) => !targets.some((target) => target.service === service))
  if (unmatchedServices.length) {
    const logsTables = await listSignalTables('logs', {
      include: ctx.logsTable.value ? [ctx.logsTable.value] : [],
      database: ctx.logsDatabase.value,
    })
    unmatchedServices.forEach((service) => {
      if (logsTables.includes(service)) {
        targets.push({ service, database: ctx.logsDatabase.value, table: service, source: 'service' })
      }
    })
  }

  if (!targets.length && ctx.logsTable.value) {
    targets.push({
      service: requestedServices[0] || '',
      database: ctx.logsDatabase.value,
      table: ctx.logsTable.value,
      source: 'current',
    })
  }

  // The same table can match several services (or be configured twice). Keep one opening target.
  return targets.filter((target, index) => targets.findIndex((item) => isSameTarget(item, target)) === index)
}

export async function resolveTraceLogsTarget(
  ctx: DrilldownContext,
  service?: string
): Promise<TraceLogsTarget | undefined> {
  const [target] = await resolveTraceLogsTargets(ctx, [service])
  return target
}

function normalizeTsDataType(raw?: string): string | undefined {
  return raw ? TsTypeMapping[raw as keyof typeof TsTypeMapping] || raw : undefined
}

function recordsToResult(
  records: {
    schema?: { column_schemas?: Array<{ name: string; data_type?: string }> }
    rows?: unknown[][]
  },
  keyOffset: number
): Pick<LogsRowsResult, 'columns' | 'data' | 'tsColumn' | 'tsColumnName' | 'hasMore'> {
  const schemas = records?.schema?.column_schemas ?? []
  const rows = Array.isArray(records?.rows) ? records.rows : []
  const columns: ColumnType[] = schemas.map((schema) => ({
    name: schema.name,
    data_type: normalizeTsDataType(schema.data_type) || schema.data_type || 'String',
    title: schema.name,
  }))
  const data = rows.map((row, index) => {
    const record: Record<string, unknown> = { key: keyOffset + index }
    columns.forEach((column, columnIndex) => {
      record[column.name] = Array.isArray(row) ? row[columnIndex] : null
    })
    return record
  })
  return {
    columns,
    data,
    tsColumn: null,
    tsColumnName: null,
    hasMore: data.length > 0,
  }
}

export interface TraceLogsQueryOptions {
  target: TraceLogsTarget
  traceId: string
  limit?: number
  beforeTs?: unknown
  keyOffset?: number
}

/**
 * Query one service-scoped logs target. Field roles are resolved by the existing Logs
 * model; this helper never lets a non-OTel table become a new Trace-side field mapping.
 */
export async function fetchTraceLogsRows(
  ctx: DrilldownContext,
  options: TraceLogsQueryOptions
): Promise<TraceLogsQueryResult> {
  const empty: TraceLogsQueryResult = {
    columns: [],
    data: [],
    tsColumn: null,
    tsColumnName: null,
    hasMore: false,
    traceAssociationReady: false,
  }
  const traceId = normalizeName(options.traceId)
  if (!traceId) {
    return empty
  }

  const { database, table } = options.target
  let schema: SchemaColumn[] = []
  try {
    schema = await useTableSchemaStore().ensureTableSchema(table, database)
  } catch (error) {
    console.error(`Failed to load trace logs schema for ${database}.${table}:`, error)
    return empty
  }

  const columnNames = new Set(schema.map((column) => column.name))
  const settings = loadDrilldownSettings(database).logs
  const savedFieldMap = settings.table === table ? settings.fieldMap : undefined
  const fieldMap = await buildLogsFieldMap(table, savedFieldMap, database)

  // OTel/Greptime logs have a fixed trace-id column. A Logs-page role is the compatibility
  // path for a table configured there; without either, stay empty instead of returning
  // unrelated rows from a table that cannot be filtered by this trace.
  const traceColumn = columnNames.has('trace_id') ? 'trace_id' : fieldMap.traceId || fieldMap.trace_id
  if (!traceColumn) {
    const result = recordsToResult({ schema: { column_schemas: schema } }, 0)
    return { ...result, hasMore: false, traceAssociationReady: false }
  }

  const timeColumn = fieldMap.time || (columnNames.has('timestamp') ? 'timestamp' : '')
  const limit = options.limit ?? 100
  const keyOffset = options.keyOffset ?? 0
  const whereParts = [`${quoteIdent(traceColumn)} = '${escapeSqlString(traceId)}'`]
  if (timeColumn) {
    const unixRange = ctx.unixTimeRange()
    if (unixRange.length === 2) {
      whereParts.push(
        `${quoteIdent(timeColumn)} >= FROM_UNIXTIME(${unixRange[0]})`,
        `${quoteIdent(timeColumn)} <= FROM_UNIXTIME(${unixRange[1]})`
      )
    }
    if (options.beforeTs !== undefined && options.beforeTs !== null && options.beforeTs !== '') {
      const cursor = options.beforeTs
      const literal =
        typeof cursor === 'number' || /^\d+$/.test(String(cursor))
          ? String(cursor)
          : `'${escapeSqlString(String(cursor))}'`
      whereParts.push(`${quoteIdent(timeColumn)} < ${literal}`)
    }
  }

  const order = timeColumn ? `ORDER BY ${quoteIdent(timeColumn)} DESC` : ''
  const sql = `SELECT *
FROM ${quoteIdent(table)}
WHERE ${whereParts.join(' AND ')}
${order}
LIMIT ${limit}`

  try {
    const response = await editorApi.runSQL(sql, database)
    const result = recordsToResult(response?.output?.[0]?.records, keyOffset)
    const timeSchema = result.columns.find((column) => column.name === timeColumn)
    result.tsColumn = timeColumn
      ? { name: timeColumn, data_type: timeSchema?.data_type || 'TimestampMillisecond' }
      : null
    result.tsColumnName = timeColumn || null
    result.hasMore = result.data.length >= limit
    return { ...result, traceAssociationReady: true }
  } catch (error) {
    console.error(`Failed to load trace logs from ${database}.${table}:`, error)
    const result = recordsToResult({ schema: { column_schemas: schema } }, 0)
    return { ...result, hasMore: false, traceAssociationReady: true }
  }
}
