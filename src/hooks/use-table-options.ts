import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import editorAPI from '@/api/editor'
import { listBySignal, listSignalTables } from '@/observability/semantics'

export type TableSignal = 'logs' | 'traces'

export interface UseTableOptionsOptions {
  database: MaybeRefOrGetter<string | undefined>
  signal?: MaybeRefOrGetter<TableSignal | undefined>
  limit?: number
}

export const TABLE_OPTION_LIMIT = 500

function unique(names: string[]): string[] {
  return Array.from(new Set(names.filter(Boolean)))
}

function recordsToNames(response: any): string[] {
  return ((response?.output?.[0]?.records?.rows || []) as string[][]).map((row) => row[0]).filter(Boolean)
}

/**
 * Bounded table-name window shared by every table picker.
 *
 * The initial window is `signal` tables first (if any) plus the first `limit`
 * tables. Typing runs a server contains search and merges matches from the loaded
 * window; traces use their fully-loaded allowed set and search locally.
 */
export default function useTableOptions(options: UseTableOptionsOptions) {
  const limit = options.limit ?? TABLE_OPTION_LIMIT
  const tableOptions = ref<string[]>([])
  const initialOptions = ref<string[]>([])
  const loading = ref(false)
  const searching = ref(false)
  let requestSeq = 0
  let allowedTables: Set<string> | null = null
  let allowedDatabase = ''

  /**
   * Traces must only offer tables that can carry trace data (`trace_id`); logs have no
   * such restriction. The allowed set is rebuilt per database and reused by search.
   */
  async function loadAllowedTables(db: string): Promise<Set<string>> {
    if (allowedTables && allowedDatabase === db) {
      return allowedTables
    }
    const names = await listSignalTables('traces', { database: db })
    allowedTables = new Set(names)
    allowedDatabase = db
    return allowedTables
  }

  async function fetchInitial(db: string): Promise<string[]> {
    const signal = toValue(options.signal)
    if (signal === 'traces') {
      const allowed = await loadAllowedTables(db)
      return Array.from(allowed).slice(0, limit)
    }
    const [semanticRows, response] = await Promise.all([
      signal ? listBySignal('log', db) : Promise.resolve([]),
      editorAPI.getTables(limit, 0, db),
    ])
    const semanticNames = semanticRows.map((row) => row.tableName).filter(Boolean)
    return unique([...semanticNames, ...recordsToNames(response)])
  }

  async function loadInitial(): Promise<void> {
    requestSeq += 1
    const seq = requestSeq
    const db = toValue(options.database)
    searching.value = false
    if (!db) {
      tableOptions.value = []
      initialOptions.value = []
      loading.value = false
      return
    }
    loading.value = true
    try {
      const names = await fetchInitial(db)
      if (seq !== requestSeq) return
      initialOptions.value = names
      tableOptions.value = names
    } catch (error) {
      console.error('[table-select] failed to load tables', error)
    } finally {
      if (seq === requestSeq) loading.value = false
    }
  }

  async function search(keyword: string): Promise<void> {
    requestSeq += 1
    const seq = requestSeq
    const trimmed = (keyword || '').trim()
    const db = toValue(options.database)
    if (!trimmed || !db) {
      searching.value = false
      tableOptions.value = initialOptions.value
      return
    }
    searching.value = true
    try {
      const signal = toValue(options.signal)
      const allowed = signal === 'traces' ? await loadAllowedTables(db) : undefined
      if (seq !== requestSeq) return
      const withExactFirst = (names: string[]): string[] =>
        names.includes(trimmed) ? [trimmed, ...names.filter((name) => name !== trimmed)] : names
      const needle = trimmed.toLowerCase()
      // Merge names already loaded for this picker with the server's contains result,
      // so the suggest is fuzzy and stable even while the request is in flight.
      const localMatches = (allowed ? [...allowed] : initialOptions.value).filter((name) =>
        name.toLowerCase().includes(needle)
      )

      // Trace candidates are fully loaded (allowed set), so search locally and skip
      // the name-only server query entirely.
      if (allowed) {
        tableOptions.value = withExactFirst(localMatches)
        return
      }

      const containsNames = recordsToNames(await editorAPI.getTables(limit, 0, db, trimmed))
      if (seq !== requestSeq) return
      tableOptions.value = withExactFirst([...new Set([...localMatches, ...containsNames])])
    } catch (error) {
      console.error('[table-select] failed to search tables', error)
    } finally {
      if (seq === requestSeq) searching.value = false
    }
  }

  /** Keep the current selection visible even when it is outside the window. */
  function ensureTable(name?: string): void {
    if (!name) return
    if (!tableOptions.value.includes(name)) {
      tableOptions.value = [name, ...tableOptions.value]
      initialOptions.value = [name, ...initialOptions.value]
    }
  }

  watch(
    () => [toValue(options.database), toValue(options.signal)] as const,
    () => {
      loadInitial()
    },
    { immediate: true }
  )

  return {
    tableOptions,
    loading,
    searching,
    loadInitial,
    search,
    ensureTable,
  }
}
