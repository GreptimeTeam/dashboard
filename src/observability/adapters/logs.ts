import editorApi from '@/api/editor'
import type { DrilldownContext } from '../context'
import { filtersToSqlWhere } from '../filters'

const RELATED_LOGS_PREVIEW_LIMIT = 100

async function resolveLogsTimeColumn(tableName: string): Promise<string | undefined> {
  try {
    const columns = await editorApi.getTableSchema(tableName)
    return columns.find((column) => column.semantic_type === 'TIMESTAMP')?.name
  } catch {
    return undefined
  }
}

export function canShowRelatedLogs(ctx: DrilldownContext): boolean {
  return ctx.filters.value.length > 0 && Boolean(ctx.logsTable.value)
}

export async function buildLogsWhere(ctx: DrilldownContext): Promise<string> {
  const tableName = ctx.logsTable.value
  if (!tableName) {
    return ''
  }

  const whereParts = filtersToSqlWhere(ctx.filters.value, ctx.fieldMap.value.logs)
  const unixRange = ctx.unixTimeRange()

  if (unixRange.length === 2) {
    const timeColumn = await resolveLogsTimeColumn(tableName)
    if (timeColumn) {
      whereParts.push(`"${timeColumn}" >= FROM_UNIXTIME(${unixRange[0]})`)
      whereParts.push(`"${timeColumn}" <= FROM_UNIXTIME(${unixRange[1]})`)
    }
  }

  if (!whereParts.length) {
    return ''
  }

  return whereParts.join(' AND ')
}

export async function relatedLogsCount(ctx: DrilldownContext): Promise<number> {
  const tableName = ctx.logsTable.value
  const where = await buildLogsWhere(ctx)
  if (!tableName || !where) {
    return 0
  }

  try {
    const response = await editorApi.runSQL(`SELECT COUNT(*) FROM "${tableName}" WHERE ${where}`)
    const rows = response?.output?.[0]?.records?.rows
    if (!Array.isArray(rows) || !Array.isArray(rows[0])) {
      return 0
    }
    return Number(rows[0][0]) || 0
  } catch (error) {
    console.error('Failed to count related logs:', error)
    return 0
  }
}

export async function relatedLogsPreview(
  ctx: DrilldownContext,
  limit = RELATED_LOGS_PREVIEW_LIMIT
): Promise<string[][]> {
  const tableName = ctx.logsTable.value
  const where = await buildLogsWhere(ctx)
  if (!tableName || !where) {
    return []
  }

  try {
    const columns = await editorApi.getTableSchema(tableName)
    const timeColumn = columns.find((column) => column.semantic_type === 'TIMESTAMP')?.name
    const bodyColumn =
      columns.find((column) => column.name === 'body' || column.name === 'log_body')?.name ??
      columns.find((column) => column.semantic_type === 'FIELD')?.name

    const selectColumns = [timeColumn, bodyColumn].filter(Boolean) as string[]
    if (!selectColumns.length) {
      selectColumns.push(columns[0]?.name ?? '1')
    }

    const query = `SELECT ${selectColumns
      .map((col) => `"${col}"`)
      .join(', ')} FROM "${tableName}" WHERE ${where} LIMIT ${limit}`
    const response = await editorApi.runSQL(query)
    const rows = response?.output?.[0]?.records?.rows
    return Array.isArray(rows) ? rows.map((row) => (Array.isArray(row) ? row.map(String) : [])) : []
  } catch (error) {
    console.error('Failed to preview related logs:', error)
    return []
  }
}
