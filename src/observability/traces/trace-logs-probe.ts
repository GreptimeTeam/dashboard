import editorApi from '@/api/editor'
import useTableSchemaStore from '@/store/modules/table-schema'
import { escapeSqlString, quoteIdent } from '../logs/query-state'
import { getTableSemantics, listSignalTables } from '../semantics'
import type { DrilldownContext } from '../context'
import { qualifyTraceLogsTable } from './trace-logs-qualification'
import type { SchemaColumn } from '../logs/field-map'

/** A candidate logs table that can be probed: qualified by schema, with its service identity SQL. */
export interface LogsCandidate {
  database: string
  table: string
  identityExpr: string
  timeColumn?: string
}

export interface TraceLogsAssociationPool {
  /** Every table that can take part in association (declared or undeclared + trace_id). */
  qualifiedTables: string[]
  /** Auto-probe targets: declared log + resolvable service identity. */
  candidates: LogsCandidate[]
}

/**
 * Shared discovery for Trace → Logs: qualify every mappable table once, then split
 * auto-probe candidates (declared + identity) from the full qualified set used for
 * settings / manual mapping.
 */
export async function loadTraceLogsAssociationPool(ctx: DrilldownContext): Promise<TraceLogsAssociationPool> {
  const database = ctx.connection.logsDatabase.value
  const listed = await listSignalTables('logs', {
    include: ctx.semantics.logs.table.value ? [ctx.semantics.logs.table.value] : [],
    database,
  })
  const tables = Array.isArray(listed) ? listed : []
  if (!tables.length) {
    return { qualifiedTables: [], candidates: [] }
  }

  // Keep declared logs and undeclared tables; drop declared non-log signals.
  const withSemantics = await Promise.all(
    tables.map(async (table) => ({ table, semantics: await getTableSemantics(table, database) }))
  )
  const survivors = withSemantics
    .filter(({ semantics }) => !semantics?.signalType || semantics.signalType === 'log')
    .map(({ table }) => table)

  // Columns pre-filter: without `trace_id` a table can never join association.
  let fetchTargets = survivors
  if (survivors.length) {
    const traceCapable = await useTableSchemaStore().tablesHavingColumn('trace_id', database)
    if (traceCapable.size) {
      fetchTargets = survivors.filter((table) => traceCapable.has(table))
    }
  }

  if (fetchTargets.length) {
    await useTableSchemaStore()
      .ensureTableSchemas(fetchTargets, database)
      .catch(() => undefined)
  }

  const evaluated = await Promise.all(
    fetchTargets.map(async (table) => {
      let columns: SchemaColumn[]
      try {
        columns = await useTableSchemaStore().ensureTableSchema(table, database)
      } catch {
        return undefined
      }
      const qualified = await qualifyTraceLogsTable(table, columns, database)
      if (!qualified) {
        return undefined
      }
      return { table, qualified }
    })
  )

  const qualifiedTables: string[] = []
  const candidates: LogsCandidate[] = []
  evaluated.forEach((item) => {
    if (!item) {
      return
    }
    qualifiedTables.push(item.table)
    // Auto-probing routes by service identity — tables without one can only be
    // mapped manually in settings, they never become probe targets.
    if (item.qualified.declaredLog && item.qualified.identityExpr) {
      candidates.push({
        database,
        table: item.table,
        identityExpr: item.qualified.identityExpr,
        timeColumn: item.qualified.timeColumn,
      })
    }
  })
  return { qualifiedTables, candidates }
}

/** Probe-only view of {@link loadTraceLogsAssociationPool}. */
export async function loadLogsCandidates(ctx: DrilldownContext): Promise<LogsCandidate[]> {
  const { candidates } = await loadTraceLogsAssociationPool(ctx)
  return candidates
}

/**
 * Session cache of probe verdicts, keyed by database, table, service and time window.
 * Routing re-resolves on every table load, trace click and settings open — without the
 * cache, identical (table × service) pairs would be re-probed each time. A page refresh
 * clears the map; a failed probe evicts its keys so it can retry.
 */
const probeVerdicts = new Map<string, Promise<boolean>>()

const PROBE_CACHE_LIMIT = 500

export function probeVerdictKey(database: string, table: string, windowKey: string, service: string): string {
  return `${database}|${table}|${windowKey}|${service}`
}

/** ONE UNION ALL request answering every pending (table, service) pair. */
async function probePairs(
  pending: Map<string, { candidate: LogsCandidate; services: string[]; keys: string[] }>,
  unixRange: number[]
): Promise<Set<string>> {
  const buckets = [...pending.values()]
  const branches = buckets.map(({ candidate, services }) => {
    const serviceList = services.map((service) => `'${escapeSqlString(service)}'`).join(', ')
    // Learning evidence must be trace-carrying rows: every candidate is qualified to
    // carry a `trace_id` column (see qualifyTraceLogsTable), so requiring a non-null
    // value keeps a service from being learned onto a table that only holds its
    // non-trace logs (its trace logs may live elsewhere, outside this window).
    const whereParts = [`${candidate.identityExpr} IN (${serviceList})`, `${quoteIdent('trace_id')} IS NOT NULL`]
    if (candidate.timeColumn && unixRange.length === 2) {
      whereParts.push(`${quoteIdent(candidate.timeColumn)} >= FROM_UNIXTIME(${unixRange[0]})`)
      whereParts.push(`${quoteIdent(candidate.timeColumn)} <= FROM_UNIXTIME(${unixRange[1]})`)
    }
    return `SELECT DISTINCT '${escapeSqlString(candidate.table)}' AS tbl, ${
      candidate.identityExpr
    } AS svc FROM ${quoteIdent(candidate.table)} WHERE ${whereParts.join(' AND ')}`
  })
  try {
    const response = await editorApi.runSQL(branches.join(' UNION ALL '), buckets[0].candidate.database)
    const rows = response?.output?.[0]?.records?.rows ?? []
    const hitKeys = new Set<string>()
    rows.forEach((row) => {
      const table = typeof row?.[0] === 'string' ? row[0] : ''
      const service = typeof row?.[1] === 'string' ? row[1] : ''
      if (table && service) {
        hitKeys.add(`${table}|${service}`)
      }
    })
    return hitKeys
  } catch (error) {
    console.error('Failed to probe logs tables for services:', error)
    // A failed probe must not poison the session cache — evict so it can retry.
    buckets.forEach((bucket) => bucket.keys.forEach((key) => probeVerdicts.delete(key)))
    return new Set<string>()
  }
}

/**
 * Data evidence for routing: which candidate tables actually contain each pending
 * service's **trace-carrying** logs inside the current time window (rows with a
 * non-null `trace_id`). Every pending (table, service) pair is answered by ONE
 * UNION ALL request, and each verdict is cached for the session — repeated
 * resolutions reuse it instead of re-probing.
 */
export async function probeLogsCandidates(
  ctx: DrilldownContext,
  candidates: LogsCandidate[],
  services: string[]
): Promise<Map<string, string[]>> {
  const hits = new Map<string, string[]>()
  if (!candidates.length || !services.length) {
    return hits
  }
  const unixRange = ctx.query.unixTimeRange()
  const windowKey = unixRange.length === 2 ? `${unixRange[0]}-${unixRange[1]}` : 'all'

  // Only pairs without a verdict go into the query; in-flight verdicts are shared.
  const pending = new Map<string, { candidate: LogsCandidate; services: string[]; keys: string[] }>()
  candidates.forEach((candidate) => {
    services.forEach((service) => {
      const key = probeVerdictKey(candidate.database, candidate.table, windowKey, service)
      if (probeVerdicts.has(key)) {
        return
      }
      const bucket = pending.get(candidate.table) ?? { candidate, services: [], keys: [] }
      bucket.services.push(service)
      bucket.keys.push(key)
      pending.set(candidate.table, bucket)
    })
  })

  if (pending.size) {
    if (probeVerdicts.size > PROBE_CACHE_LIMIT) {
      probeVerdicts.clear()
    }
    const query = probePairs(pending, unixRange)
    pending.forEach((bucket) => {
      bucket.keys.forEach((key, index) => {
        const service = bucket.services[index]
        probeVerdicts.set(
          key,
          query.then((hitTables) => hitTables.has(`${bucket.candidate.table}|${service}`))
        )
      })
    })
  }

  const verdicts = await Promise.all(
    candidates.flatMap((candidate) =>
      services.map(async (service) => ({
        candidate,
        service,
        hit:
          (await probeVerdicts.get(probeVerdictKey(candidate.database, candidate.table, windowKey, service))) ?? false,
      }))
    )
  )
  verdicts.forEach(({ candidate, service, hit }) => {
    if (!hit) {
      return
    }
    const tables = hits.get(service) ?? []
    if (!tables.includes(candidate.table)) {
      tables.push(candidate.table)
    }
    hits.set(service, tables)
  })
  return hits
}

/** Test hook: clears the session probe cache. */
export function resetTraceLogsProbeCache(): void {
  probeVerdicts.clear()
}
