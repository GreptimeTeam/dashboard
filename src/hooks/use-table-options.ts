import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import editorAPI from '@/api/editor'
import { listBySignal } from '@/observability/semantics'

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
 * tables; typing searches the server by prefix (range scan) and only falls back
 * to the slow substring LIKE when the prefix has no match. This keeps memory and
 * DOM O(limit) even for databases with 100k+ tables.
 */
export default function useTableOptions(options: UseTableOptionsOptions) {
  const limit = options.limit ?? TABLE_OPTION_LIMIT
  const tableOptions = ref<string[]>([])
  const initialOptions = ref<string[]>([])
  const loading = ref(false)
  const searching = ref(false)
  let requestSeq = 0

  async function fetchInitial(db: string): Promise<string[]> {
    const signal = toValue(options.signal)
    const [semanticRows, response] = await Promise.all([
      signal ? listBySignal(signal === 'logs' ? 'log' : 'trace', db) : Promise.resolve([]),
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
      const prefixNames = recordsToNames(await editorAPI.getTablesByPrefix(limit, 0, db, trimmed)).filter((name) =>
        name.startsWith(trimmed)
      )
      if (seq !== requestSeq) return
      if (prefixNames.length) {
        tableOptions.value = prefixNames
        return
      }
      const containsNames = recordsToNames(await editorAPI.getTables(limit, 0, db, trimmed))
      if (seq !== requestSeq) return
      tableOptions.value = containsNames
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
