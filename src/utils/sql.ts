import { format as sqlFormat } from 'sql-formatter'

export const parseSqlStatements = (sql: string): { text: string; start: number; end: number }[] => {
  if (!sql) return []

  const statements: { text: string; start: number; end: number }[] = []
  let currentStart = 0
  let inString = false
  let stringChar = ''
  let inSingleLineComment = false
  let inMultiLineComment = false

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]
    const nextChar = i < sql.length - 1 ? sql[i + 1] : ''

    // Handle end of single-line comment at newline
    if (inSingleLineComment && (char === '\n' || char === '\r')) {
      inSingleLineComment = false
    }

    // Check for end of multi-line comment
    if (inMultiLineComment && char === '*' && nextChar === '/') {
      inMultiLineComment = false
      i += 1 // Skip the closing '/'
    }

    // Check for start of comments
    if (char === '-' && nextChar === '-') {
      inSingleLineComment = true
      i += 1 // Skip the next '-'
    }

    if (char === '/' && nextChar === '*') {
      inMultiLineComment = true
      i += 1 // Skip the '*'
    }

    // Handle string literals to avoid detecting semicolons inside strings
    if ((char === "'" || char === '"') && (i === 0 || sql[i - 1] !== '\\')) {
      if (!inString) {
        inString = true
        stringChar = char
      } else if (char === stringChar) {
        inString = false
      }
    }

    // When we find a semicolon outside a string and outside comments, we've found a statement boundary
    if (char === ';' && !inString && !inSingleLineComment && !inMultiLineComment) {
      statements.push({
        text: sql.substring(currentStart, i + 1).trim(),
        start: currentStart,
        end: i,
      })
      currentStart = i + 1
    }
  }

  // Add the last statement if it doesn't end with a semicolon
  if (currentStart < sql.length) {
    statements.push({
      text: sql.substring(currentStart).trim(),
      start: currentStart,
      end: sql.length - 1,
    })
  }

  return statements
}

// Find which statement contains the cursor - pure function
export const findStatementAtPosition = (
  statements: { text: string; start: number; end: number }[],
  position: number
) => {
  // Check if cursor is exactly after a semicolon
  if (position > 0) {
    for (let i = 0; i < statements.length; i += 1) {
      if (statements[i].end === position - 1) {
        return { statement: statements[i], index: i }
      }
    }
  }

  // Regular case - find which statement contains our cursor
  const statement = statements.find((stmt) => position >= stmt.start && position <= stmt.end)
  if (statement) {
    return { statement, index: statements.indexOf(statement) }
  }

  return null
}

export const sqlFormatter = (code: string) => {
  try {
    const trimmed = code.trim()
    const isInsert = /^INSERT\s+INTO/i.test(trimmed)
    let formatted

    try {
      formatted = sqlFormat(trimmed, {
        language: 'postgresql',
        keywordCase: 'preserve',
        expressionWidth: isInsert ? 160 : 80, // Higher value for INSERT to avoid breaking VALUES
      })

      // Special post-processing for INSERT statements to keep VALUES on single line
      if (isInsert) {
        // Regex to find multi-line value groups and make them single line
        formatted = formatted.replace(
          /\(\s+(['"][^'"]*['"]|[^,)]+)\s*,\s*(['"][^'"]*['"]|[^,)]+)\s*(?:,\s*(['"][^'"]*['"]|[^,)]+)\s*)*\)/g,
          (match) => {
            // Convert newlines and excess spaces to a single space within the value group
            return match.replace(/\s+/g, ' ')
          }
        )
      }
      formatted = formatted.endsWith(';') ? formatted : `${formatted};`
    } catch (formattingError) {
      console.warn(`Failed to format SQL statement: ${formattingError}`)
      formatted = trimmed.endsWith(';') ? trimmed : `${trimmed};`
    }

    return formatted
  } catch (error) {
    console.error('SQL formatting error:', error)
    return code
  }
}

export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: number | null = null
  return (...args: Parameters<T>) => {
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(() => fn(...args), delay)
  }
}

/**
 * Replaces $timestart and $timeend placeholders in SQL string with actual timestamp values.
 * If time ranges are empty or incomplete, the placeholders are replaced with appropriate defaults.
 *
 * @param sql - The SQL string containing $timestart and $timeend placeholders
 * @param timeRanges - Array of time range values [startTs, endTs] or empty array
 * @returns SQL string with placeholders replaced
 */
export function replaceTimePlaceholders(sql: string, timeRanges: any[]): string {
  if (!sql) return sql

  let result = sql

  // Handle $timestart replacement
  if (result.includes('$timestart')) {
    if (timeRanges && timeRanges.length >= 1 && timeRanges[0]) {
      result = result.replace(/\$timestart/g, `${timeRanges[0]}`)
    } else {
      // Replace with a reasonable default (e.g., 24 hours ago)
      result = result.replace(/\$timestart/g, `now() - Interval '10m'`)
    }
  }

  // Handle $timeend replacement
  if (result.includes('$timeend')) {
    if (timeRanges && timeRanges.length >= 2 && timeRanges[1]) {
      result = result.replace(/\$timeend/g, `${timeRanges[1]}`)
    } else {
      // Replace with current timestamp as default

      result = result.replace(/\$timeend/g, `now()`)
    }
  }

  return result
}
