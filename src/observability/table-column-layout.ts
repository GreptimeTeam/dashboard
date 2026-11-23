/**
 * Single-array column layout: an ordered list of *visible* column names.
 *
 * - `undefined` / missing → never configured → show all `columnNames` in schema order
 * - `[]` → nothing visible for the current table
 * - `['b','a']` → show those (intersection) in that order; other current-schema names are hidden
 *
 * Names that belong to other tables stay in the stored list on write so switching
 * tables does not wipe prior layout memory.
 */

/** Resolve visible columns for the current schema from the stored allowlist. */
export function displayedColumnsFor(columnNames: string[], stored: string[] | undefined | null): string[] {
  if (stored === undefined || stored === null) {
    return columnNames.slice()
  }
  const current = new Set(columnNames)
  return stored.filter((name) => current.has(name))
}

/**
 * Replace the current table's visible ordered names while preserving names that
 * belong to other tables.
 */
export function mergeDisplayedColumns(
  columnNames: string[],
  visibleOrdered: string[],
  previous: string[] | undefined | null
): string[] {
  const current = new Set(columnNames)
  const nextVisible = visibleOrdered.filter((name) => current.has(name))
  const other = (previous ?? []).filter((name) => !current.has(name))
  return [...new Set([...nextVisible, ...other])]
}

/**
 * Panel list order: currently visible names first (stored order), then hidden
 * names in schema order.
 */
export function panelColumnOrder(columnNames: string[], visibleOrdered: string[]): string[] {
  const visibleSet = new Set(visibleOrdered)
  const visible = visibleOrdered.filter((name) => visibleSet.has(name) && columnNames.includes(name))
  const hidden = columnNames.filter((name) => !visibleSet.has(name))
  return [...visible, ...hidden]
}

/** Startup migration: order minus hidden. Only-hidden → undefined (lazy legacy read). */
export function migrateLegacyColumnLayout(
  hidden: string[] | undefined | null,
  order: string[] | undefined | null
): string[] | undefined {
  if (!order?.length) {
    return undefined
  }
  const hiddenSet = new Set(hidden ?? [])
  return order.filter((name) => !hiddenSet.has(name))
}

/**
 * Legacy denylist + optional order (pre-unified storage). Used only while the
 * modern allowlist key is still missing.
 */
export function displayedColumnsFromLegacy(
  columnNames: string[],
  hidden: string[] | undefined | null,
  order: string[] | undefined | null
): string[] {
  const hiddenSet = new Set(hidden ?? [])
  const visible = columnNames.filter((name) => !hiddenSet.has(name))
  if (!order?.length) {
    return visible
  }
  const rank = new Map(order.map((name, index) => [name, index]))
  return [...visible].sort((a, b) => {
    const ra = rank.get(a)
    const rb = rank.get(b)
    const rankA = ra === undefined ? Number.POSITIVE_INFINITY : ra
    const rankB = rb === undefined ? Number.POSITIVE_INFINITY : rb
    if (rankA !== rankB) {
      return rankA - rankB
    }
    return visible.indexOf(a) - visible.indexOf(b)
  })
}
