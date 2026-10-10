import { defineStore, storeToRefs } from 'pinia'
import { ref, watch } from 'vue'
import requestTableSchema, {
  requestTableSchemas,
  requestTablesHavingColumn,
  type TableSchemaColumn,
  type TableSchemaScope,
} from '@/api/table-schema-fetch'
import useAppStore from '../app'

export type { TableSchemaColumn }

function resolveTableSchemaScope(database?: string): TableSchemaScope {
  const appStore = useAppStore()
  const { tableSchema, tableCatalog } = storeToRefs(appStore)
  let catalog = tableCatalog.value
  let schema = tableSchema.value

  if (database) {
    // Database name format is usually "<catalog>-<schema>", e.g. "greptime-public".
    const parts = database.split('-')
    if (parts.length > 1) {
      catalog = parts.slice(0, -1).join('-') || catalog
      schema = parts[parts.length - 1] || schema
    } else {
      schema = database
    }
  }

  return {
    catalog,
    schema,
    db: database || appStore.database,
  }
}

function schemaCacheKey(tableName: string, database?: string) {
  const { catalog, schema, db } = resolveTableSchemaScope(database)
  return `${db}\0${catalog}\0${schema}\0${tableName}`
}

const useTableSchemaStore = defineStore('tableSchema', () => {
  /** Resolved columns by cache key. */
  const columnsByKey = ref<Record<string, TableSchemaColumn[]>>({})
  /** In-flight ensure promises — concurrent callers share one request. */
  const inflightByKey = new Map<string, Promise<TableSchemaColumn[]>>()
  /** Session-cached column pre-filter scans (`db\0catalog\0schema\0column` → tables). */
  const tablesByColumn = new Map<string, Promise<Set<string>>>()

  const clearTableSchema = (tableName?: string, database?: string) => {
    if (!tableName) {
      columnsByKey.value = {}
      inflightByKey.clear()
      tablesByColumn.clear()
      return
    }
    const key = schemaCacheKey(tableName, database)
    const next = { ...columnsByKey.value }
    delete next[key]
    columnsByKey.value = next
    inflightByKey.delete(key)
  }

  /**
   * Unified check: return cached schema, share in-flight request, or fetch once.
   */
  const ensureTableSchema = (tableName: string, database?: string): Promise<TableSchemaColumn[]> => {
    if (!tableName) {
      return Promise.resolve([])
    }
    const key = schemaCacheKey(tableName, database)
    const cached = columnsByKey.value[key]
    if (cached) {
      return Promise.resolve(cached)
    }
    const inflight = inflightByKey.get(key)
    if (inflight) {
      return inflight
    }

    const scope = resolveTableSchemaScope(database)
    const request = requestTableSchema(tableName, scope)
      .then((columns) => {
        columnsByKey.value = { ...columnsByKey.value, [key]: columns }
        inflightByKey.delete(key)
        return columns
      })
      .catch((error) => {
        inflightByKey.delete(key)
        throw error
      })

    inflightByKey.set(key, request)
    return request
  }

  /**
   * Batched ensure: one information_schema.columns query covers every missing table;
   * results land in the same cache, so per-table ensureTableSchema calls afterwards
   * are cache hits instead of one query each.
   */
  const ensureTableSchemas = async (
    tables: string[],
    database?: string
  ): Promise<Record<string, TableSchemaColumn[]>> => {
    const unique = [...new Set(tables.filter(Boolean))]
    if (!unique.length) {
      return {}
    }
    const missing = unique.filter((table) => {
      const key = schemaCacheKey(table, database)
      return !columnsByKey.value[key] && !inflightByKey.has(key)
    })
    if (missing.length) {
      const scope = resolveTableSchemaScope(database)
      const request = requestTableSchemas(missing, scope)
        .then((byTable) => {
          const next = { ...columnsByKey.value }
          missing.forEach((table) => {
            next[schemaCacheKey(table, database)] = byTable[table] ?? []
          })
          columnsByKey.value = next
          missing.forEach((table) => inflightByKey.delete(schemaCacheKey(table, database)))
          return byTable
        })
        .catch((error) => {
          missing.forEach((table) => inflightByKey.delete(schemaCacheKey(table, database)))
          throw error
        })
      // Register the batch promise as each missing table's in-flight, so concurrent
      // per-table ensureTableSchema calls join it instead of duplicating the request.
      missing.forEach((table) => {
        const key = schemaCacheKey(table, database)
        inflightByKey.set(
          key,
          request.then(() => columnsByKey.value[key] ?? [])
        )
      })
    }
    const result: Record<string, TableSchemaColumn[]> = {}
    unique.forEach((table) => {
      result[table] = columnsByKey.value[schemaCacheKey(table, database)] ?? []
    })
    return result
  }

  /**
   * Tables in `database` carrying `column` — one GROUP BY query, session-cached and
   * shared in-flight. Fails soft with an empty set: callers treat "unknown" as
   * "unfiltered" and keep their candidate list.
   */
  const tablesHavingColumn = (column: string, database?: string): Promise<Set<string>> => {
    const { catalog, schema, db } = resolveTableSchemaScope(database)
    const key = `${db}\0${catalog}\0${schema}\0${column}`
    const cached = tablesByColumn.get(key)
    if (cached) {
      return cached
    }
    if (tablesByColumn.size > 50) {
      tablesByColumn.clear()
    }
    const request = requestTablesHavingColumn(column, { catalog, schema, db })
      .then((tables) => new Set(tables))
      .catch((error) => {
        console.error(`Failed to list tables having column "${column}":`, error)
        tablesByColumn.delete(key)
        return new Set<string>()
      })
    tablesByColumn.set(key, request)
    return request
  }

  watch(
    () => useAppStore().database,
    () => {
      clearTableSchema()
    }
  )

  return {
    columnsByKey,
    ensureTableSchema,
    ensureTableSchemas,
    tablesHavingColumn,
    clearTableSchema,
  }
})

export default useTableSchemaStore
