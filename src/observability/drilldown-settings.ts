import { useAppStore } from '@/store'

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
  /** TAG columns always offered in Labels picker. */
  labelInclude?: string[]
  /** TAG columns hidden from Labels picker (default includes trace_id). */
  labelExclude?: string[]
}

export interface DrilldownSettings {
  logs: LogsDrilldownSettings
}

const STORAGE_PREFIX = 'drilldown-settings'

function storageKey(database: string): string {
  return `${STORAGE_PREFIX}:${database}`
}

function currentDatabase(): string {
  return useAppStore().database || 'public'
}

function emptySettings(): DrilldownSettings {
  return { logs: {} }
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
  }
  saveDrilldownSettings(next, database)
  return next
}
