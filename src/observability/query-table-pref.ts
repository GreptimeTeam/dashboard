import { useAppStore } from '@/store'
import { hostMatches, readJSON, writeJSON } from '@/utils/storage'

/** `SQLBuilder` storage key of the Traces Query page; also read by the Logs → trace link. */
export const TRACES_QUERY_STORAGE_KEY = 'traces-query-table'

/** `SQLBuilder` storage key of the Logs Query page. Independent of the Explorer's bound logs table. */
export const LOGS_QUERY_STORAGE_KEY = 'logs-query-table'

const STORAGE_VERSION = 1

/**
 * Persisted shape. Tables are keyed by database so switching databases never leaves the
 * picker on a name from another database, and the host stamp drops the whole preference
 * when the connection changes.
 */
interface StoredQueryTables {
  v?: number
  host?: string
  tables?: Record<string, string>
}

function storageKey(builderKey: string): string {
  return `${builderKey}:selected-table`
}

function currentHost(): string {
  return useAppStore().host || ''
}

function readStored(builderKey: string): Record<string, string> {
  const stored = readJSON<StoredQueryTables>(storageKey(builderKey))
  if (!stored || typeof stored !== 'object' || !stored.tables || typeof stored.tables !== 'object') {
    return {}
  }
  return hostMatches(stored.host, currentHost()) ? stored.tables : {}
}

/** The table last chosen in a query builder for this database, if any. */
export function readQueryTable(builderKey: string, database: string | undefined): string | undefined {
  if (!database) return undefined
  const table = readStored(builderKey)[database]
  return typeof table === 'string' && table.trim() ? table.trim() : undefined
}

/** Remember the table chosen in a query builder for this database. */
export function writeQueryTable(builderKey: string, database: string, table: string): void {
  const name = table.trim()
  if (!database || !name) return
  const tables = readStored(builderKey)
  if (tables[database] === name) return
  writeJSON(storageKey(builderKey), {
    v: STORAGE_VERSION,
    host: currentHost(),
    tables: { ...tables, [database]: name },
  } satisfies StoredQueryTables)
}
