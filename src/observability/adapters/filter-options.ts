import editorApi from '@/api/editor'
import useTableSchemaStore from '@/store/modules/table-schema'
import { getLabelNames, getLabelValues } from '@/api/metrics'
import type { DrilldownContext } from '../context'
import { loadDrilldownSettings } from '../drilldown-settings'
import { buildPromMatchSelector, isGreptimePromMatchSelector, resolveFieldMapColumn, sqlValueLiteral } from '../filters'
import {
  discoverFieldColumns,
  discoverLabelColumns,
  discoverLogFilterKeys,
  discoverLogLabelKeys,
  discoverLogsContainsColumns,
  discoverLogsFilterKeyColumns,
  isLogsContainsFilterKey,
  listJsonAttributeColumns,
  parseJsonFieldChipKey,
  resolveLogsTimeColumn,
  sampleJsonAttributeFieldKeys,
  sqlJsonGetStringExpr,
  type SchemaColumn,
} from '../logs/field-map'
import { isOtelResourceLabelChip } from '../semantics'
import { discoverTraceFilterKeys } from '../traces/field-map'
import type { DrilldownFilter, DrilldownSignal } from '../types'

const INTERNAL_LABEL_PREFIX = '__'
const SQL_VALUE_LIMIT = 200

function promTimeParams(ctx: DrilldownContext): { start?: string; end?: string } {
  const unixRange = ctx.unixTimeRange()
  if (unixRange.length !== 2) {
    return {}
  }
  return {
    start: String(unixRange[0]),
    end: String(unixRange[1]),
  }
}

function asStringArray(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload.map(String).filter(Boolean)
  }
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const { data } = payload as { data?: unknown }
    return Array.isArray(data) ? data.map(String).filter(Boolean) : []
  }
  return []
}

function filterLabelKeys(keys: string[]): string[] {
  return [...new Set(keys)]
    .filter((key) => key && !key.startsWith(INTERNAL_LABEL_PREFIX))
    .sort((left, right) => left.localeCompare(right))
}

function filterOptions(keys: string[], search: string): string[] {
  const query = search.trim().toLowerCase()
  if (!query) {
    return keys
  }
  return keys.filter((key) => key.toLowerCase().includes(query))
}

function activeSignal(ctx: DrilldownContext): DrilldownSignal {
  return ctx.signal.value
}

function sqlTableForSignal(ctx: DrilldownContext, signal: DrilldownSignal): string | undefined {
  if (signal === 'logs') {
    return ctx.logsTable.value || undefined
  }
  if (signal === 'traces') {
    return ctx.tracesTable.value || undefined
  }
  return undefined
}

function fieldMapForSignal(ctx: DrilldownContext, signal: DrilldownSignal): Record<string, string> {
  if (signal === 'traces') {
    return ctx.fieldMap.value.traces
  }
  return ctx.fieldMap.value.logs
}

/**
 * Label keys for logs/traces top-bar suggest.
 * Same discovery as Labels Tab: discoverLabelColumns + drilldown-settings include/exclude.
 */
export async function fetchSqlLabelKeys(
  ctx: DrilldownContext,
  signal: 'logs' | 'traces' = 'logs',
  search = ''
): Promise<string[]> {
  const tableName = sqlTableForSignal(ctx, signal)
  if (!tableName) {
    return []
  }

  try {
    const columns = (await useTableSchemaStore().ensureTableSchema(
      tableName,
      ctx.databaseFor(signal)
    )) as SchemaColumn[]
    if (signal === 'traces') {
      // Traces expose every business field as a top-bar filter key (intrinsic + flattened
      // resource/span attributes + duration), not the v1 label subset.
      const keys = discoverTraceFilterKeys(columns)
      return filterOptions(filterLabelKeys(keys), search)
    }
    const fieldMap = fieldMapForSignal(ctx, signal)
    const settings = loadDrilldownSettings(ctx.logsDatabase.value).logs
    const keys = await discoverLogLabelKeys(tableName, columns, fieldMap, {
      include: settings?.labelInclude,
      exclude: settings?.labelExclude,
      identityChip: ctx.entityFilterKeys.value.logs?.service,
      database: ctx.logsDatabase.value,
    })
    return filterOptions(filterLabelKeys(keys), search)
  } catch (error) {
    console.error(`Failed to load ${signal} label keys:`, error)
    return []
  }
}

/**
 * Non-groupable columns plus JSON attribute keys. Kept for old fieldInclude/fieldExclude configs.
 */
export async function fetchSqlFieldKeys(ctx: DrilldownContext, search = ''): Promise<string[]> {
  const tableName = sqlTableForSignal(ctx, 'logs')
  if (!tableName) {
    return []
  }

  try {
    const columns = (await useTableSchemaStore().ensureTableSchema(tableName, ctx.logsDatabase.value)) as SchemaColumn[]
    const fieldMap = fieldMapForSignal(ctx, 'logs')
    const settings = loadDrilldownSettings(ctx.logsDatabase.value).logs
    const l1 = discoverFieldColumns(columns, fieldMap, {
      include: settings?.fieldInclude,
      exclude: settings?.fieldExclude,
      labelInclude: settings?.labelInclude,
      labelExclude: settings?.labelExclude,
    })
    const jsonColumns = listJsonAttributeColumns(columns)
    const l2 = (
      await sampleJsonAttributeFieldKeys(tableName, jsonColumns, { database: ctx.logsDatabase.value })
    ).filter((key) => !isOtelResourceLabelChip(key, jsonColumns))
    return filterOptions(filterLabelKeys([...l1, ...l2]), search)
  } catch (error) {
    console.error('Failed to load logs field keys:', error)
    return []
  }
}

function logsLabelOptions(fieldMapSettings?: { labelInclude?: string[]; labelExclude?: string[] }) {
  return {
    include: fieldMapSettings?.labelInclude,
    exclude: fieldMapSettings?.labelExclude,
  }
}

/** Non-label string columns. `=~` is contains and value suggest stays empty. */
export async function fetchLogsContainsKeyOptions(ctx: DrilldownContext): Promise<string[]> {
  const tableName = sqlTableForSignal(ctx, 'logs')
  if (!tableName) {
    return []
  }

  try {
    const columns = (await useTableSchemaStore().ensureTableSchema(tableName, ctx.logsDatabase.value)) as SchemaColumn[]
    const fieldMap = fieldMapForSignal(ctx, 'logs')
    const settings = loadDrilldownSettings(ctx.logsDatabase.value).logs
    return discoverLogsContainsColumns(columns, fieldMap, logsLabelOptions(settings))
  } catch (error) {
    console.error('Failed to load logs contains keys:', error)
    return []
  }
}

/** Logs top-bar keys: labels except severity, plus contains columns. Severity stays on the Level select. */
export async function fetchLogsFilterKeyOptions(ctx: DrilldownContext, search = ''): Promise<string[]> {
  const tableName = sqlTableForSignal(ctx, 'logs')
  if (!tableName) {
    return []
  }

  try {
    const columns = (await useTableSchemaStore().ensureTableSchema(tableName, ctx.logsDatabase.value)) as SchemaColumn[]
    const fieldMap = fieldMapForSignal(ctx, 'logs')
    const settings = loadDrilldownSettings(ctx.logsDatabase.value).logs
    const keys = await discoverLogFilterKeys(tableName, columns, fieldMap, {
      include: settings?.labelInclude,
      exclude: settings?.labelExclude,
      // Service keeps its own entry point (detail row / cross-signal chip), so it is not
      // offered again from the generic suggestion list.
      serviceKey: ctx.entityFilterKeys.value.logs?.service,
      database: ctx.logsDatabase.value,
    })
    return filterOptions(filterLabelKeys(keys), search)
  } catch (error) {
    console.error('Failed to load logs filter keys:', error)
    return []
  }
}

export async function fetchPromLabelKeys(ctx: DrilldownContext, search = ''): Promise<string[]> {
  const match = buildPromMatchSelector(ctx.filters.value, { metric: ctx.metric.value })
  const time = promTimeParams(ctx)

  try {
    const response = await getLabelNames({
      ...(isGreptimePromMatchSelector(match) ? { match } : {}),
      ...time,
      database: ctx.metricsDatabase.value,
    })
    return filterOptions(filterLabelKeys(asStringArray(response)), search)
  } catch (error) {
    console.error('Failed to load Prom label keys:', error)
    return []
  }
}

export async function fetchPromLabelValues(
  ctx: DrilldownContext,
  labelKey: string,
  search = ''
): Promise<{ values: string[]; manualOnly: boolean }> {
  const trimmedKey = labelKey.trim()
  if (!trimmedKey) {
    return { values: [], manualOnly: true }
  }

  const match = buildPromMatchSelector(ctx.filters.value, {
    excludeKey: trimmedKey,
    metric: ctx.metric.value,
  })

  if (!match || !isGreptimePromMatchSelector(match)) {
    return { values: [], manualOnly: true }
  }

  const time = promTimeParams(ctx)

  try {
    const response = await getLabelValues(trimmedKey, {
      match,
      ...time,
      database: ctx.metricsDatabase.value,
    })
    const values = filterOptions(asStringArray(response), search)
    return { values, manualOnly: false }
  } catch (error) {
    console.error(`Failed to load Prom label values for ${trimmedKey}:`, error)
    return { values: [], manualOnly: true }
  }
}

function resolveSqlSuggestColumn(
  chipKey: string,
  fieldMap: Record<string, string>,
  labelKeys: string[],
  jsonColumns: string[] = [],
  columns: string[] = []
): string | undefined {
  // Flattened attribute columns look like chips (`span_attributes.http.status_code`) but are
  // real columns on trace tables — the physical reading must win.
  if (columns.includes(chipKey)) {
    return chipKey
  }
  if (parseJsonFieldChipKey(chipKey, jsonColumns)) {
    // Sentinel: callers use parseJsonFieldChipKey for the real SQL expression.
    return chipKey
  }
  const mapped = resolveFieldMapColumn(chipKey, fieldMap)
  if (mapped) {
    return mapped
  }
  // Labels / Fields tabs use physical column names (or L2 chips) as chip keys.
  if (labelKeys.includes(chipKey)) {
    return chipKey
  }
  return undefined
}

function sqlValueSelectExpr(
  chipKey: string,
  columnName: string,
  jsonColumns: string[] = [],
  columns: string[] = []
): { selectExpr: string; nullCheck: string } {
  if (!columns.includes(columnName)) {
    const jsonChip = parseJsonFieldChipKey(chipKey, jsonColumns)
    if (jsonChip) {
      const expr = sqlJsonGetStringExpr(jsonChip.column, jsonChip.path)
      return { selectExpr: expr, nullCheck: `${expr} IS NOT NULL` }
    }
  }
  return { selectExpr: `"${columnName}"`, nullCheck: `"${columnName}" IS NOT NULL` }
}

function sqlFilterEqualsClause(
  filterKey: string,
  filterValue: string,
  fieldMap: Record<string, string>,
  labelKeys: string[],
  jsonColumns: string[],
  columns: string[],
  dataType?: string
): string | undefined {
  if (!columns.includes(filterKey)) {
    const jsonChip = parseJsonFieldChipKey(filterKey, jsonColumns)
    if (jsonChip) {
      const expr = sqlJsonGetStringExpr(jsonChip.column, jsonChip.path)
      return `${expr} = '${filterValue.replace(/'/g, "''")}'`
    }
  }
  const mapped = resolveFieldMapColumn(filterKey, fieldMap) || (labelKeys.includes(filterKey) ? filterKey : undefined)
  if (!mapped) {
    return undefined
  }
  // Typed columns need typed literals: `"flag" = 'true'` fails planning (Boolean = Utf8).
  const literal = sqlValueLiteral(dataType, filterValue)
  if (!literal) {
    return undefined
  }
  return `"${mapped}" = ${literal}`
}

export async function fetchSqlLabelValues(
  ctx: DrilldownContext,
  fieldKey: string,
  options?: { signal?: 'logs' | 'traces'; search?: string; labelKeys?: string[] }
): Promise<string[]> {
  const signal = options?.signal ?? 'logs'
  const search = options?.search ?? ''
  const tableName = sqlTableForSignal(ctx, signal)
  const trimmedKey = fieldKey.trim()
  if (!tableName || !trimmedKey) {
    return []
  }

  const fieldMap = fieldMapForSignal(ctx, signal)
  const labelKeys = options?.labelKeys ?? (await fetchSqlLabelKeys(ctx, signal, ''))
  let jsonColumns: string[] = []
  let columns: SchemaColumn[] = []
  try {
    columns = (await useTableSchemaStore().ensureTableSchema(tableName, ctx.databaseFor(signal))) as SchemaColumn[]
    jsonColumns = listJsonAttributeColumns(columns)
  } catch {
    // JSON column list is best-effort for value suggestions.
  }
  if (signal === 'logs') {
    const settings = loadDrilldownSettings(ctx.logsDatabase.value).logs
    const containsColumns = discoverLogsContainsColumns(columns, fieldMap, logsLabelOptions(settings))
    if (isLogsContainsFilterKey(trimmedKey, fieldMap, containsColumns)) {
      return []
    }
  }

  const columnNames = columns.map((column) => column.name)
  const columnTypes = new Map(columns.map((column) => [column.name, column.data_type || '']))
  const columnName = resolveSqlSuggestColumn(trimmedKey, fieldMap, labelKeys, jsonColumns, columnNames)
  if (!columnName) {
    return []
  }

  const { selectExpr, nullCheck } = sqlValueSelectExpr(trimmedKey, columnName, jsonColumns, columnNames)
  const unixRange = ctx.unixTimeRange()
  const whereParts = [nullCheck]

  if (unixRange.length === 2) {
    let timeColumn: string | undefined
    if (signal === 'logs') {
      timeColumn = resolveLogsTimeColumn(fieldMap)
    } else {
      timeColumn = fieldMap.time
      if (!timeColumn) {
        timeColumn = columns.find((column) => column.semantic_type === 'TIMESTAMP')?.name
      }
    }
    if (timeColumn) {
      whereParts.push(`"${timeColumn}" >= FROM_UNIXTIME(${unixRange[0]})`)
      whereParts.push(`"${timeColumn}" <= FROM_UNIXTIME(${unixRange[1]})`)
    }
  }

  ctx.filters.value.forEach((filter: DrilldownFilter) => {
    if (filter.key === trimmedKey || filter.op !== '=') {
      return
    }
    const clause = sqlFilterEqualsClause(
      filter.key,
      filter.value,
      fieldMap,
      labelKeys,
      jsonColumns,
      columnNames,
      columnTypes.get(filter.key)
    )
    if (clause) {
      whereParts.push(clause)
    }
  })

  const query = `SELECT DISTINCT ${selectExpr} FROM "${tableName}" WHERE ${whereParts.join(
    ' AND '
  )} LIMIT ${SQL_VALUE_LIMIT}`

  try {
    const response = await editorApi.runSQL(query, ctx.databaseFor(signal))
    const rows = response?.output?.[0]?.records?.rows
    if (!Array.isArray(rows)) {
      return []
    }
    const values = rows.map((row) => (Array.isArray(row) ? String(row[0] ?? '') : '')).filter(Boolean)
    return filterOptions([...new Set(values)], search)
  } catch (error) {
    console.error(`Failed to load SQL label values for ${trimmedKey}:`, error)
    return []
  }
}

/** @deprecated Use fetchSqlLabelValues */
export async function fetchSqlFieldValues(ctx: DrilldownContext, fieldKey: string, search = ''): Promise<string[]> {
  return fetchSqlLabelValues(ctx, fieldKey, { signal: 'logs', search })
}

/** Top-bar key suggest: routed by active signal (no Prom∪SQL merge). */
export async function fetchFilterKeyOptions(ctx: DrilldownContext, search = ''): Promise<string[]> {
  const signal = activeSignal(ctx)
  if (signal === 'metrics') {
    return fetchPromLabelKeys(ctx, search)
  }
  if (signal === 'traces') {
    return fetchSqlLabelKeys(ctx, 'traces', search)
  }
  return fetchLogsFilterKeyOptions(ctx, search)
}

/** Top-bar value assist: SQL DISTINCT on logs/traces label+field keys; metrics stay manual. */
export async function fetchFilterValueOptions(
  ctx: DrilldownContext,
  fieldKey: string,
  options?: { search?: string; labelKeys?: string[] }
): Promise<{ values: string[]; sqlAssist: boolean }> {
  const search = options?.search ?? ''
  const signal = activeSignal(ctx)
  if (signal === 'metrics') {
    return { values: [], sqlAssist: false }
  }

  const sqlSignal = signal === 'traces' ? 'traces' : 'logs'
  const keys =
    options?.labelKeys ??
    (sqlSignal === 'logs' ? await fetchLogsFilterKeyOptions(ctx, '') : await fetchSqlLabelKeys(ctx, sqlSignal, ''))
  const column = resolveSqlSuggestColumn(fieldKey.trim(), fieldMapForSignal(ctx, sqlSignal), keys)
  if (!column) {
    return { values: [], sqlAssist: false }
  }

  const sqlValues = await fetchSqlLabelValues(ctx, fieldKey, {
    signal: sqlSignal,
    search,
    labelKeys: keys,
  })
  return { values: sqlValues, sqlAssist: sqlValues.length > 0 }
}

export function canSuggestFilterValues(
  fieldKey: string,
  fieldMap: Record<string, string>,
  labelKeys: string[],
  containsKeys: string[] = []
): boolean {
  const trimmed = fieldKey.trim()
  if (isLogsContainsFilterKey(trimmed, fieldMap, containsKeys)) {
    return false
  }
  if (parseJsonFieldChipKey(trimmed)) {
    return true
  }
  return Boolean(resolveSqlSuggestColumn(trimmed, fieldMap, labelKeys))
}
