import { escapeSqlString, quoteIdent } from './query-state'

/** String operators from logs-query SQL builder. Not shared drilldown filter ops. */
export const LOGS_BODY_OPS = [
  'MATCH',
  'NOT MATCH',
  '=',
  '!=',
  'LIKE',
  'NOT LIKE',
  'IN',
  'NOT IN',
  'Exist',
  'Not Exist',
] as const

export type LogsBodyOp = (typeof LOGS_BODY_OPS)[number]

export const DEFAULT_LOGS_BODY_OP: LogsBodyOp = 'MATCH'

export function isLogsBodyOp(value: unknown): value is LogsBodyOp {
  return typeof value === 'string' && (LOGS_BODY_OPS as readonly string[]).includes(value)
}

export function logsBodyOpNeedsValue(op: LogsBodyOp): boolean {
  return op !== 'Exist' && op !== 'Not Exist'
}

function escapeSqlLike(value: string): string {
  return escapeSqlString(value).replace(/[%_\\]/g, '\\$&')
}

/** WHERE fragment for the logs-tab body box. Empty when the value is blank. */
export function logsBodyPredicate(column: string, op: LogsBodyOp, value: string): string | undefined {
  const left = quoteIdent(column)
  if (op === 'Exist') {
    return `${left} IS NOT NULL`
  }
  if (op === 'Not Exist') {
    return `${left} IS NULL`
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  if (op === 'MATCH' || op === 'NOT MATCH') {
    const predicate = `${left} @@ '${escapeSqlString(trimmed)}'`
    return op === 'NOT MATCH' ? `NOT ${predicate}` : predicate
  }
  if (op === 'LIKE' || op === 'NOT LIKE') {
    const pattern = `%${escapeSqlLike(trimmed)}%`
    const keyword = op === 'NOT LIKE' ? 'NOT LIKE' : 'LIKE'
    return `${left} ${keyword} '${pattern}' ESCAPE '\\'`
  }
  if (op === 'IN' || op === 'NOT IN') {
    const parts = trimmed
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    if (!parts.length) {
      return undefined
    }
    const list = parts.map((part) => `'${escapeSqlString(part)}'`).join(', ')
    return `${left} ${op} (${list})`
  }
  return `${left} ${op} '${escapeSqlString(trimmed)}'`
}
