import { computed, ref, type Ref } from 'vue'

export type LogsTableColumnMode = 'separate' | 'merged' | 'merged-with-keys'

interface LogsTablePrefsState {
  mergeColumn: Ref<boolean>
  showKeys: Ref<boolean>
  displayedColumnsByTable: Ref<Record<string, string[]>>
  offeredColumnsByTable: Ref<Record<string, string[]>>
  compactRows: Ref<boolean>
}

/**
 * LogsTable display prefs.
 *
 * All of it is session-only (module state keyed by `storagePrefix`): single column,
 * show keys, compact rows, wrap, and column visibility. The log query page (`logquery`)
 * and the drilldown logs table (`drilldown-logs`) cannot leak into each other, and a
 * reload starts from the current schema instead of a stale column list.
 */
const stateByPrefix = new Map<string, LogsTablePrefsState>()

function stateFor(prefix: string, defaultMergeColumn: boolean): LogsTablePrefsState {
  const existing = stateByPrefix.get(prefix)
  if (existing) {
    return existing
  }
  const next: LogsTablePrefsState = {
    mergeColumn: ref(defaultMergeColumn),
    showKeys: ref(true),
    displayedColumnsByTable: ref({}),
    /** Columns already offered on this table. New query columns are shown; user hides stay hidden. */
    offeredColumnsByTable: ref({}),
    compactRows: ref(false),
  }
  stateByPrefix.set(prefix, next)
  return next
}

export default function useLogsTablePrefs(options?: { storagePrefix?: string; defaultMergeColumn?: boolean }) {
  const prefix = options?.storagePrefix ?? 'logquery'
  const session = stateFor(prefix, options?.defaultMergeColumn ?? true)
  const { mergeColumn, showKeys, compactRows, displayedColumnsByTable, offeredColumnsByTable } = session
  /** Wrap is session-only too. */
  const wrap = ref(false)

  const size = computed<'mini' | 'medium'>(() => (compactRows.value ? 'mini' : 'medium'))

  const columnMode = computed<LogsTableColumnMode>(() => {
    if (!mergeColumn.value) {
      return 'separate'
    }
    return showKeys.value ? 'merged-with-keys' : 'merged'
  })

  const columnModeKey = computed(() => columnMode.value)

  function displayedColumnsFor(tableName: string | undefined): string[] {
    if (!tableName) {
      return []
    }
    return displayedColumnsByTable.value[tableName] || []
  }

  /** Seed visible columns for a table when unset or empty. */
  function ensureDisplayedColumns(tableName: string | undefined, columnNames: string[]) {
    if (!tableName || !columnNames.length) {
      return
    }
    const current = displayedColumnsByTable.value[tableName]
    if (!current?.length) {
      displayedColumnsByTable.value = {
        ...displayedColumnsByTable.value,
        [tableName]: [...columnNames],
      }
    }
  }

  /**
   * Drilldown queries every schema column and defaults to multi-column mode: every column is
   * visible until the user hides one, and hides survive reloads. A column appears the first time
   * this table offers it. Log query uses `ensureDisplayedColumns` instead.
   *
   * A stored list with fewer than two usable columns counts as "nothing stored": earlier builds
   * seeded `['timestamp']` from a partial schema load (that is the one-column table), which is a
   * broken write rather than a preference. Names the schema no longer has are dropped.
   */
  function revealOfferedColumns(tableName: string | undefined, columnNames: string[]) {
    if (!tableName || !columnNames.length) {
      return
    }
    const offered = new Set(offeredColumnsByTable.value[tableName] || [])
    const stored = (displayedColumnsByTable.value[tableName] || []).filter((name) => columnNames.includes(name))
    const visible = new Set(stored.length > 1 ? stored : [])
    const firstOffer = offered.size === 0 || stored.length <= 1
    columnNames.forEach((name) => {
      if (firstOffer || !offered.has(name)) {
        visible.add(name)
      }
    })
    offeredColumnsByTable.value = {
      ...offeredColumnsByTable.value,
      [tableName]: [...columnNames],
    }
    displayedColumnsByTable.value = {
      ...displayedColumnsByTable.value,
      [tableName]: [...visible],
    }
  }

  return {
    mergeColumn,
    showKeys,
    displayedColumnsByTable,
    compactRows,
    wrap,
    size,
    columnMode,
    columnModeKey,
    displayedColumnsFor,
    ensureDisplayedColumns,
    revealOfferedColumns,
  }
}
