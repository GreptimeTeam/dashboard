import editorApi from '@/api/editor'
import type { LogsFieldMapSettings } from '../drilldown-settings'

export type SchemaColumn = {
  name: string
  data_type: string
  semantic_type?: string
}

const TIME_CANDIDATES = ['timestamp', 'ts', 'time', 'greptime_timestamp']
const BODY_CANDIDATES = ['body', 'message', 'content', 'log_body']
const SEVERITY_CANDIDATES = ['severity_text', 'severity', 'level']
const SERVICE_CANDIDATES = ['service_name', 'service', 'scope_name']
const TRACE_CANDIDATES = ['trace_id']

function pickFirst(columnNames: Set<string>, candidates: string[]): string | undefined {
  return candidates.find((name) => columnNames.has(name))
}

function pickTimestampColumn(columns: SchemaColumn[]): string | undefined {
  const bySemantic = columns.find((column) => column.semantic_type === 'TIMESTAMP')?.name
  if (bySemantic) {
    return bySemantic
  }
  const names = new Set(columns.map((column) => column.name))
  return pickFirst(names, TIME_CANDIDATES)
}

/**
 * Heuristic field roles from table schema only (no saved overrides).
 * Missing roles stay undefined — callers should clear the form field.
 */
export function inferLogsFieldDefaultsFromColumns(columns: SchemaColumn[]): LogsFieldMapSettings {
  const columnNames = new Set(columns.map((column) => column.name))
  const service = pickFirst(columnNames, SERVICE_CANDIDATES)
  return {
    time: pickTimestampColumn(columns),
    body: pickFirst(columnNames, BODY_CANDIDATES),
    severity: pickFirst(columnNames, SEVERITY_CANDIDATES),
    service,
    primaryGroupBy: service || pickFirst(columnNames, SERVICE_CANDIDATES),
    traceId: pickFirst(columnNames, TRACE_CANDIDATES),
  }
}

function applySettingsOverrides(
  map: Record<string, string>,
  settings?: LogsFieldMapSettings,
  columnNames?: Set<string>
): Record<string, string> {
  if (!settings) {
    return map
  }
  const allowed = (name?: string) => Boolean(name && (!columnNames || columnNames.has(name)))
  const next = { ...map }
  if (allowed(settings.time)) next.time = settings.time as string
  if (allowed(settings.body)) next.body = settings.body as string
  if (allowed(settings.severity)) next.severity = settings.severity as string
  if (allowed(settings.traceId)) {
    next.traceId = settings.traceId as string
    next.trace_id = settings.traceId as string
  }
  if (allowed(settings.service)) next.service = settings.service as string
  if (allowed(settings.primaryGroupBy)) {
    next.primaryGroupBy = settings.primaryGroupBy as string
    next[settings.primaryGroupBy as string] = settings.primaryGroupBy as string
  }
  return next
}

/**
 * Build Context fieldMap.logs: chip key → physical column.
 * Settings overrides win; then OTEL/heuristic roles; TAG/FIELD identity maps.
 */
export async function buildLogsFieldMap(
  tableName: string,
  settings?: LogsFieldMapSettings
): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  let columns: SchemaColumn[] = []

  try {
    columns = await editorApi.getTableSchema(tableName)
  } catch (error) {
    console.error(`Failed to load schema for ${tableName}:`, error)
    return applySettingsOverrides(map, settings)
  }

  const columnNames = new Set(columns.map((column) => column.name))

  columns.forEach((column) => {
    if (column.semantic_type === 'TAG' || column.semantic_type === 'FIELD') {
      map[column.name] = column.name
    }
  })

  const inferred = inferLogsFieldDefaultsFromColumns(columns)
  const timeCol = settings?.time || inferred.time
  if (timeCol && columnNames.has(timeCol)) {
    map.time = timeCol
  }

  const bodyCol = settings?.body || inferred.body
  if (bodyCol && columnNames.has(bodyCol)) {
    map.body = bodyCol
  }

  const severityCol = settings?.severity || inferred.severity
  if (severityCol && columnNames.has(severityCol)) {
    map.severity = severityCol
  }

  const traceCol = settings?.traceId || inferred.traceId
  if (traceCol && columnNames.has(traceCol)) {
    map.traceId = traceCol
    map.trace_id = traceCol
  }

  const serviceCol = settings?.service || inferred.service
  if (serviceCol && columnNames.has(serviceCol)) {
    map.service = serviceCol
    // Prom ↔ logs chip aliases used by Related logs / filter combobox.
    if (serviceCol === 'service_name' && !map.job) {
      map.job = columnNames.has('scope_name') ? 'scope_name' : serviceCol
    }
  }

  const primaryGroupBy = settings?.primaryGroupBy || inferred.primaryGroupBy
  if (primaryGroupBy && columnNames.has(primaryGroupBy)) {
    map.primaryGroupBy = primaryGroupBy
    if (!map[primaryGroupBy]) {
      map[primaryGroupBy] = primaryGroupBy
    }
  }

  return applySettingsOverrides(map, settings, columnNames)
}

/** Default columns excluded from Labels picker (high cardinality / not dimensions). */
export const DEFAULT_LABEL_EXCLUDE = [
  'trace_id',
  'span_id',
  'trace_flags',
  'log_attributes',
  'resource_attributes',
  'scope_attributes',
  'logattributes',
  'resourceattributes',
  'scope_schema_url',
  'resource_schema_url',
]

function isStringLikeType(dataType: string | undefined): boolean {
  const dt = (dataType || '').toLowerCase()
  if (!dt) return false
  if (dt.includes('json') || dt.includes('binary') || dt.includes('blob')) return false
  if (dt.includes('timestamp') || dt.includes('datetime') || dt.includes('date')) return false
  if (dt.includes('double') || dt.includes('float') || dt.includes('decimal')) return false
  return dt.includes('string') || dt.includes('varchar') || dt.includes('char') || dt.includes('text')
}

/**
 * Label / breakdown columns for Labels Tab.
 * Prefer TAG; also include string-like FIELD columns — many log tables store
 * dimensions (service, host, level, …) as FIELD rather than TAG.
 */
export function discoverLabelColumns(
  columns: SchemaColumn[],
  fieldMap: Record<string, string>,
  options?: { include?: string[]; exclude?: string[] }
): string[] {
  const exclude = new Set(
    [...DEFAULT_LABEL_EXCLUDE, ...BODY_CANDIDATES, ...(options?.exclude ?? []), fieldMap.time, fieldMap.body].filter(
      Boolean
    ) as string[]
  )

  const fromSchema = columns
    .filter((column) => {
      if (exclude.has(column.name)) return false
      if (column.semantic_type === 'TIMESTAMP') return false
      if (column.semantic_type === 'TAG') return true
      // String FIELD / unknown: useful GROUP BY dimensions when TAG is sparse.
      if (column.semantic_type === 'FIELD' || !column.semantic_type) {
        return isStringLikeType(column.data_type)
      }
      return false
    })
    .map((column) => column.name)

  const roleKeys = [fieldMap.primaryGroupBy, fieldMap.service, fieldMap.severity].filter(
    (name): name is string => Boolean(name) && !exclude.has(name)
  )
  const include = (options?.include ?? []).filter((name) => name && !exclude.has(name))
  const merged = new Set<string>([...fromSchema, ...roleKeys, ...include])

  return [...merged].sort((a, b) => a.localeCompare(b))
}

export function resolveLogsTimeColumn(fieldMap: Record<string, string>): string | undefined {
  return fieldMap.time || undefined
}

export function defaultLogSelectColumns(fieldMap: Record<string, string>): string[] {
  const cols = [
    fieldMap.time,
    fieldMap.severity,
    fieldMap.body,
    fieldMap.trace_id || fieldMap.traceId,
    fieldMap.primaryGroupBy,
  ]
  return [...new Set(cols.filter(Boolean) as string[])]
}
