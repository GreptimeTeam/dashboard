import { UNKNOWN_LOG_LEVEL, normalizeLogLevelName } from './level-color'
import { escapeSqlString, quoteIdent } from './query-state'

export function isSeverityFilterColumn(column: string, fieldMap: Record<string, string>): boolean {
  const severity = fieldMap.severity?.trim()
  return Boolean(severity) && column === severity
}

/** Selected levels → SQL. `unknown` matches null and empty severity (the chart's gray series). */
export function buildSeverityLevelsPredicate(column: string, levels: string[]): string | undefined {
  const unique = [...new Set(levels.map((level) => normalizeLogLevelName(level)).filter(Boolean))]
  if (!unique.length) {
    return undefined
  }

  const known = unique.filter((level) => level !== UNKNOWN_LOG_LEVEL)
  const wantsUnknown = unique.includes(UNKNOWN_LOG_LEVEL)
  const ident = quoteIdent(column)
  const parts: string[] = []

  if (known.length === 1) {
    parts.push(`${ident} = '${escapeSqlString(known[0])}'`)
  } else if (known.length > 1) {
    const list = known.map((value) => `'${escapeSqlString(value)}'`).join(', ')
    parts.push(`${ident} IN (${list})`)
  }

  if (wantsUnknown) {
    parts.push(`(${ident} IS NULL OR ${ident} = '')`)
  }

  if (parts.length === 1) {
    return parts[0]
  }
  if (parts.length > 1) {
    return `(${parts.join(' OR ')})`
  }
  return undefined
}
