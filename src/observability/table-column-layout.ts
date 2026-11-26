/**
 * Per-table column layout: visibility + order, stored as a delta against the schema.
 *
 * Persisted shape (`uiConfig.logsTableColumns` / `traceTableColumns`):
 *
 *   { [table]: { hidden?: string[], order?: string[] } }
 *
 * - no entry  → table never customized → every column visible, schema order
 * - `hidden`  → names that are not shown; columns added to the schema later stay visible
 * - `order`   → full display order of *all* columns, visible and hidden, omitted when it
 *               matches the schema order. Hidden columns keep their slot, so dragging a
 *               hidden row in the column panel is remembered as well.
 * - unknown   → names that no longer exist are ignored on read and pruned on write
 * - invalid   → legacy/corrupt values are discarded on read (`sanitizeLayoutMap`) and
 *               replaced by the next write; reading them never throws
 *
 * Each entry only describes its own table, so a layout saved for one table can never
 * hide another table's columns. Entries are also collectable: resetting a table deletes
 * its entry, and `MAX_LAYOUT_TABLES` bounds how many tables are remembered.
 */

export interface ColumnLayoutEntry {
  /** Column names that are hidden. Empty/absent → nothing hidden. */
  hidden?: string[]
  /** Display order of every column (visible and hidden). Absent → schema order. */
  order?: string[]
}

export type ColumnLayoutMap = Record<string, ColumnLayoutEntry>

/** Upper bound on remembered tables (oldest write is evicted first). */
export const MAX_LAYOUT_TABLES = 50

/**
 * Read a persisted value as a layout map, discarding anything that is not valid.
 *
 * Storage is untrusted: the old `string[]` allowlist, a corrupted entry or a wrong
 * field type must never throw and must not take the rest of the map down with it.
 * Invalid tables/fields are dropped; the next user write replaces the whole value with
 * the sanitized map, so stale shapes heal themselves.
 */
export function sanitizeLayoutMap(value: unknown): ColumnLayoutMap {
  const map: ColumnLayoutMap = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return map
  }
  const names = (raw: unknown): string[] =>
    Array.isArray(raw) ? raw.filter((name): name is string => typeof name === 'string' && name.length > 0) : []
  Object.entries(value as Record<string, unknown>).forEach(([table, rawEntry]) => {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      return
    }
    const entry: ColumnLayoutEntry = {}
    const hiddenNames = names((rawEntry as ColumnLayoutEntry).hidden)
    if (hiddenNames.length) {
      entry.hidden = hiddenNames
    }
    const orderNames = names((rawEntry as ColumnLayoutEntry).order)
    if (orderNames.length) {
      entry.order = orderNames
    }
    if (entry.hidden || entry.order) {
      map[table] = entry
    }
  })
  return map
}

/**
 * Display order of every column for one table: stored order first, then columns added
 * after the layout was saved (schema order).
 */
export function resolveLayoutOrder(columnNames: string[], entry: ColumnLayoutEntry | undefined | null): string[] {
  const order = Array.isArray(entry?.order) ? entry.order : []
  if (!order.length) {
    return columnNames.slice()
  }
  const rank = new Map<string, number>()
  order.forEach((name, index) => {
    if (!rank.has(name)) {
      rank.set(name, index)
    }
  })
  const ordered = columnNames
    .filter((name) => rank.has(name))
    .sort((a, b) => (rank.get(a) as number) - (rank.get(b) as number))
  const appended = columnNames.filter((name) => !rank.has(name))
  return [...ordered, ...appended]
}

/** Visible columns for `columnNames`, in display order. */
export function resolveLayoutColumns(columnNames: string[], entry: ColumnLayoutEntry | undefined | null): string[] {
  if (!entry) {
    return columnNames.slice()
  }
  const hidden = new Set(Array.isArray(entry.hidden) ? entry.hidden : [])
  return resolveLayoutOrder(columnNames, entry).filter((name) => !hidden.has(name))
}

/**
 * Entry describing a layout, or `undefined` when it is the default (everything
 * visible, schema order) so callers can drop the entry instead of storing a full list.
 *
 * `orderedNames` is the full display order (visible + hidden), `visibleNames` the
 * subset that is shown.
 */
export function toColumnLayoutEntry(
  columnNames: string[],
  orderedNames: string[],
  visibleNames: string[]
): ColumnLayoutEntry | undefined {
  const current = new Set(columnNames)
  const seen = new Set<string>()
  const ordered: string[] = []
  orderedNames.forEach((name) => {
    if (current.has(name) && !seen.has(name)) {
      seen.add(name)
      ordered.push(name)
    }
  })
  // Defensive: a caller that forgot a name must not silently drop it from the layout.
  columnNames.forEach((name) => {
    if (!seen.has(name)) {
      seen.add(name)
      ordered.push(name)
    }
  })

  const visible = new Set(visibleNames.filter((name) => current.has(name)))
  const hidden = columnNames.filter((name) => !visible.has(name))
  const orderChanged =
    ordered.length !== columnNames.length || ordered.some((name, index) => name !== columnNames[index])
  if (!hidden.length && !orderChanged) {
    return undefined
  }
  const entry: ColumnLayoutEntry = {}
  if (hidden.length) {
    entry.hidden = hidden
  }
  if (orderChanged) {
    entry.order = ordered
  }
  return entry
}

/**
 * Re-apply a new visible order (e.g. from a header drag) to the full display order.
 * Slots that hold a hidden column keep the column and only visible slots are
 * reassigned, so hidden columns never move because of a header drag.
 */
export function applyVisibleOrder(fullOrder: string[], visibleOrder: string[]): string[] {
  const wanted = new Set(visibleOrder)
  const known = new Set(fullOrder)
  const result: string[] = []
  let cursor = 0
  fullOrder.forEach((name) => {
    if (!wanted.has(name)) {
      result.push(name)
      return
    }
    while (cursor < visibleOrder.length && !known.has(visibleOrder[cursor])) {
      cursor += 1
    }
    result.push(visibleOrder[cursor] ?? name)
    cursor += 1
  })
  const placed = new Set(result)
  visibleOrder.forEach((name) => {
    if (!placed.has(name)) {
      result.push(name)
    }
  })
  return result
}

function sameNames(a?: string[], b?: string[]): boolean {
  const left = Array.isArray(a) ? a : []
  const right = Array.isArray(b) ? b : []
  if (left.length !== right.length) {
    return false
  }
  return left.every((name, index) => name === right[index])
}

/** No-op guard so an unchanged layout does not rewrite `uiConfig`. */
export function layoutEntriesEqual(
  a: ColumnLayoutEntry | undefined | null,
  b: ColumnLayoutEntry | undefined | null
): boolean {
  return sameNames(a?.hidden, b?.hidden) && sameNames(a?.order, b?.order)
}

/**
 * Older versions stored one global deny list. Drop the current table's names from it
 * as each table is customized; the caller removes the key once it is empty.
 */
export function drainLegacyHidden(hidden: string[] | undefined | null, columnNames: string[]): string[] {
  if (!hidden?.length) {
    return []
  }
  const current = new Set(columnNames)
  return hidden.filter((name) => !current.has(name))
}

/** Keep the most recently written entries (object key order is insertion order). */
export function capLayoutMap(map: ColumnLayoutMap, max = MAX_LAYOUT_TABLES): ColumnLayoutMap {
  const keys = Object.keys(map)
  if (keys.length <= max) {
    return map
  }
  const next: ColumnLayoutMap = {}
  keys.slice(keys.length - max).forEach((key) => {
    next[key] = map[key]
  })
  return next
}
