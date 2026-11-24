import { useAppStore } from '@/store'
import { bareTableName } from '@/utils/sql'
import { hostMatches, readJSON, writeJSON } from '@/utils/storage'

/** Storage key of the Traces Query page; also read by the Logs → trace link. */
export const TRACES_QUERY_STORAGE_KEY = 'traces-query-table'

/** Storage key of the Logs Query page. Independent of the Explorer's bound logs table. */
export const LOGS_QUERY_STORAGE_KEY = 'logs-query-table'

const STORAGE_VERSION = 1

/** The database + table a query page last queried, as that page saw them. */
export interface QueryTablePick {
  database: string
  table: string
}

/**
 * Persisted shape. Tables are keyed by database so switching databases never leaves the
 * picker on a name from another database, and the host stamp drops the whole preference
 * when the connection changes.
 *
 * `last` is the (database, table) the page queried most recently, whatever the mode. The
 * per-database map alone is not enough for the cross-signal links: it is read with the page's
 * signal database, so a code-mode query against another database would resolve to a stale
 * entry. `last` is the page's own answer, so a drawer opened from a link reads exactly the
 * same table the page did.
 */
interface StoredQueryTables {
  v?: number
  host?: string
  tables?: Record<string, string>
  last?: Partial<QueryTablePick>
}

function storageKey(builderKey: string): string {
  return `${builderKey}:selected-table`
}

function currentHost(): string {
  return useAppStore().host || ''
}

/** The stored record for this builder, or `{}` when missing/corrupt/from another host. */
function readRecord(builderKey: string): StoredQueryTables {
  const stored = readJSON<StoredQueryTables>(storageKey(builderKey))
  if (!stored || typeof stored !== 'object') {
    return {}
  }
  return hostMatches(stored.host, currentHost()) ? stored : {}
}

function readTableMap(builderKey: string): Record<string, string> {
  const { tables } = readRecord(builderKey)
  return tables && typeof tables === 'object' ? tables : {}
}

/** The table a query page queried last in this database, if any. */
export function readQueryTable(builderKey: string, database: string | undefined): string | undefined {
  if (!database) return undefined
  const table = readTableMap(builderKey)[database]
  return typeof table === 'string' && table.trim() ? table.trim() : undefined
}

/**
 * The (database, table) a query page queried last, if any. This is the only source the
 * cross-signal links (Logs ⇄ Trace) use: they never fall back to guessing a table, so the
 * drawer always reads the same table the page itself did.
 */
export function readLastQueryTable(builderKey: string): QueryTablePick | undefined {
  const { last } = readRecord(builderKey)
  const database = typeof last?.database === 'string' ? last.database.trim() : ''
  const table = typeof last?.table === 'string' ? bareTableName(last.table) : ''
  return database && table ? { database, table } : undefined
}

/**
 * Remember the table queried on a query page for this database, and as the page's latest
 * query. Stored bare (`"db"."t"` / `db.t` / `"t"` → `t`) so every writer — builder or code
 * mode — yields the same shape and the cross-signal links can use the value directly.
 */
export function writeQueryTable(builderKey: string, database: string, table: string): void {
  const name = bareTableName(table)
  if (!database || !name) return
  const stored = readRecord(builderKey)
  const tables = stored.tables && typeof stored.tables === 'object' ? stored.tables : {}
  const unchanged = tables[database] === name && stored.last?.database === database && stored.last?.table === name
  if (unchanged) return
  writeJSON(storageKey(builderKey), {
    v: STORAGE_VERSION,
    host: currentHost(),
    tables: { ...tables, [database]: name },
    last: { database, table: name },
  } satisfies StoredQueryTables)
}
