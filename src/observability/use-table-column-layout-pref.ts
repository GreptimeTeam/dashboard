import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useAppStore } from '@/store'
import { bareTableName } from '@/utils/sql'
import {
  applyVisibleOrder,
  capLayoutMap,
  drainLegacyHidden,
  sanitizeLayoutMap,
  layoutEntriesEqual,
  resolveLayoutColumns,
  resolveLayoutOrder,
  toColumnLayoutEntry,
  type ColumnLayoutEntry,
  type ColumnLayoutMap,
} from './table-column-layout'

type ModernKey = 'logsTableColumns' | 'traceTableColumns'
type HiddenKey = 'logsTableHiddenColumns' | 'traceTableHiddenColumns'

/**
 * Per-table visibility + order prefs for Logs / Traces tables.
 *
 * Layouts are keyed by table (see `table-column-layout.ts`), so customizing one table
 * never hides another table's columns. A table without an entry shows every column in
 * schema order, and columns added to the schema later stay visible.
 *
 * Writes only happen on explicit user actions (panel toggle / header drag); reading a
 * table never persists anything, so browsing tables does not grow `uiConfig`.
 */
export default function useTableColumnLayoutPref(
  modernKey: ModernKey,
  legacyHiddenKey: HiddenKey,
  tableSource: MaybeRefOrGetter<string> = ''
) {
  const store = useAppStore()

  /** Bare table name so Logs Query and drilldown Logs share one layout per table. */
  const tableKey = computed(() => {
    const raw = (toValue(tableSource) || '').trim()
    return raw ? bareTableName(raw) || raw : ''
  })

  /** Untrusted storage: legacy/corrupt values are dropped instead of throwing. */
  const layoutMap = computed<ColumnLayoutMap>(() => sanitizeLayoutMap(store.getUiConfigValue(modernKey)))

  /** Released versions stored one global deny list; it applies until a table is customized. */
  const legacyHidden = computed<string[]>(() => {
    const stored = store.getUiConfigValue(legacyHiddenKey)
    return Array.isArray(stored) ? stored.filter((name): name is string => typeof name === 'string') : []
  })

  /** The current table's stored entry, if it was ever customized. */
  function entryForTable(): ColumnLayoutEntry | undefined {
    return tableKey.value ? layoutMap.value[tableKey.value] : undefined
  }

  /** Every column in display order (visible and hidden). */
  function orderedColumnsFor(columnNames: string[]): string[] {
    return resolveLayoutOrder(columnNames, entryForTable())
  }

  function displayedColumnsFor(columnNames: string[]): string[] {
    const entry = entryForTable()
    if (entry) {
      return resolveLayoutColumns(columnNames, entry)
    }
    if (!legacyHidden.value.length) {
      return columnNames.slice()
    }
    const hidden = new Set(legacyHidden.value)
    return columnNames.filter((name) => !hidden.has(name))
  }

  function hiddenColumnsFor(columnNames: string[]): string[] {
    const visible = new Set(displayedColumnsFor(columnNames))
    return columnNames.filter((name) => !visible.has(name))
  }

  function hiddenColumnCountFor(columnNames: string[]): number {
    return hiddenColumnsFor(columnNames).length
  }

  /**
   * Persist a layout for the current table. The default layout (everything visible,
   * schema order) deletes the entry rather than storing a full list.
   */
  function setColumnLayout(columnNames: string[], orderedNames: string[], visibleNames: string[]): void {
    const key = tableKey.value
    if (!key) {
      // No table identity yet (e.g. text mode before any query) — nothing to key on.
      return
    }
    const next = toColumnLayoutEntry(columnNames, orderedNames, visibleNames)
    const drainedLegacy = drainLegacyHidden(legacyHidden.value, columnNames)
    const legacyChanged = drainedLegacy.length !== legacyHidden.value.length
    if (layoutEntriesEqual(layoutMap.value[key], next) && !legacyChanged) {
      return
    }

    const nextMap: ColumnLayoutMap = { ...layoutMap.value }
    // Re-insert last so the map's key order doubles as recency for `capLayoutMap`.
    delete nextMap[key]
    if (next) {
      nextMap[key] = next
    }
    if (Object.keys(nextMap).length) {
      store.setUiConfigValue(modernKey, capLayoutMap(nextMap))
    } else {
      store.removeUiConfigKeys([modernKey])
    }

    if (legacyChanged) {
      if (drainedLegacy.length) {
        store.setUiConfigValue(legacyHiddenKey, drainedLegacy)
      } else {
        store.removeUiConfigKeys([legacyHiddenKey])
      }
    }
  }

  /** Visibility-only change (column panel checkboxes): keeps the stored order. */
  function setVisibleColumns(columnNames: string[], visibleNames: string[]): void {
    setColumnLayout(columnNames, orderedColumnsFor(columnNames), visibleNames)
  }

  /**
   * Header drag: `visibleOrdered` is the new grid order of the visible columns.
   * Hidden columns keep their slots in the full order.
   */
  function setColumnOrder(columnNames: string[], visibleOrdered: string[]): void {
    const fullOrder = orderedColumnsFor(columnNames)
    setColumnLayout(columnNames, applyVisibleOrder(fullOrder, visibleOrdered), visibleOrdered)
  }

  return {
    displayedColumnsFor,
    orderedColumnsFor,
    hiddenColumnsFor,
    hiddenColumnCountFor,
    setColumnLayout,
    setVisibleColumns,
    setColumnOrder,
  }
}
