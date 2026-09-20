import useTableSchemaStore from '@/store/modules/table-schema'
import resolveEntityIdentity from '../entities'

/**
 * Service identity column for a trace table: the declared identity first, then the
 * `greptime_trace_v1` model shape.
 *
 * Returns undefined when neither applies, so callers keep their own default. Chip-style
 * identities (a declaration pointing into a JSON container) are skipped — the trace
 * field map addresses physical columns only.
 */
export default async function resolveTracesServiceColumn(tableName: string): Promise<string | undefined> {
  const name = tableName.trim()
  if (!name) {
    return undefined
  }

  try {
    const columns = await useTableSchemaStore().ensureTableSchema(name)
    const identity = await resolveEntityIdentity(name, 'service', columns)
    const primary = identity?.id[0]
    return primary && !primary.jsonKey ? primary.column : undefined
  } catch (error) {
    console.error(`Failed to resolve the service column for ${name}:`, error)
    return undefined
  }
}
