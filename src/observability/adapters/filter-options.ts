import editorApi from '@/api/editor'
import { getLabelNames, getLabelValues } from '@/api/metrics'
import type { DrilldownContext } from '../context'
import { loadDrilldownSettings } from '../drilldown-settings'
import { buildPromMatchSelector, isGreptimePromMatchSelector, resolveFieldMapColumn } from '../filters'
import { discoverLabelColumns, resolveLogsTimeColumn, type SchemaColumn } from '../logs/field-map'
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
    const columns = (await editorApi.getTableSchema(tableName)) as SchemaColumn[]
    const fieldMap = fieldMapForSignal(ctx, signal)
    const settings = signal === 'logs' ? loadDrilldownSettings().logs : undefined
    const keys = discoverLabelColumns(columns, fieldMap, {
      include: settings?.labelInclude,
      exclude: settings?.labelExclude,
    })
    return filterOptions(filterLabelKeys(keys), search)
  } catch (error) {
    console.error(`Failed to load ${signal} label keys:`, error)
    return []
  }
}

/** @deprecated Use fetchSqlLabelKeys — top-bar is label-only, not all TAG|FIELD. */
export async function fetchSqlFieldKeys(ctx: DrilldownContext, search = ''): Promise<string[]> {
  return fetchSqlLabelKeys(ctx, 'logs', search)
}

export async function fetchPromLabelKeys(ctx: DrilldownContext, search = ''): Promise<string[]> {
  const match = buildPromMatchSelector(ctx.filters.value, { metric: ctx.metric.value })
  const time = promTimeParams(ctx)

  try {
    const response = await getLabelNames({
      ...(isGreptimePromMatchSelector(match) ? { match } : {}),
      ...time,
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
  labelKeys: string[]
): string | undefined {
  const mapped = resolveFieldMapColumn(chipKey, fieldMap)
  if (mapped) {
    return mapped
  }
  // Labels Tab uses physical column names as chip keys.
  if (labelKeys.includes(chipKey)) {
    return chipKey
  }
  return undefined
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
  const columnName = resolveSqlSuggestColumn(trimmedKey, fieldMap, labelKeys)
  if (!columnName) {
    return []
  }

  const unixRange = ctx.unixTimeRange()
  const whereParts = [`"${columnName}" IS NOT NULL`]

  if (unixRange.length === 2) {
    let timeColumn: string | undefined
    if (signal === 'logs') {
      timeColumn = resolveLogsTimeColumn(fieldMap)
    } else {
      timeColumn = fieldMap.time
      if (!timeColumn) {
        try {
          const columns = await editorApi.getTableSchema(tableName)
          timeColumn = columns.find((column) => column.semantic_type === 'TIMESTAMP')?.name
        } catch {
          // Time narrowing is best-effort for value suggestions.
        }
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
    const sqlColumn = resolveSqlSuggestColumn(filter.key, fieldMap, labelKeys)
    if (!sqlColumn) {
      return
    }
    whereParts.push(`"${sqlColumn}" = '${filter.value.replace(/'/g, "''")}'`)
  })

  const query = `SELECT DISTINCT "${columnName}" FROM "${tableName}" WHERE ${whereParts.join(
    ' AND '
  )} LIMIT ${SQL_VALUE_LIMIT}`

  try {
    const response = await editorApi.runSQL(query)
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
  return fetchSqlLabelKeys(ctx, 'logs', search)
}

/** Top-bar value assist: SQL DISTINCT on logs/traces labels; metrics stay manual. */
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
  const keys = options?.labelKeys ?? (await fetchSqlLabelKeys(ctx, sqlSignal, ''))
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
  labelKeys: string[]
): boolean {
  return Boolean(resolveSqlSuggestColumn(fieldKey.trim(), fieldMap, labelKeys))
}
