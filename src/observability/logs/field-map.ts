import editorApi from '@/api/editor'
import type { LogsFieldMapSettings } from '../drilldown-settings'
import { isJsonAttributeContainerName, parseJsonFieldChipKey } from './json-field-keys'

export {
  isJsonAttributeContainerName,
  JSON_ATTRIBUTE_COLUMN_NAMES,
  parseJsonFieldChipKey,
  sqlJsonGetStringExpr,
} from './json-field-keys'

export type SchemaColumn = {
  name: string
  data_type: string
  semantic_type?: string
}

/**
 * Loki's default OTLP resource attributes stored as index labels.
 * Dots are underscores. Log attributes and scope attributes are not in this set.
 * https://grafana.com/docs/loki/latest/send-data/otel/
 */
export const OTEL_LOG_INDEX_LABELS = [
  'cloud_availability_zone',
  'cloud_region',
  'container_name',
  'deployment_environment_name',
  'k8s_cluster_name',
  'k8s_container_name',
  'k8s_cronjob_name',
  'k8s_daemonset_name',
  'k8s_deployment_name',
  'k8s_job_name',
  'k8s_namespace_name',
  'k8s_pod_name',
  'k8s_replicaset_name',
  'k8s_statefulset_name',
  'service_instance_id',
  'service_name',
  'service_namespace',
] as const

const OTEL_LOG_INDEX_LABEL_SET = new Set<string>(OTEL_LOG_INDEX_LABELS)

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

const JSON_ATTR_SAMPLE_LIMIT = 50

function isStringLikeType(dataType: string | undefined): boolean {
  const dt = (dataType || '').toLowerCase()
  if (!dt) return false
  if (dt.includes('json') || dt.includes('binary') || dt.includes('blob')) return false
  if (dt.includes('timestamp') || dt.includes('datetime') || dt.includes('date')) return false
  if (dt.includes('double') || dt.includes('float') || dt.includes('decimal')) return false
  return dt.includes('string') || dt.includes('varchar') || dt.includes('char') || dt.includes('text')
}

function isNumericLikeType(dataType: string | undefined): boolean {
  const dt = (dataType || '').toLowerCase()
  if (!dt) return false
  return (
    dt.includes('int') ||
    dt.includes('uint') ||
    dt.includes('float') ||
    dt.includes('double') ||
    dt.includes('decimal') ||
    dt.includes('number')
  )
}

function isJsonDataType(dataType: string | undefined): boolean {
  return (dataType || '').toLowerCase().includes('json')
}

function addLabelExcludeSet(fieldMap: Record<string, string>, extraExclude?: string[]): Set<string> {
  return new Set([...(extraExclude ?? []), fieldMap.time, fieldMap.body].filter(Boolean) as string[])
}

/** True when the chip key resolves to `fieldMap.body` (role or physical name), not a hardcoded column name. */
export function isLogsBodyFilterKey(key: string, fieldMap: Record<string, string>): boolean {
  const body = fieldMap.body?.trim()
  const trimmed = key.trim()
  if (!body || !trimmed) {
    return false
  }
  if (trimmed === body) {
    return true
  }
  return fieldMap[trimmed]?.trim() === body
}

function isExcludedLabelColumn(column: SchemaColumn, exclude: Set<string>): boolean {
  if (exclude.has(column.name)) return true
  if (column.semantic_type === 'TIMESTAMP') return true
  return isJsonAttributeContainerName(column.name) || isJsonDataType(column.data_type)
}

function isDeclaredLabelColumn(column: SchemaColumn, fieldMap: Record<string, string>, include: Set<string>): boolean {
  if (column.semantic_type === 'TAG') return true
  if (OTEL_LOG_INDEX_LABEL_SET.has(column.name)) return true
  if (
    column.name === fieldMap.severity ||
    column.name === fieldMap.service ||
    column.name === fieldMap.primaryGroupBy
  ) {
    return true
  }
  return include.has(column.name)
}

/**
 * Add label columns. A string column is a label only when the table or the OTEL/Loki
 * index-label set says so: TAG, `severity` / `service` / `primaryGroupBy`, settings include,
 * or a Loki default resource index-label name. Other strings (for example `err`) are not labels.
 * Exclude `body` / `time`, JSON containers, and `labelExclude` (exclude wins over include).
 */
export function discoverLabelColumns(
  columns: SchemaColumn[],
  fieldMap: Record<string, string>,
  options?: { include?: string[]; exclude?: string[] }
): string[] {
  const exclude = addLabelExcludeSet(fieldMap, options?.exclude)
  const include = new Set((options?.include ?? []).filter(Boolean))

  return columns
    .filter((column) => {
      if (isExcludedLabelColumn(column, exclude)) return false
      if (!isDeclaredLabelColumn(column, fieldMap, include)) return false
      if (column.semantic_type === 'TAG') return true
      return isStringLikeType(column.data_type)
    })
    .map((column) => column.name)
    .sort((a, b) => a.localeCompare(b))
}

/**
 * String columns that are not labels. Top-bar `=~` / `!~` on these is contains (`LIKE`), with no DISTINCT.
 * Includes `fieldMap.body`. Severity stays a label, so it is not here.
 */
export function discoverLogsContainsColumns(
  columns: SchemaColumn[],
  fieldMap: Record<string, string>,
  options?: { include?: string[]; exclude?: string[] }
): string[] {
  const labels = new Set(discoverLabelColumns(columns, fieldMap, options))
  const severity = fieldMap.severity?.trim()
  const time = fieldMap.time?.trim()

  return columns
    .filter((column) => {
      if (labels.has(column.name)) return false
      if (severity && column.name === severity) return false
      if (time && column.name === time) return false
      if (column.semantic_type === 'TIMESTAMP') return false
      if (isJsonAttributeContainerName(column.name) || isJsonDataType(column.data_type)) return false
      return isStringLikeType(column.data_type)
    })
    .map((column) => column.name)
    .sort((a, b) => a.localeCompare(b))
}

/** True when `=~` / `!~` on this chip is a contains match (body role or a non-label string column). */
export function isLogsContainsFilterKey(
  key: string,
  fieldMap: Record<string, string>,
  containsColumns: string[] = []
): boolean {
  if (isLogsBodyFilterKey(key, fieldMap)) {
    return true
  }
  const trimmed = key.trim()
  if (!trimmed) {
    return false
  }
  if (containsColumns.includes(trimmed)) {
    return true
  }
  const mapped = fieldMap[trimmed]?.trim()
  return Boolean(mapped && containsColumns.includes(mapped))
}

/**
 * Top-bar filter keys: label columns except severity, plus contains columns (non-label strings, including body).
 * Severity stays on the Level select.
 */
export function discoverLogsFilterKeyColumns(
  columns: SchemaColumn[],
  fieldMap: Record<string, string>,
  options?: { include?: string[]; exclude?: string[] }
): string[] {
  const keys = new Set([
    ...discoverLabelColumns(columns, fieldMap, options),
    ...discoverLogsContainsColumns(columns, fieldMap, options),
  ])
  const severity = fieldMap.severity?.trim()
  if (severity) {
    keys.delete(severity)
  }
  return [...keys].sort((a, b) => a.localeCompare(b))
}

/**
 * Non-groupable remainder used by implementation (body contains, JSON attribute chips).
 * Not a user-facing Fields list. Severity is a label, so it stays out of this remainder.
 */
export function discoverFieldColumns(
  columns: SchemaColumn[],
  fieldMap: Record<string, string>,
  options?: { include?: string[]; exclude?: string[]; labelInclude?: string[]; labelExclude?: string[] }
): string[] {
  const fieldExclude = new Set([...(options?.exclude ?? []), fieldMap.severity].filter(Boolean) as string[])
  const columnNames = new Set(columns.map((column) => column.name))

  const labelNames = new Set(
    discoverLabelColumns(columns, fieldMap, {
      include: options?.labelInclude,
      exclude: options?.labelExclude,
    })
  )

  const fromSchema = columns
    .filter((column) => {
      if (fieldExclude.has(column.name) || labelNames.has(column.name)) return false
      if (isJsonAttributeContainerName(column.name) || isJsonDataType(column.data_type)) return false
      if (column.semantic_type === 'TAG') return false
      // time role may be TIMESTAMP — still a Field for filtering.
      if (column.semantic_type === 'TIMESTAMP' && column.name !== fieldMap.time) return false
      if (column.semantic_type === 'FIELD' || !column.semantic_type || column.semantic_type === 'TIMESTAMP') {
        if (column.name === fieldMap.time) return true
        return isStringLikeType(column.data_type) || isNumericLikeType(column.data_type)
      }
      return false
    })
    .map((column) => column.name)

  const roleFields = [fieldMap.time, fieldMap.body, fieldMap.trace_id, fieldMap.traceId].filter(
    (name): name is string => Boolean(name) && columnNames.has(name) && !labelNames.has(name) && !fieldExclude.has(name)
  )
  const include = (options?.include ?? []).filter(
    (name) => name && columnNames.has(name) && !labelNames.has(name) && !fieldExclude.has(name)
  )
  const merged = new Set<string>([...fromSchema, ...roleFields, ...include])

  return [...merged].sort((a, b) => a.localeCompare(b))
}

/** Product filter bucket for a chip key or physical column name. */
export type LogsFilterBucket = 'label' | 'field' | 'level'

/**
 * Classify a filter chip key / table column.
 * `field` is an implementation bucket (body, time, JSON attribute keys), not a Fields input.
 * Level is `fieldMap.severity`. Labels are the declared set (TAG, roles, settings include, OTEL index labels).
 */
export function classifyLogsFilterKey(
  key: string,
  columns: SchemaColumn[],
  fieldMap: Record<string, string>,
  options?: {
    labelInclude?: string[]
    labelExclude?: string[]
    fieldInclude?: string[]
    fieldExclude?: string[]
  }
): LogsFilterBucket {
  const trimmed = key.trim()
  if (!trimmed) {
    return 'field'
  }

  if (parseJsonFieldChipKey(trimmed)) {
    return 'field'
  }

  if (trimmed === 'severity' || (fieldMap.severity && trimmed === fieldMap.severity)) {
    return 'level'
  }

  // Chip aliases used by Related logs / service filters.
  if (trimmed === 'service' || trimmed === 'primaryGroupBy') {
    return 'label'
  }

  const labels = new Set(
    discoverLabelColumns(columns, fieldMap, {
      include: options?.labelInclude,
      exclude: options?.labelExclude,
    })
  )
  const mapped = fieldMap[trimmed]
  if (labels.has(trimmed) || (mapped && labels.has(mapped))) {
    return 'label'
  }

  return 'field'
}

/** Filter chip key when adding from a table cell (Level → physical severity column). */
export function chipKeyForLogsTableFilter(
  columnName: string,
  columns: SchemaColumn[],
  fieldMap: Record<string, string>,
  options?: {
    labelInclude?: string[]
    labelExclude?: string[]
    fieldInclude?: string[]
    fieldExclude?: string[]
  }
): string {
  if (classifyLogsFilterKey(columnName, columns, fieldMap, options) === 'level') {
    return (fieldMap.severity || columnName).trim()
  }
  return columnName.trim()
}

/** JSON / attributes container columns eligible for L2 key sampling. */
export function listJsonAttributeColumns(columns: SchemaColumn[]): string[] {
  return columns
    .filter((column) => isJsonAttributeContainerName(column.name) || isJsonDataType(column.data_type))
    .map((column) => column.name)
    .sort((a, b) => a.localeCompare(b))
}

/**
 * Sample rows from JSON attribute columns and collect top-level keys as Field chip keys
 * (`{column}.{key}`). Client-side parse — Greptime has no reliable json_object_keys.
 */
export async function sampleJsonAttributeFieldKeys(
  tableName: string,
  jsonColumns: string[],
  options?: { limit?: number }
): Promise<string[]> {
  if (!tableName || !jsonColumns.length) {
    return []
  }

  const limit = options?.limit ?? JSON_ATTR_SAMPLE_LIMIT
  const keys = new Set<string>()

  await Promise.all(
    jsonColumns.map(async (col) => {
      try {
        const sql = `SELECT "${col}" FROM "${tableName}" WHERE "${col}" IS NOT NULL LIMIT ${limit}`
        const response = await editorApi.runSQL(sql)
        const rows = response?.output?.[0]?.records?.rows
        if (!Array.isArray(rows)) {
          return
        }
        rows.forEach((row: unknown) => {
          const raw = Array.isArray(row) ? row[0] : null
          if (raw == null) {
            return
          }
          let obj: unknown
          if (typeof raw === 'string') {
            try {
              obj = JSON.parse(raw)
            } catch {
              return
            }
          } else if (typeof raw === 'object') {
            obj = raw
          } else {
            return
          }
          if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
            return
          }
          Object.keys(obj as Record<string, unknown>).forEach((key) => {
            if (key) {
              keys.add(`${col}.${key}`)
            }
          })
        })
      } catch (error) {
        console.error(`Failed to sample JSON keys from ${tableName}.${col}:`, error)
      }
    })
  )

  return [...keys].sort((a, b) => a.localeCompare(b))
}

export function resolveLogsTimeColumn(fieldMap: Record<string, string>): string | undefined {
  return fieldMap.time || undefined
}
