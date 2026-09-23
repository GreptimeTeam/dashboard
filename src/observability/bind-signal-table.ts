import useTableSchemaStore from '@/store/modules/table-schema'
import { entityColumnFilterKey, resolveEntityFilterRef, type EntityColumnRef, type EntitySignal } from './semantics'
import type { DrilldownContext } from './context'

export interface BoundSignalTable {
  /** Physical columns of the bound table; empty when the schema could not be loaded. */
  columns: Array<{ name: string; data_type?: string; semantic_type?: string }>
  /** Resolved `service` identity — a real column or a JSON chip (logs). */
  serviceRef?: EntityColumnRef
}

/**
 * Bind `tableName` to `signal`: load its schema once, resolve the service entity once,
 * and publish the three context states every signal consumer reads
 * (`entityFilterKeys` / `signalColumns` / `signalColumnTypes`).
 *
 * On failure the three states are cleared together and an empty result is returned, so
 * callers keep rendering while the next bind retries.
 */
export async function bindSignalTable(
  ctx: DrilldownContext,
  signal: Extract<EntitySignal, 'logs' | 'traces'>,
  tableName: string
): Promise<BoundSignalTable> {
  const name = tableName.trim()
  if (!name) {
    return { columns: [] }
  }

  const database = ctx.databaseFor(signal)
  try {
    const columns = (await useTableSchemaStore().ensureTableSchema(name, database)) as BoundSignalTable['columns']
    let serviceRef: EntityColumnRef | undefined
    try {
      serviceRef = await resolveEntityFilterRef(name, 'service', { signal, columns, database })
    } catch (error) {
      console.error(`Failed to resolve the service filter key for ${name}:`, error)
    }
    ctx.setEntityFilterKey(signal, 'service', serviceRef ? entityColumnFilterKey(serviceRef) : undefined)
    ctx.setSignalColumns(
      signal,
      columns.map((column) => column.name)
    )
    // Typed filter literals (numeric comparisons, TRUE/FALSE) read these data types.
    ctx.setSignalColumnTypes(signal, Object.fromEntries(columns.map((column) => [column.name, column.data_type || ''])))
    return { columns, serviceRef }
  } catch (error) {
    console.error(`Failed to bind ${signal} table ${name}:`, error)
    ctx.setEntityFilterKey(signal, 'service', undefined)
    ctx.setSignalColumns(signal, undefined)
    ctx.setSignalColumnTypes(signal, undefined)
    return { columns: [] }
  }
}
