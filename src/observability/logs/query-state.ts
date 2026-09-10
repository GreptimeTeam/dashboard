import type { QueryState } from '@/types/query'
import type { DrilldownContext } from '../context'

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

export { escapeSqlString }
