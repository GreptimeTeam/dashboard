import editorApi from '@/api/editor'
import useTableSchemaStore from '@/store/modules/table-schema'
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

/** OTLP resource attribute key (`service.name`) → OTel/Loki index-label name (`service_name`). */
export function otelResourceLabelName(path: string): string {
  return path.trim().replace(/\./g, '_').toLowerCase()
}

/**
 * True when a chip names an OTLP *resource* attribute that OTel/Loki promote to a label.
 *
 * Resource attributes are the logs identity surface (`service.name`, `k8s.pod.name`, …) — the
 * same names the flat-column path recognizes through {@link OTEL_LOG_INDEX_LABELS}. Log and
 * scope attributes stay fields.
 */
export function isOtelResourceLabelChip(chipKey: string, jsonColumns: string[] = []): boolean {
  const chip = parseJsonFieldChipKey(chipKey.trim(), jsonColumns)
  if (!chip) {
    return false
  }
  if (!/resource/i.test(chip.column)) {
    return false
  }
  return OTEL_LOG_INDEX_LABEL_SET.has(otelResourceLabelName(chip.path))
}

function pickFirst(columnNames: Set<string>, candidates: string[]): string | undefined {
  return candidates.find((name) => columnNames.has(name))
}

/** Greptime OTLP logs columns. No name heuristics — missing columns stay unset. */
const OTEL_LOG_TIME = ['timestamp']
const OTEL_LOG_BODY = ['body']
const OTEL_LOG_SEVERITY = ['severity_text']
const OTEL_LOG_SERVICE = ['service_name']
const OTEL_LOG_TRACE = ['trace_id']

/**
 * A role value is a real column, or a JSON attribute chip (`container.key`) whose container
 * column exists — the shape entity resolution produces when the identity lives inside a
 * JSON column (`resource_attributes.service.name`). Role-to-SQL helpers expand chips.
 */
export function isLogsRoleValue(value: string | undefined, columnNames: ReadonlySet<string>): boolean {
  const name = value?.trim()
  if (!name) {
    return false
  }
  if (columnNames.has(name)) {
    return true
  }
  const chip = parseJsonFieldChipKey(name, [...columnNames])
  return Boolean(chip && columnNames.has(chip.column))
}

/**
 * Settings defaults from the OTEL logs model only.
 * `scope_name` is instrumentation scope, not service, so it is not used here.
 *
 * `serviceColumn` is the semantic service identity when the table has one: a real column,
 * or a JSON chip when the logs resource attributes keep it inside a JSON column.
 */
export function otelLogsFieldDefaultsFromColumns(
  columns: SchemaColumn[],
  options?: { serviceColumn?: string }
): LogsFieldMapSettings {
  const columnNames = new Set(columns.map((column) => column.name))
  const declaredService = options?.serviceColumn?.trim()
  const service = isLogsRoleValue(declaredService, columnNames)
    ? declaredService
    : pickFirst(columnNames, OTEL_LOG_SERVICE)
  return {
    time: pickFirst(columnNames, OTEL_LOG_TIME),
    body: pickFirst(columnNames, OTEL_LOG_BODY),
    severity: pickFirst(columnNames, OTEL_LOG_SEVERITY),
    service,
    primaryGroupBy: service,
    traceId: pickFirst(columnNames, OTEL_LOG_TRACE),
  }
}

/**
 * Settings form values: keep a saved column only if it still exists, otherwise the OTEL default.
 * No OTEL match and no valid saved column → undefined.
 */
export function resolveLogsSettingsFieldDefaults(
  columns: SchemaColumn[],
  saved?: LogsFieldMapSettings,
  options?: { serviceColumn?: string }
): LogsFieldMapSettings {
  const defaults = otelLogsFieldDefaultsFromColumns(columns, options)
  const columnNames = new Set(columns.map((column) => column.name))
  const keepSaved = (value: string | undefined, fallback: string | undefined) =>
    value && columnNames.has(value) ? value : fallback
  const keepSavedRole = (value: string | undefined, fallback: string | undefined) =>
    isLogsRoleValue(value, columnNames) ? value?.trim() : fallback

  return {
    time: keepSaved(saved?.time, defaults.time),
    body: keepSaved(saved?.body, defaults.body),
    severity: keepSaved(saved?.severity, defaults.severity),
    service: keepSavedRole(saved?.service, defaults.service),
    primaryGroupBy: keepSavedRole(saved?.primaryGroupBy, defaults.primaryGroupBy),
    traceId: keepSaved(saved?.traceId, defaults.traceId),
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
  // Service / primary group may name a JSON chip; its container column is the requirement.
  const allowedRole = (name?: string) => Boolean(name && (!columnNames || isLogsRoleValue(name, columnNames)))
  const next = { ...map }
  if (allowed(settings.time)) next.time = settings.time as string
  if (allowed(settings.body)) next.body = settings.body as string
  if (allowed(settings.severity)) next.severity = settings.severity as string
  if (allowed(settings.traceId)) {
    next.traceId = settings.traceId as string
    next.trace_id = settings.traceId as string
  }
  if (allowedRole(settings.service)) next.service = (settings.service as string).trim()
  if (allowedRole(settings.primaryGroupBy)) {
    const primaryGroupBy = (settings.primaryGroupBy as string).trim()
    next.primaryGroupBy = primaryGroupBy
    // Chips are not columns: never self-map one, or column resolution would quote it as SQL.
    if (!columnNames || columnNames.has(primaryGroupBy)) {
      next[primaryGroupBy] = primaryGroupBy
    }
  }
  return next
}

function applyRoleColumns(
  map: Record<string, string>,
  settings: LogsFieldMapSettings | undefined,
  columnNames: Set<string>
): Record<string, string> {
  const timeCol = settings?.time
  if (timeCol && columnNames.has(timeCol)) {
    map.time = timeCol
  }

  const bodyCol = settings?.body
  if (bodyCol && columnNames.has(bodyCol)) {
    map.body = bodyCol
  }

  const severityCol = settings?.severity
  if (severityCol && columnNames.has(severityCol)) {
    map.severity = severityCol
  }

  const traceCol = settings?.traceId
  if (traceCol && columnNames.has(traceCol)) {
    map.traceId = traceCol
    map.trace_id = traceCol
  }

  const serviceCol = settings?.service
  if (serviceCol && isLogsRoleValue(serviceCol, columnNames)) {
    map.service = serviceCol
    if (serviceCol === 'service_name' && !map.job) {
      map.job = serviceCol
    }
  }

  const primaryGroupBy = settings?.primaryGroupBy
  if (primaryGroupBy && isLogsRoleValue(primaryGroupBy, columnNames)) {
    map.primaryGroupBy = primaryGroupBy
    if (columnNames.has(primaryGroupBy) && !map[primaryGroupBy]) {
      map[primaryGroupBy] = primaryGroupBy
    }
  }

  return applySettingsOverrides(map, settings, columnNames)
}

/**
 * Build Context fieldMap.logs from field settings only.
 * Unset roles stay unset — callers seed OTEL defaults into settings before this.
 */
export async function buildLogsFieldMap(
  tableName: string,
  settings?: LogsFieldMapSettings
): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  let columns: SchemaColumn[] = []

  try {
    columns = await useTableSchemaStore().ensureTableSchema(tableName)
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

  const withRoles = applyRoleColumns(map, settings, columnNames)

  // A partial/stale saved map — or a seed that never ran for this table — must not leave
  // roles empty: without `time` the table spins without issuing a request, and without
  // `body`/`severity` the detail filter row has nothing to render. Fall back to what the
  // table's columns can supply on their own (OTel log model).
  const defaults = otelLogsFieldDefaultsFromColumns(columns, { serviceColumn: settings?.service })
  ;(['time', 'body', 'severity', 'traceId', 'service', 'primaryGroupBy'] as const).forEach((role) => {
    const fallback = defaults[role]
    if (fallback && !withRoles[role]) {
      withRoles[role] = fallback
    }
  })

  return withRoles
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

/** JSON / attributes container columns eligible for L2 key sampling. */
export function listJsonAttributeColumns(columns: SchemaColumn[]): string[] {
  return columns
    .filter((column) => isJsonAttributeContainerName(column.name) || isJsonDataType(column.data_type))
    .map((column) => column.name)
    .sort((a, b) => a.localeCompare(b))
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
    // OTLP resource attributes are labels (`resource_attributes.service.name`); the rest of
    // the JSON attribute chips stay fields.
    return isOtelResourceLabelChip(trimmed, listJsonAttributeColumns(columns)) ? 'label' : 'field'
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

/**
 * Label keys for the Labels tab / Add label: declared columns plus the OTLP resource
 * attribute chips (`resource_attributes.service.name`, `resource_attributes.k8s.pod.name`, …).
 *
 * Resource attributes are the identity surface of logs, so they are labels; `identityChip` is
 * the service identity semantics resolved for this table and stays a label even when the JSON
 * sampling below happens to miss it.
 */
export async function discoverLogLabelKeys(
  tableName: string,
  columns: SchemaColumn[],
  fieldMap: Record<string, string>,
  options?: { include?: string[]; exclude?: string[]; identityChip?: string }
): Promise<string[]> {
  const exclude = new Set((options?.exclude ?? []).filter(Boolean) as string[])
  const keys = new Set(discoverLabelColumns(columns, fieldMap, options))
  const identity = options?.identityChip?.trim()
  if (identity) {
    keys.add(identity)
  }
  const jsonColumns = listJsonAttributeColumns(columns)
  if (tableName && jsonColumns.length) {
    const sampled = await sampleJsonAttributeFieldKeys(tableName, jsonColumns)
    sampled.forEach((chip) => {
      if (isOtelResourceLabelChip(chip, jsonColumns)) {
        keys.add(chip)
      }
    })
  }
  return [...keys].filter((key) => !exclude.has(key)).sort((a, b) => a.localeCompare(b))
}

/** Top-bar key list: label keys (columns + OTLP resource chips) plus contains columns. */
export async function discoverLogFilterKeys(
  tableName: string,
  columns: SchemaColumn[],
  fieldMap: Record<string, string>,
  options?: { include?: string[]; exclude?: string[]; identityChip?: string }
): Promise<string[]> {
  const keys = new Set([
    ...(await discoverLogLabelKeys(tableName, columns, fieldMap, options)),
    ...discoverLogsContainsColumns(columns, fieldMap, options),
  ])
  const severity = fieldMap.severity?.trim()
  if (severity) {
    keys.delete(severity)
  }
  return [...keys].sort((a, b) => a.localeCompare(b))
}

export function resolveLogsTimeColumn(fieldMap: Record<string, string>): string | undefined {
  return fieldMap.time || undefined
}
