import { defineStore, storeToRefs } from 'pinia'
import { watch } from 'vue'
import requestTableSchema, { type TableSchemaColumn, type TableSchemaScope } from '@/api/table-schema-fetch'
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

  const clearTableSchema = (tableName?: string, database?: string) => {
    if (!tableName) {
      columnsByKey.value = {}
      inflightByKey.clear()
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

  watch(
    () => useAppStore().database,
    () => {
      clearTableSchema()
    }
  )

  return {
    columnsByKey,
    ensureTableSchema,
    clearTableSchema,
  }
})

export default useTableSchemaStore
