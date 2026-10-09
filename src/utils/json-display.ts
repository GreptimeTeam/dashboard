/** GreptimeDB Json / Json2 column data_type (server string; case-insensitive). */
export function isJsonDataType(dataType?: string | null): boolean {
  if (!dataType) return false
  const normalized = dataType.toLowerCase()
  return normalized === 'json' || normalized === 'json2'
}

/** Recursively drop object keys whose value is `null`. Arrays keep null elements. */
export function stripNullKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) {
    return value.map((item) => stripNullKeys(item))
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      if (child === null) return
      result[key] = stripNullKeys(child)
    })
    return result
  }
  return value
}

function tryParseJsonText(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return value
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

/**
 * Format a cell value for JSON / JSON2 display.
 * Non-object values pass through as String; objects are stringified.
 */
export function stringifyJsonForDisplay(value: unknown, options?: { hideNulls?: boolean; pretty?: boolean }): string {
  if (value === null || value === undefined) return ''

  let prepared: unknown = typeof value === 'string' ? tryParseJsonText(value) : value
  if (options?.hideNulls) {
    prepared = stripNullKeys(prepared)
  }

  if (typeof prepared === 'object' && prepared !== null) {
    try {
      return JSON.stringify(prepared, null, options?.pretty ? 2 : undefined)
    } catch {
      return String(prepared)
    }
  }

  return String(prepared)
}
