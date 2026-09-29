import editorApi from '@/api/editor'
import type { ColumnType } from '@/types/query'
import { TsTypeMapping } from '@/utils/date-time'
import useTableSchemaStore from '@/store/modules/table-schema'
import type { DrilldownContext } from '../context'
import { loadDrilldownSettings, updateTracesDrilldownSettings } from '../drilldown-settings'
import { buildLogsFieldMap, type SchemaColumn } from '../logs/field-map'
import { escapeSqlString, quoteIdent } from '../logs/query-state'
import { sqlJsonGetStringExpr } from '../logs/json-field-keys'
import { getTableSemantics, listSignalTables, resolveEntityFilterRef } from '../semantics'
import { isTraceModel } from '../semantics/otlp'
import type { EntityColumnRef } from '../semantics/types'
import type { LogsRowsResult } from '../adapters/logs'

/**
 * Where a trace's logs live: `manual` = user-authored mapping, `auto` = learned from the
 * service probe, `current` = the Logs page bound table (compatibility fallback — opening
 * it must not rebind the Logs page).
 */
export type TraceLogsTargetSource = 'manual' | 'auto' | 'current'

export interface TraceLogsTarget {
  service: string
  database: string
  table: string
  source: TraceLogsTargetSource
}

export interface TraceLogsResolution {
  /** Resolved target per requested service; includes `current` fallbacks, excludes ambiguous. */
  targets: Record<string, TraceLogsTarget>
  /** Services whose probe matched several tables — left for the user to decide in settings. */
  ambiguous: Record<string, string[]>
  /** True when several qualified logs tables compete and mappings carry routing value. */
  multiTable: boolean
}

export interface TraceLogsQueryResult extends LogsRowsResult {
  /** False when no trace-id column could be resolved for this table. */
  traceAssociationReady: boolean
}

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** A candidate logs table that can be probed: qualified by schema, with its service identity SQL. */
interface LogsCandidate {
  database: string
  table: string
  identityExpr: string
  timeColumn?: string
}

/** Column names that positively hint a table carries log payloads. */
const LOGS_PAYLOAD_HINT_COLUMNS = ['body', 'message', 'msg', 'log', 'content', 'text']

/**
 * Shared probe-candidate qualification — the one rule set for "which tables can take
 * part in trace → logs association": declared as `log` (or, undeclared, carrying a
 * log-payload column), not trace-model shaped, filterable by trace (`trace_id`), with
 * a resolvable service identity. Both the routing probe and the settings picker use it.
 */
export interface TraceLogsTableQualification {
  /**
   * SQL left-hand for the service identity probe. Absent when the table has no
   * resolvable service identity — such tables still support manual mapping (row-level
   * filtering only needs trace_id) but cannot be auto-probed.
   */
  identityExpr?: string
  timeColumn?: string
}

/**
 * Unified trace-side qualification for "which tables can take part in trace → logs
 * association": declared as `log` (or, undeclared, carrying a log-payload column), not
 * trace-model shaped, and filterable by trace (`trace_id`). A resolvable service identity
 * is optional — required only by the auto probe, never by manual mapping, so non-OTel
 * tables with a trace_id stay usable.
 */
export async function qualifyTraceLogsTable(
  table: string,
  columns: SchemaColumn[],
  database: string
): Promise<TraceLogsTableQualification | undefined> {
  const names = new Set(columns.map((column) => column.name))
  if (isTraceModel(names)) {
    return undefined
  }
  const semantics = await getTableSemantics(table, database)
  if (semantics?.signalType && semantics.signalType !== 'log') {
    return undefined
  }
  // Positive logs evidence: a declared logs table qualifies outright; an undeclared
  // table must carry a log-payload column — span-shaped tables (trace_id plus a
  // service identity alone) must not become association targets.
  const declaredLog = semantics?.signalType === 'log'
  if (!declaredLog && !LOGS_PAYLOAD_HINT_COLUMNS.some((column) => names.has(column))) {
    return undefined
  }
  if (!names.has('trace_id')) {
    return undefined
  }
  let ref: EntityColumnRef | undefined
  try {
    ref = await resolveEntityFilterRef(table, 'service', { signal: 'logs', columns, database })
  } catch {
    ref = undefined
  }
  let identityExpr: string | undefined
  if (ref && names.has(ref.column)) {
    identityExpr = ref.jsonKey ? sqlJsonGetStringExpr(ref.column, ref.jsonKey) : quoteIdent(ref.column)
  }
  return {
    identityExpr,
    timeColumn: names.has('timestamp') ? 'timestamp' : undefined,
  }
}

/**
 * Qualified candidates for the trace → logs routing, reusing the Logs domain's own
 * discovery (`listSignalTables`) and identity resolution (`resolveEntityFilterRef`).
 */
async function loadLogsCandidates(ctx: DrilldownContext): Promise<LogsCandidate[]> {
  const database = ctx.logsDatabase.value
  const tables = await listSignalTables('logs', {
    include: ctx.logsTable.value ? [ctx.logsTable.value] : [],
    database,
  })

  const candidates = await Promise.all(
    tables.map(async (table): Promise<LogsCandidate | undefined> => {
      // Declared non-log tables (metrics, the traces table itself) are rejected without
      // even fetching their schema.
      const semantics = await getTableSemantics(table, database)
      if (semantics?.signalType && semantics.signalType !== 'log') {
        return undefined
      }
      let columns: SchemaColumn[]
      try {
        columns = await useTableSchemaStore().ensureTableSchema(table, database)
      } catch {
        return undefined
      }
      const qualified = await qualifyTraceLogsTable(table, columns, database)
      // Auto-probing routes by service identity — tables without one can only be
      // mapped manually in settings, they never become probe targets.
      if (!qualified?.identityExpr) {
        return undefined
      }
      return { database, table, identityExpr: qualified.identityExpr, timeColumn: qualified.timeColumn }
    })
  )
  return candidates.filter((candidate): candidate is LogsCandidate => candidate !== undefined)
}

/** Data evidence: the table contains this service's logs inside the current time window. */
async function probeLogsCandidate(ctx: DrilldownContext, candidate: LogsCandidate, service: string): Promise<boolean> {
  const whereParts = [`${candidate.identityExpr} = '${escapeSqlString(service)}'`]
  const unixRange = ctx.unixTimeRange()
  if (candidate.timeColumn && unixRange.length === 2) {
    whereParts.push(`${quoteIdent(candidate.timeColumn)} >= FROM_UNIXTIME(${unixRange[0]})`)
    whereParts.push(`${quoteIdent(candidate.timeColumn)} <= FROM_UNIXTIME(${unixRange[1]})`)
  }
  const sql = `SELECT 1 FROM ${quoteIdent(candidate.table)} WHERE ${whereParts.join(' AND ')} LIMIT 1`
  try {
    const response = await editorApi.runSQL(sql, candidate.database)
    return (response?.output?.[0]?.records?.rows?.length ?? 0) > 0
  } catch (error) {
    console.error(`Failed to probe logs table ${candidate.database}.${candidate.table} for ${service}:`, error)
    return false
  }
}

/**
 * Persist a probe hit as an auto mapping so later resolutions skip the probe. Manual
 * entries are never touched, and tombstoned services are never re-learned.
 */
function learnTraceLogsMapping(ctx: DrilldownContext, service: string, table: string): void {
  const database = ctx.logsDatabase.value
  const settings = loadDrilldownSettings(ctx.tracesDatabase.value)
  const mappings = settings.traces.traceLogsMappings ?? []
  if (mappings.some((item) => item.service === service)) {
    return
  }
  if ((settings.traces.ignoredServiceKeys ?? []).includes(service)) {
    return
  }
  updateTracesDrilldownSettings(
    { traceLogsMappings: [...mappings, { service, database, table, source: 'auto' }] },
    ctx.tracesDatabase.value
  )
}

/**
 * Resolve service-scoped logs targets for a trace view.
 *
 * Mappings exist only to disambiguate **multiple** logs tables. Routing keys are
 * data-carried identities (service value + time window), never trace_id: manual settings
 * win, then learned entries, then the service probe over qualified candidates, then the
 * Logs page bound table as the visible fallback. A probe that matches several tables is
 * left ambiguous for the user — the system never guesses.
 */
export async function resolveTraceLogsForServices(
  ctx: DrilldownContext,
  services: Array<string | undefined>
): Promise<TraceLogsResolution> {
  const requested = [...new Set(services.map(normalizeName).filter(Boolean))]
  const resolution: TraceLogsResolution = { targets: {}, ambiguous: {}, multiTable: false }
  if (!requested.length) {
    return resolution
  }

  const settings = loadDrilldownSettings(ctx.tracesDatabase.value)
  let activeMappings = settings.traces.traceLogsMappings ?? []
  // Auto entries learned under a different Logs database are stale — drop them.
  activeMappings = activeMappings.filter((item) => item.source !== 'auto' || item.database === ctx.logsDatabase.value)
  let pending = requested.filter((service) => !activeMappings.some((item) => item.service === service))

  // Mappings only carry information when several logs tables compete. With a single
  // qualified table (or none), every mapping that resolves to it is a no-op equivalent
  // to the Logs page binding — drop it regardless of where it came from, so the settings
  // stay clean and the Logs field settings decide.
  const needsCandidates = pending.length > 0 || activeMappings.some((item) => item.database === ctx.logsDatabase.value)
  let candidates: LogsCandidate[] = []
  let multiTable = false
  if (needsCandidates) {
    candidates = await loadLogsCandidates(ctx)
    multiTable = candidates.length > 1
    if (!multiTable) {
      const onlyTable = candidates.length === 1 ? candidates[0].table : undefined
      activeMappings = activeMappings.filter((item) => {
        if (item.source === 'auto') {
          return false
        }
        return !(onlyTable && item.database === ctx.logsDatabase.value && item.table === onlyTable)
      })
      pending = pending.filter((service) => !activeMappings.some((item) => item.service === service))
    }
  }
  if (activeMappings.length !== (settings.traces.traceLogsMappings?.length ?? 0)) {
    updateTracesDrilldownSettings(
      { traceLogsMappings: activeMappings.length ? activeMappings : [] },
      ctx.tracesDatabase.value
    )
  }

  requested.forEach((service) => {
    const mapping = activeMappings.find((item) => item.service === service)
    if (mapping) {
      resolution.targets[service] = {
        service,
        database: mapping.database,
        table: mapping.table,
        source: mapping.source === 'auto' ? 'auto' : 'manual',
      }
    }
  })

  if (multiTable && pending.length) {
    const probed = await Promise.all(
      pending.map(async (service) => {
        const hitTables = (
          await Promise.all(
            candidates.map(async (candidate) =>
              (await probeLogsCandidate(ctx, candidate, service)) ? candidate.table : undefined
            )
          )
        ).filter((table): table is string => table !== undefined)
        return { service, hitTables }
      })
    )
    probed.forEach(({ service, hitTables }) => {
      if (hitTables.length === 1) {
        learnTraceLogsMapping(ctx, service, hitTables[0])
        resolution.targets[service] = {
          service,
          database: ctx.logsDatabase.value,
          table: hitTables[0],
          source: 'auto',
        }
      } else if (hitTables.length > 1) {
        resolution.ambiguous[service] = hitTables
      }
    })
  }

  const fallbackTable = ctx.logsTable.value
  if (fallbackTable) {
    requested.forEach((service) => {
      if (!resolution.targets[service] && !resolution.ambiguous[service]) {
        resolution.targets[service] = {
          service,
          database: ctx.logsDatabase.value,
          table: fallbackTable,
          source: 'current',
        }
      }
    })
  }
  resolution.multiTable = multiTable
  return resolution
}

export async function resolveTraceLogsTarget(
  ctx: DrilldownContext,
  service?: string
): Promise<TraceLogsTarget | undefined> {
  const { targets } = await resolveTraceLogsForServices(ctx, [service])
  return service ? targets[normalizeName(service)] : undefined
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
