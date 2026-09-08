import editorApi from '@/api/editor'
import { getLabelNames, getLabelValues } from '@/api/metrics'
import { buildPromMatchSelector, isGreptimePromMatchSelector } from '../filters'
import type { DrilldownContext } from '../context'
import type { DrilldownFilter } from '../types'

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

function resolveSqlColumn(fieldKey: string, fieldMap: Record<string, string>): string {
  return fieldMap[fieldKey] ?? fieldKey
}

function reverseFieldMap(fieldMap: Record<string, string>): Map<string, string> {
  const reversed = new Map<string, string>()
  Object.entries(fieldMap).forEach(([chipKey, columnName]) => {
    if (columnName) {
      reversed.set(columnName, chipKey)
    }
  })
  return reversed
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

export async function fetchSqlFieldKeys(ctx: DrilldownContext, search = ''): Promise<string[]> {
  const tableName = ctx.logsTable.value
  if (!tableName) {
    return []
  }

  try {
    const columns = await editorApi.getTableSchema(tableName)
    const reversed = reverseFieldMap(ctx.fieldMap.value.logs)
    const keys = columns
      .filter((column) => column.semantic_type === 'TAG' || column.semantic_type === 'FIELD')
      .map((column) => reversed.get(column.name) ?? column.name)

    return filterOptions(filterLabelKeys(keys), search)
  } catch (error) {
    console.error('Failed to load SQL field keys:', error)
    return []
  }
}

export async function fetchSqlFieldValues(ctx: DrilldownContext, fieldKey: string, search = ''): Promise<string[]> {
  const tableName = ctx.logsTable.value
  const trimmedKey = fieldKey.trim()
  if (!tableName || !trimmedKey) {
    return []
  }

  const columnName = resolveSqlColumn(trimmedKey, ctx.fieldMap.value.logs)
  const unixRange = ctx.unixTimeRange()
  const whereParts = [`"${columnName}" IS NOT NULL`]

  if (unixRange.length === 2) {
    try {
      const columns = await editorApi.getTableSchema(tableName)
      const timeColumn = columns.find((column) => column.semantic_type === 'TIMESTAMP')?.name
      if (timeColumn) {
        whereParts.push(`"${timeColumn}" >= FROM_UNIXTIME(${unixRange[0]})`)
        whereParts.push(`"${timeColumn}" <= FROM_UNIXTIME(${unixRange[1]})`)
      }
    } catch {
      // Time narrowing is best-effort for value suggestions.
    }
  }

  ctx.filters.value.forEach((filter: DrilldownFilter) => {
    if (filter.key === trimmedKey || filter.op !== '=') {
      return
    }
    const sqlColumn = resolveSqlColumn(filter.key, ctx.fieldMap.value.logs)
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
    console.error(`Failed to load SQL field values for ${trimmedKey}:`, error)
    return []
  }
}

export async function fetchFilterKeyOptions(ctx: DrilldownContext, search = ''): Promise<string[]> {
  const [promKeys, sqlKeys] = await Promise.all([fetchPromLabelKeys(ctx, search), fetchSqlFieldKeys(ctx, search)])
  return filterOptions([...new Set([...promKeys, ...sqlKeys])], search)
}

/** Top-bar value assist: SQL DISTINCT only when logsTable is configured. */
export async function fetchFilterValueOptions(
  ctx: DrilldownContext,
  fieldKey: string,
  search = ''
): Promise<{ values: string[]; sqlAssist: boolean }> {
  if (!ctx.logsTable.value) {
    return { values: [], sqlAssist: false }
  }

  const sqlValues = await fetchSqlFieldValues(ctx, fieldKey, search)
  return { values: sqlValues, sqlAssist: sqlValues.length > 0 }
}
