import type { QueryState } from '@/types/query'
import type { DrilldownContext } from '../context'
import { parseJsonFieldChipKey, sqlJsonGetStringExpr } from './json-field-keys'

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

/** Build a minimal QueryState that CountChart can use (only WHERE is consumed for volume SQL). */
export function buildCountChartQueryState(options: {
  table: string
  timeColumn: string
  whereSql: string
  ctx: DrilldownContext
  database?: string
}): QueryState {
  const { table, timeColumn, whereSql, ctx, database } = options
  const unixRange = ctx.unixTimeRange()
  const timeRangeValues =
    unixRange.length === 2 ? [`FROM_UNIXTIME(${unixRange[0]})`, `FROM_UNIXTIME(${unixRange[1]})`] : []

  const sql = `SELECT 1 FROM "${table}" WHERE ${whereSql}`

  return {
    table,
    orderBy: 'DESC',
    limit: 100,
    tsColumn: { name: timeColumn },
    editorType: 'text',
    timeRangeValues,
    time: ctx.time.value,
    rangeTime: [...ctx.rangeTime.value],
    sourceState: {
      table,
      orderBy: 'DESC',
      limit: 100,
      tsColumn: { name: timeColumn },
      sql,
      database,
    },
    sql,
    database,
    generateSql: () => sql,
  }
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/**
 * SQL expression for a logs label/role that may be a JSON attribute chip.
 *
 * Plain columns stay quoted identifiers; a chip (`resource_attributes.service.name`, the
 * shape semantics produce when the identity lives inside a JSON column) expands to
 * `json_get_string("resource_attributes", '$."service.name"')`.
 */
export function logsColumnExpr(column: string, columnNames: Iterable<string>): string {
  const name = column.trim()
  const names = new Set(columnNames)
  if (names.has(name)) {
    return quoteIdent(name)
  }
  const chip = parseJsonFieldChipKey(name, [...names])
  return chip ? sqlJsonGetStringExpr(chip.column, chip.path) : quoteIdent(name)
}

export { escapeSqlString }
