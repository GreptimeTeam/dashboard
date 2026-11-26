import { hostMatches, readRaw, removeKey, writeJSON } from '@/utils/storage'
import { currentConnectionKey, currentDatabase } from './current-database'

export interface LogsFieldMapSettings {
  time?: string
  body?: string
  severity?: string
  traceId?: string
  service?: string
  primaryGroupBy?: string
}

export interface LogsDrilldownSettings {
  table?: string
  fieldMap?: LogsFieldMapSettings
  /** Columns always offered in Add label. */
  labelInclude?: string[]
  /** Columns hidden from Add label. */
  labelExclude?: string[]
  /** Kept so old configs still load. Not a user-facing Field picker. */
  fieldInclude?: string[]
  /** Kept so old configs still load. Not a user-facing Field picker. */
  fieldExclude?: string[]
}

export interface TraceLogsMapping {
  service: string
  database: string
  table: string
  /** `manual` = user-authored; `auto` = learned from the service probe. Absent = manual (legacy). */
  source?: 'manual' | 'auto'
}

export interface TracesDrilldownSettings {
  /** Service-scoped target used by Trace → Logs. Field roles stay owned by Logs settings. */
  traceLogsMappings?: TraceLogsMapping[]
  /** Services whose auto-learned mapping the user deleted — never learned again. */
  ignoredServiceKeys?: string[]
}

export interface DrilldownSettings {
  logs: LogsDrilldownSettings
  traces: TracesDrilldownSettings
}

/**
 * One physical key. The stored value is stamped with the host + DB it belongs to;
 * a page whose connection no longer matches simply reads empty settings instead of
 * applying another cluster's table/field map.
 *
 * Only the most recently written host+DB is retained (last write wins). This is
 * deliberate: drilldown settings are per active page, not a per-database archive.
 */
const STORAGE_KEY = 'drilldown-settings'
const LEGACY_PREFIX = `${STORAGE_KEY}:`
const STORAGE_VERSION = 1

interface StoredDrilldownSettings extends DrilldownSettings {
  v?: number
  host?: string
  database?: string
}

function parseTraceLogsMappings(raw: unknown): TraceLogsMapping[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined
  }
  const mappings = raw
    .map((item): TraceLogsMapping | null => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const record = item as Record<string, unknown>
      const service = typeof record.service === 'string' ? record.service.trim() : ''
      const database = typeof record.database === 'string' ? record.database.trim() : ''
      const table = typeof record.table === 'string' ? record.table.trim() : ''
      const source = record.source === 'auto' || record.source === 'manual' ? record.source : undefined
      return service && database && table ? { service, database, table, source } : null
    })
    .filter((item): item is TraceLogsMapping => item !== null)
  return mappings.length ? mappings : undefined
}

function parseIgnoredServiceKeys(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined
  }
  const keys = [
    ...new Set(
      raw
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    ),
  ]
  return keys.length ? keys : undefined
}

function emptySettings(): DrilldownSettings {
  return { logs: {}, traces: {} }
}

function parseSettings(parsed: unknown): DrilldownSettings {
  if (!parsed || typeof parsed !== 'object') {
    return emptySettings()
  }
  const value = parsed as Record<string, unknown>
  const logs = value.logs && typeof value.logs === 'object' ? (value.logs as Record<string, unknown>) : {}
  const traces = value.traces && typeof value.traces === 'object' ? (value.traces as Record<string, unknown>) : {}
  return {
    logs: {
      table: typeof logs.table === 'string' ? logs.table : undefined,
      fieldMap:
        logs.fieldMap && typeof logs.fieldMap === 'object' ? (logs.fieldMap as LogsFieldMapSettings) : undefined,
      labelInclude: Array.isArray(logs.labelInclude)
        ? logs.labelInclude.filter((item: unknown) => typeof item === 'string')
        : undefined,
      labelExclude: Array.isArray(logs.labelExclude)
        ? logs.labelExclude.filter((item: unknown) => typeof item === 'string')
        : undefined,
      fieldInclude: Array.isArray(logs.fieldInclude)
        ? logs.fieldInclude.filter((item: unknown) => typeof item === 'string')
        : undefined,
      fieldExclude: Array.isArray(logs.fieldExclude)
        ? logs.fieldExclude.filter((item: unknown) => typeof item === 'string')
        : undefined,
    },
    traces: {
      traceLogsMappings: parseTraceLogsMappings(traces.traceLogsMappings),
      ignoredServiceKeys: parseIgnoredServiceKeys(traces.ignoredServiceKeys),
    },
  }
}

/** Pre-collapse storage: one key per database, no host stamp. Read again once for migration. */
function loadLegacySettings(database: string): DrilldownSettings | null {
  const raw = readRaw(`${LEGACY_PREFIX}${database}`)
  if (!raw) {
    return null
  }
  try {
    return parseSettings(JSON.parse(raw))
  } catch {
    return null
  }
}

function removeLegacyKeys(): void {
  try {
    if (typeof localStorage.key !== 'function' || typeof localStorage.length !== 'number') {
      return
    }
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(LEGACY_PREFIX)) {
        keys.push(key)
      }
    }
    keys.forEach((key) => removeKey(key))
  } catch {
    // ignore storage failures
  }
}

export function loadDrilldownSettings(database?: string): DrilldownSettings {
  const db = database ?? currentDatabase()
  const raw = readRaw(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredDrilldownSettings
      if (!parsed || typeof parsed !== 'object') {
        return emptySettings()
      }
      if (parsed.database !== db || !hostMatches(parsed.host, currentConnectionKey())) {
        return emptySettings()
      }
      return parseSettings(parsed)
    } catch {
      return emptySettings()
    }
  }
  return loadLegacySettings(db) ?? emptySettings()
}

export function saveDrilldownSettings(settings: DrilldownSettings, database?: string): void {
  const db = database ?? currentDatabase()
  writeJSON(STORAGE_KEY, {
    v: STORAGE_VERSION,
    host: currentConnectionKey(),
    database: db,
    logs: settings.logs,
    traces: settings.traces,
  } satisfies StoredDrilldownSettings)
  removeLegacyKeys()
}

function compactFieldMap(fieldMap?: LogsFieldMapSettings): LogsFieldMapSettings | undefined {
  if (!fieldMap) {
    return undefined
  }
  const next: LogsFieldMapSettings = {}
  ;(Object.keys(fieldMap) as (keyof LogsFieldMapSettings)[]).forEach((key) => {
    const value = fieldMap[key]
    if (typeof value === 'string' && value.trim()) {
      next[key] = value.trim()
    }
  })
  return Object.keys(next).length ? next : undefined
}

export function updateLogsDrilldownSettings(
  patch: Partial<LogsDrilldownSettings>,
  database?: string
): DrilldownSettings {
  const current = loadDrilldownSettings(database)
  const next: DrilldownSettings = {
    logs: {
      ...current.logs,
      ...patch,
      // Replace (do not merge) so cleared roles after table switch do not keep old columns.
      fieldMap: Object.prototype.hasOwnProperty.call(patch, 'fieldMap')
        ? compactFieldMap(patch.fieldMap)
        : current.logs.fieldMap,
    },
    traces: { ...current.traces },
  }
  saveDrilldownSettings(next, database)
  return next
}

export function updateTracesDrilldownSettings(
  patch: Partial<TracesDrilldownSettings>,
  database?: string
): DrilldownSettings {
  const current = loadDrilldownSettings(database)
  const next: DrilldownSettings = {
    logs: { ...current.logs },
    traces: {
      ...current.traces,
      ...patch,
      traceLogsMappings: Object.prototype.hasOwnProperty.call(patch, 'traceLogsMappings')
        ? parseTraceLogsMappings(patch.traceLogsMappings)
        : current.traces.traceLogsMappings,
      ignoredServiceKeys: Object.prototype.hasOwnProperty.call(patch, 'ignoredServiceKeys')
        ? parseIgnoredServiceKeys(patch.ignoredServiceKeys)
        : current.traces.ignoredServiceKeys,
    },
  }
  saveDrilldownSettings(next, database)
  return next
}
