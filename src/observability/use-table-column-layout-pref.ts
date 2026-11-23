import { computed } from 'vue'
import { useAppStore } from '@/store'
import type { UiConfig } from '@/store/modules/app/types'
import { displayedColumnsFor, displayedColumnsFromLegacy, mergeDisplayedColumns } from './table-column-layout'

type ModernKey = 'logsTableColumns' | 'traceTableColumns'
type HiddenKey = 'logsTableHiddenColumns' | 'traceTableHiddenColumns'
type OrderKey = 'logsTableColumnOrder' | 'traceTableColumnOrder'

/**
 * Shared allowlist prefs for Logs / Traces column visibility + order (one string[]).
 */
export default function useTableColumnLayoutPref(
  modernKey: ModernKey,
  legacyHiddenKey: HiddenKey,
  legacyOrderKey: OrderKey
) {
  const store = useAppStore()

  const stored = computed(() => store.getUiConfigValue(modernKey) as string[] | undefined)

  function resolveVisible(columnNames: string[]): string[] {
    const modern = stored.value
    if (modern !== undefined) {
      return displayedColumnsFor(columnNames, modern)
    }
    return displayedColumnsFromLegacy(
      columnNames,
      store.getUiConfigValue(legacyHiddenKey),
      store.getUiConfigValue(legacyOrderKey)
    )
  }

  function clearLegacyKeys() {
    store.removeUiConfigKeys([legacyHiddenKey, legacyOrderKey])
  }

  /**
   * Persist the current table's visible ordered names. Always writes the modern key
   * (including `[]` for deselect-all) and drops legacy hidden/order fields.
   */
  function setDisplayedColumns(columnNames: string[], visibleOrdered: string[]): void {
    const next = mergeDisplayedColumns(columnNames, visibleOrdered, stored.value)
    store.setUiConfigValue(modernKey, next as UiConfig[typeof modernKey])
    clearLegacyKeys()
  }

  function displayedColumnsForNames(columnNames: string[]): string[] {
    return resolveVisible(columnNames)
  }

  function hiddenColumnsFor(columnNames: string[]): string[] {
    const visible = new Set(resolveVisible(columnNames))
    return columnNames.filter((name) => !visible.has(name))
  }

  function hiddenColumnCountFor(columnNames: string[]): number {
    return hiddenColumnsFor(columnNames).length
  }

  function setVisibleColumns(columnNames: string[], visible: string[]): void {
    const visibleSet = new Set(visible)
    const currentOrdered = resolveVisible(columnNames)
    const kept = currentOrdered.filter((name) => visibleSet.has(name))
    const added = visible.filter((name) => columnNames.includes(name) && !kept.includes(name))
    setDisplayedColumns(columnNames, [...kept, ...added])
  }

  /** Header / panel reorder: `orderedVisible` is the full new visible set for this schema. */
  function setColumnOrder(columnNames: string[], orderedVisible: string[]): void {
    setDisplayedColumns(
      columnNames,
      orderedVisible.filter((name) => columnNames.includes(name))
    )
  }

  function showAllColumns(columnNames: string[]): void {
    setDisplayedColumns(columnNames, columnNames.slice())
  }

  function hideAllColumns(columnNames: string[]): void {
    setDisplayedColumns(columnNames, [])
  }

  return {
    stored,
    displayedColumnsFor: displayedColumnsForNames,
    orderedVisibleColumnsFor: displayedColumnsForNames,
    visibleColumnsFor: displayedColumnsForNames,
    hiddenColumnsFor,
    hiddenColumnCountFor,
    setDisplayedColumns,
    setVisibleColumns,
    setColumnOrder,
    showAllColumns,
    hideAllColumns,
  }
}
