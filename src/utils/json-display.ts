/** GreptimeDB Json / Json2 column data_type (server string; case-insensitive). */
export function isJsonDataType(dataType?: string | null): boolean {
  if (!dataType) return false
  const normalized = dataType.toLowerCase()
  return normalized === 'json' || normalized === 'json2'
}

/** Values treated as empty for JSON display (hide-empty). */
export function isEmptyJsonValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return false
}

/**
 * Recursively drop empty values: `null` / `undefined` / `''` / `[]` / `{}`,
 * including nested keys that become empty after stripping children.
 */
export function stripEmptyValues(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return value
  if (Array.isArray(value)) {
    return value.map((item) => stripEmptyValues(item)).filter((item) => !isEmptyJsonValue(item))
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      const next = stripEmptyValues(child)
      if (isEmptyJsonValue(next)) return
      result[key] = next
    })
    return result
  }
  return value
}

/** @deprecated Use `stripEmptyValues` — empty means null/undefined/''/[]/{} */
export function stripNullKeys(value: unknown): unknown {
  return stripEmptyValues(value)
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
export function stringifyJsonForDisplay(
  value: unknown,
  options?: { hideEmpty?: boolean; /** @deprecated use hideEmpty */ hideNulls?: boolean; pretty?: boolean }
): string {
  if (value === null || value === undefined) return ''

  let prepared: unknown = typeof value === 'string' ? tryParseJsonText(value) : value
  const hideEmpty = options?.hideEmpty ?? options?.hideNulls
  if (hideEmpty) {
    prepared = stripEmptyValues(prepared)
    // Whole-cell `{}` / `[]` (or everything stripped away) should render blank, not "{}".
    if (isEmptyJsonValue(prepared)) {
      return ''
    }
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
