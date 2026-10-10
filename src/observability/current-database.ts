import { useAppStore } from '@/store'

/**
 * Current database (schema) name, matching the `db` param the SQL API is called with.
 *
 * `information_schema` tables resolve inside the current catalog but expose *every*
 * schema of it, so queries must filter `table_schema` explicitly — this is the value
 * to filter on.
 */
export function currentDatabase(): string {
  return useAppStore().database || 'public'
}

/**
 * Identity of the connected GreptimeDB instance. Caches keyed only by database name must
 * also carry this, or switching host in Settings would serve the previous cluster's rows.
 */
export function currentConnectionKey(): string {
  return useAppStore().host || ''
}
