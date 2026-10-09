import editorApi from '@/api/editor'
import type { ColumnType } from '@/types/query'
import { TsTypeMapping } from '@/utils/date-time'
import useTableSchemaStore from '@/store/modules/table-schema'
import type { DrilldownContext } from '../context'
import { loadDrilldownSettings, updateTracesDrilldownSettings } from '../drilldown-settings'
import { buildLogsFieldMap, type SchemaColumn } from '../logs/field-map'
import { escapeSqlString, quoteIdent } from '../logs/query-state'
import { boundSignalDatabase } from '../signal-database'
import { loadTraceLogsAssociationPool, probeLogsCandidates, probeVerdictKey } from './trace-logs-probe'
import type { LogsCandidate } from './trace-logs-probe'
import type { LogsRowsResult } from '../adapters/logs'

/**
 * Where a trace's logs live: `manual` = user-authored mapping, `auto` = learned from the
 * service probe, `current` = the currently bound logs table (`ctx.semantics.logs.table`
 * via the binder — normally the Logs page table; during Trace→Logs overlay this is the
 * overlay table). Compatibility fallback only — opening it must not rebind the Logs page.
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
  /**
   * True when several **probe** candidates (declared log + service identity) compete —
   * auto-learn / probe runs only in this case.
   */
  multiTable: boolean
  /**
   * True when settings should show per-service rows: more than one association-qualified
   * table (including undeclared + `trace_id`), or at least one saved manual mapping.
   */
  manualMappingEnabled: boolean
}

export interface TraceLogsQueryResult extends LogsRowsResult {
  /** False when no trace-id column could be resolved for this table. */
  traceAssociationReady: boolean
}

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Key for `ctx.session.traceLogs.inflightResolves`. Concurrent callers (traces-home,
 * gantt, settings) with the same signature share one resolve.
 */
function resolveInflightKey(ctx: DrilldownContext, services: string[]): string {
  const tracesDb = ctx.connection.tracesDatabase.value
  const logsDb = ctx.connection.logsDatabase.value
  const pageLogsTable = ctx.semantics.logs.table.value ?? ''
  const unixRange = ctx.query.unixTimeRange()
  const windowKey = unixRange.length === 2 ? `${unixRange[0]}-${unixRange[1]}` : 'all'
  const sortedServices = [...services].sort().join(',')
  return `${tracesDb}|${logsDb}|${pageLogsTable}|${windowKey}|${sortedServices}`
}

/**
 * Persist a probe hit as an auto mapping so later resolutions skip the probe. Manual
 * entries are never touched, and tombstoned services are never re-learned.
 */
function learnTraceLogsMapping(ctx: DrilldownContext, service: string, table: string): void {
  const database = ctx.connection.logsDatabase.value
  const settings = loadDrilldownSettings(ctx.connection.tracesDatabase.value)
  const mappings = settings.traces.traceLogsMappings ?? []
  if (mappings.some((item) => item.service === service)) {
    return
  }
  if ((settings.traces.ignoredServiceKeys ?? []).includes(service)) {
    return
  }
  updateTracesDrilldownSettings(
    { traceLogsMappings: [...mappings, { service, database, table, source: 'auto' }] },
    ctx.connection.tracesDatabase.value
  )
}

async function doResolveTraceLogsForServices(ctx: DrilldownContext, requested: string[]): Promise<TraceLogsResolution> {
  const resolution: TraceLogsResolution = {
    targets: {},
    ambiguous: {},
    multiTable: false,
    manualMappingEnabled: false,
  }

  const settings = loadDrilldownSettings(ctx.connection.tracesDatabase.value)
  let activeMappings = settings.traces.traceLogsMappings ?? []
  // Auto entries learned under a different Logs database are stale — drop them.
  activeMappings = activeMappings.filter(
    (item) => item.source !== 'auto' || item.database === ctx.connection.logsDatabase.value
  )
  let pending = requested.filter((service) => !activeMappings.some((item) => item.service === service))

  // One pool: association-qualified tables (manual) + probe candidates (auto).
  // Strip no-op mappings only when a single qualified table remains — undeclared
  // tables still count, so 1 declared + 1 undeclared keeps manual routing editable.
  // Skip discovery when every requested service already has a mapping and nothing
  // on the current Logs DB needs pruning (pure manual short-circuit).
  const logsDbForMappings = ctx.connection.logsDatabase.value
  const allRequestedMapped = requested.every((service) => activeMappings.some((item) => item.service === service))
  const mayNeedStrip = activeMappings.some((item) => item.source === 'auto' || item.database === logsDbForMappings)

  let qualifiedTables: string[] = []
  let candidates: LogsCandidate[] = []
  let multiTable = false
  if (!allRequestedMapped || mayNeedStrip) {
    const pool = await loadTraceLogsAssociationPool(ctx)
    ;({ qualifiedTables, candidates } = pool)
    multiTable = candidates.length > 1
    if (qualifiedTables.length <= 1) {
      const onlyTable = qualifiedTables[0]
      activeMappings = activeMappings.filter((item) => {
        if (item.source === 'auto') {
          return false
        }
        return !(onlyTable && item.database === logsDbForMappings && item.table === onlyTable)
      })
      pending = pending.filter((service) => !activeMappings.some((item) => item.service === service))
    }
  }
  if (activeMappings.length !== (settings.traces.traceLogsMappings?.length ?? 0)) {
    updateTracesDrilldownSettings(
      { traceLogsMappings: activeMappings.length ? activeMappings : [] },
      ctx.connection.tracesDatabase.value
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
    const hits = await probeLogsCandidates(ctx, candidates, pending)
    pending.forEach((service) => {
      const hitTables = hits.get(service) ?? []
      if (hitTables.length === 1) {
        learnTraceLogsMapping(ctx, service, hitTables[0])
        resolution.targets[service] = {
          service,
          database: ctx.connection.logsDatabase.value,
          table: hitTables[0],
          source: 'auto',
        }
      } else if (hitTables.length > 1) {
        resolution.ambiguous[service] = hitTables
      }
    })
  }

  // `source: 'current'` uses the currently bound logs table (`ctx.semantics.logs`).
  // Callers typically resolve before opening the Trace→Logs overlay, so this is the
  // page binding; if overlay is already open, semantics.logs is the overlay table.
  const logsTable = ctx.semantics.logs.table.value
  const logsDb = boundSignalDatabase(ctx, 'logs')
  if (logsTable) {
    requested.forEach((service) => {
      if (!resolution.targets[service] && !resolution.ambiguous[service]) {
        resolution.targets[service] = {
          service,
          database: logsDb,
          table: logsTable,
          source: 'current',
        }
      }
    })
  }
  resolution.multiTable = multiTable
  resolution.manualMappingEnabled =
    qualifiedTables.length > 1 || activeMappings.some((item) => item.source === 'manual' || item.source === undefined)
  return resolution
}

/**
 * Resolve service-scoped logs targets for a trace view.
 *
 * The routing order is fixed and linear — no other guessing happens:
 * 1. manual settings entries (user-authored);
 * 2. learned entries, then the service probe over qualified candidates — only when
 *    several logs tables compete; a probe that matches several tables is left
 *    ambiguous for the user, the system never guesses;
 * 3. the currently bound logs table (`source: 'current'`) as the visible fallback.
 *
 * Concurrent callers with the same signature share one in-flight promise.
 */
export async function resolveTraceLogsForServices(
  ctx: DrilldownContext,
  services: Array<string | undefined>
): Promise<TraceLogsResolution> {
  const requested = [...new Set(services.map(normalizeName).filter(Boolean))]
  if (!requested.length) {
    return { targets: {}, ambiguous: {}, multiTable: false, manualMappingEnabled: false }
  }

  const { inflightResolves } = ctx.session.traceLogs
  const key = resolveInflightKey(ctx, requested)
  const existing = inflightResolves.get(key)
  if (existing) {
    return existing
  }

  const promise = doResolveTraceLogsForServices(ctx, requested).finally(() => {
    if (inflightResolves.get(key) === promise) {
      inflightResolves.delete(key)
    }
  })
  inflightResolves.set(key, promise)
  return promise
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
    const unixRange = ctx.query.unixTimeRange()
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

// Re-exported for the settings modal and existing importers.
export { qualifyTraceLogsTable, type TraceLogsTableQualification } from './trace-logs-qualification'
