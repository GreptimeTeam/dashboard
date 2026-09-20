import { currentDatabase } from './current-database'

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

export interface TracesDrilldownSettings {
  table?: string
}

export interface DrilldownSettings {
  logs: LogsDrilldownSettings
  traces: TracesDrilldownSettings
}

const STORAGE_PREFIX = 'drilldown-settings'

function storageKey(database: string): string {
  return `${STORAGE_PREFIX}:${database}`
}

function emptySettings(): DrilldownSettings {
  return { logs: {}, traces: {} }
}

export function loadDrilldownSettings(database?: string): DrilldownSettings {
  const db = database ?? currentDatabase()
  try {
    const raw = localStorage.getItem(storageKey(db))
    if (!raw) {
      return emptySettings()
    }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return emptySettings()
    }
    const logs = parsed.logs && typeof parsed.logs === 'object' ? parsed.logs : {}
    const traces = parsed.traces && typeof parsed.traces === 'object' ? parsed.traces : {}
    return {
      logs: {
        table: typeof logs.table === 'string' ? logs.table : undefined,
        fieldMap: logs.fieldMap && typeof logs.fieldMap === 'object' ? logs.fieldMap : undefined,
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
        table: typeof traces.table === 'string' ? traces.table : undefined,
      },
    }
  } catch {
    return emptySettings()
  }
}

export function saveDrilldownSettings(settings: DrilldownSettings, database?: string): void {
  const db = database ?? currentDatabase()
  localStorage.setItem(storageKey(db), JSON.stringify(settings))
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
    },
  }
  saveDrilldownSettings(next, database)
  return next
}
