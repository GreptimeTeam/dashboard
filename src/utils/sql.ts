export const parseSqlStatements = (sql: string): { text: string; start: number; end: number }[] => {
  if (!sql) return []

  const statements: { text: string; start: number; end: number }[] = []
  let currentStart = 0
  let inString = false
  let stringChar = ''

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]

    // Handle string literals to avoid detecting semicolons inside strings
    if ((char === "'" || char === '"') && (i === 0 || sql[i - 1] !== '\\')) {
      if (!inString) {
        inString = true
        stringChar = char
      } else if (char === stringChar) {
        inString = false
      }
    }

    // When we find a semicolon outside a string, we've found a statement boundary
    if (char === ';' && !inString) {
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

export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: number | null = null
  return (...args: Parameters<T>) => {
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(() => fn(...args), delay)
  }
}
