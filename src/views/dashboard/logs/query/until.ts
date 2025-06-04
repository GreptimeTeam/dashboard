import dayjs from 'dayjs'
import type { SchemaType } from '@/store/modules/code-run/types'
import { TSColumn } from './types'

function findWhereClausePosition(sql: string) {
  // Normalize case for easier comparison
  const upperSql = sql.toUpperCase()

  // Find the first keyword after FROM where WHERE should go before
  const groupByIndex = upperSql.indexOf('GROUP BY')
  const orderByIndex = upperSql.indexOf('ORDER BY')
  const limitIndex = upperSql.indexOf('LIMIT')

  // Find the position to insert WHERE clause:
  // Insert before GROUP BY, ORDER BY, or LIMIT, whichever comes first
  let insertPosition = upperSql.length // Default to end of the query if no keywords

  if (groupByIndex !== -1 && groupByIndex < insertPosition) {
    insertPosition = groupByIndex
  }

  if (orderByIndex !== -1 && orderByIndex < insertPosition) {
    insertPosition = orderByIndex
  }

  if (limitIndex !== -1 && limitIndex < insertPosition) {
    insertPosition = limitIndex
  }

  return insertPosition
}

export function parseWhereCondition(sql: string) {
  // 正则表达式：匹配字段、操作符和值
  const conditionRegex = /(\w+)\s*(=|>|<|>=|<=|!=|like)\s*('(?:[^']|\\')*'|\d+)/g
  // 解析所有条件
  const conditions = []
  let match = conditionRegex.exec(sql)
  while (match !== null) {
    const field = match[1]
    const operator = match[2]
    let value = match[3]

    // 去除引号（如果值是字符串）
    if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1)
    }
    conditions.push({ field, operator, value })
    match = conditionRegex.exec(sql)
  }
  return conditions
}

export function getWhereClause(sql: string) {
  // This regex will match "WHERE" in any case and capture everything until GROUP BY, ORDER BY, LIMIT, or end of the string.
  const whereMatch = sql.match(/\bWHERE\b([\s\S]*?)(\bGROUP BY\b|\bORDER BY\b|\bLIMIT\b|$)/i)
  return whereMatch ? whereMatch[1].trim() : ''
}

export function addTsCondition(sql: string, column: string, start: number | string, end: number | string) {
  const upperSql = sql.toUpperCase()
  let whereIndex = upperSql.indexOf('WHERE')
  let replaceSql = sql.trim()
  if (whereIndex > -1) {
    if (end) {
      const lessRegex = new RegExp(`(${column}\\s*[<=]*\\s*)(\\d+|\\s*now\\(\\))`, 'g')
      if (lessRegex.test(replaceSql)) {
        replaceSql = replaceSql.replace(lessRegex, (match, prefix) => {
          return `${prefix}${end}`
        })
      } else {
        replaceSql = `${replaceSql.slice(0, whereIndex + 5)} ${column} < ${end} and ${replaceSql.slice(whereIndex + 5)}`
      }
    }

    if (start) {
      const moreRegex = new RegExp(`(${column}\\s*[>=]*\\s*)(\\d+|[\\S\\s]*Interval '\\d+\\s*m')`, 'g')
      // Use the regex to replace the matched number with `newValue`
      if (moreRegex.test(replaceSql)) {
        replaceSql = replaceSql.replace(moreRegex, (match, prefix) => {
          return `${prefix}${start}`
        })
      } else {
        replaceSql = `${replaceSql.slice(0, whereIndex + 5)} ${column} >= ${start} and ${replaceSql.slice(
          whereIndex + 5
        )}`
      }
    }

    return replaceSql
  }
  whereIndex = findWhereClausePosition(sql)
  return `${sql.slice(0, whereIndex - 1)} WHERE ${column} >= ${start} and ${column} < ${end} ${sql.slice(whereIndex)}`
}

export const TableNameReg = /(?<=from|FROM)\s+([^\s;]+)/
export function parseTable(sql: string) {
  const result = sql.match(TableNameReg)
  if (result && result.length) {
    const arr = result[1].trim().split('.')
    return arr[arr.length - 1]
  }
  return ''
}

export function parseTimeRange(sql: string, tsColumn: string, multiple: number): string[] | number {
  const lessRegex = new RegExp(`${tsColumn}\\s*[<=]*\\s*(\\d+)`, 'g')
  const moreRegex = new RegExp(`${tsColumn}\\s*[>=]*\\s*(\\d+|[\\S\\s]*Interval '\\d+\\s*m')`, 'g')
  const intervalRe = /Interval '(\d+)m'/
  const parseResult = []
  const moreResult = moreRegex.exec(sql)
  if (moreResult) {
    const interval = intervalRe.exec(moreResult[1])
    if (interval) {
      return Number(interval[1])
    }
    parseResult.push(Number(moreResult[1]) / multiple)
  }
  const lessResult = lessRegex.exec(sql)
  if (lessResult) {
    parseResult.push(Number(lessResult[1]) / multiple)
  }

  return parseResult.map((v) => String(v))
}

export function calculateInterval(start: number, end: number) {
  const startTime = new Date(start).getTime()
  const endTime = new Date(end).getTime()
  const totalSeconds = Math.floor((endTime - startTime) / 120) * 120
  // Calculate interval in seconds
  return Math.max(1, Math.floor(totalSeconds / 120))
}

// use basetime to sync with real time
// start,end  unix
// return unix
export function generateTimeRange(
  start: number,
  end: number,
  intervalSeconds: number,
  basetime: number,
  multiple: number
) {
  // return []
  if (start === 0) {
    return []
  }
  start *= multiple
  end *= multiple
  if (start === end) {
    return [start, end]
  }
  let current = basetime > start ? basetime : start
  const result = []
  while (current >= start) {
    result.push(current)
    current -= intervalSeconds * multiple
  }
  current = basetime + intervalSeconds * multiple
  while (current <= end) {
    result.push(current)
    current += intervalSeconds * multiple
  }
  return result
}

export function toMs(time: number, multiple: number) {
  const timescale = (String(multiple).length - 1) / 3
  if (timescale === 0) {
    return time * 1000
  }
  if (timescale === 1) {
    return time
  }
  return time / 1000 ** (timescale - 1)
}

export const TimeTypes = {
  TimestampSecond: 1,
  TimestampMillisecond: 1000,
  TimestampMicroSecond: 1000 * 1000,
  TimestampNanosecond: 1000 * 1000 * 1000,
}

export type TimeType = keyof typeof TimeTypes

export function toDateStr(time: number, multiple: number, format?: string) {
  // const multiple = TimeTypes[type]
  const ms = toMs(time, multiple)
  return dayjs(ms).format(format || 'YYYY-MM-DD HH:mm:ss.SSS')
}

const LIMIT_RE = /LIMIT\s+(\d+)/

export function processSQL(sql: string, tsColumn: string | undefined, limit: number) {
  let orderByClause = ''
  const upperSql = sql.toUpperCase()
  if (upperSql.indexOf('ORDER BY') === -1 && tsColumn) {
    orderByClause = ` ORDER BY ${tsColumn} DESC`
  }
  // Check if LIMIT exists
  const limitMatch = sql.match(/\bLIMIT\b/i)

  if (limitMatch) {
    // Insert ORDER BY before LIMIT
    const { index } = limitMatch
    return `${sql.slice(0, index - 1)}${orderByClause} ${sql.slice(index)}`
  }

  return `${sql}${orderByClause} LIMIT ${limit}`.trim()
}

export function parseLimit(sql: string) {
  const upperSql = sql.toUpperCase()
  const limitResult = LIMIT_RE.exec(upperSql)
  if (limitResult) {
    return Number(limitResult[1])
  }
  return 1000
}

export function parseOrderBy(sql: string) {
  const match = sql.match(/ORDER BY\s+\w+\s+(desc|asc)+/i)
  return match ? match[1] : null
}

export function toObj(row: any, columns: Array<SchemaType>, index: number, tsColumn: TSColumn) {
  const obj = {} as any
  obj.index = index
  for (let i = 0; i < columns.length; i += 1) {
    const column = columns[i]
    obj[column.name] = row[i]
  }
  obj.key = index
  return obj
}
