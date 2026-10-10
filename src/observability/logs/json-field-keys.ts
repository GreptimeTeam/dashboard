/** Known OTel-style JSON attribute container column names. */
export const JSON_ATTRIBUTE_COLUMN_NAMES = [
  'log_attributes',
  'resource_attributes',
  'scope_attributes',
  'logattributes',
  'resourceattributes',
]

/** True when column name is a known / heuristic JSON attributes container. */
export function isJsonAttributeContainerName(name: string): boolean {
  const lower = name.toLowerCase()
  if (JSON_ATTRIBUTE_COLUMN_NAMES.some((col) => col.toLowerCase() === lower)) {
    return true
  }
  return lower.endsWith('_attributes') || lower.endsWith('attributes')
}

/**
 * Parse Field-filter chip key `{jsonColumn}.{topLevelKey}` (key may contain dots).
 * Matches longest known / heuristic / provided container column prefix.
 */
export function parseJsonFieldChipKey(
  chipKey: string,
  knownJsonColumns: string[] = []
): { column: string; path: string } | undefined {
  const trimmed = chipKey.trim()
  if (!trimmed.includes('.')) {
    return undefined
  }

  const candidates = new Set<string>([...JSON_ATTRIBUTE_COLUMN_NAMES, ...knownJsonColumns])
  const firstDot = trimmed.indexOf('.')
  if (firstDot > 0) {
    const maybeCol = trimmed.slice(0, firstDot)
    if (isJsonAttributeContainerName(maybeCol) || knownJsonColumns.includes(maybeCol)) {
      candidates.add(maybeCol)
    }
  }

  const sorted = [...candidates].sort((a, b) => b.length - a.length)
  const matched = sorted.find((col) => trimmed.startsWith(`${col}.`))
  if (!matched) {
    return undefined
  }
  const path = trimmed.slice(matched.length + 1)
  return path ? { column: matched, path } : undefined
}

/** SQL expression for a JSON attribute chip (top-level / dotted OTel keys). */
export function sqlJsonGetStringExpr(column: string, path: string): string {
  const escapedPath = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "''")
  return `json_get_string("${column}", '$."${escapedPath}"')`
}
