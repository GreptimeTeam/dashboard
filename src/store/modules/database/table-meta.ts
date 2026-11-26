export interface MetricTableMeta {
  isLogicalTable: boolean
  isPhysicalMetricTable: boolean
  physicalTableName?: string
}

/**
 * Parse `information_schema.tables.create_options` into a key-value map.
 * Options are space-separated `key=value` pairs and their order is not stable,
 * e.g. `ttl='7d' on_physical_table=greptime_physical_table`.
 */
export function parseCreateOptions(createOptions?: string | null): Record<string, string> {
  const options: Record<string, string> = {}
  if (!createOptions) return options

  createOptions
    .split(/\s+/)
    .filter(Boolean)
    .forEach((token) => {
      const separatorIndex = token.indexOf('=')
      if (separatorIndex <= 0) return
      const key = token.slice(0, separatorIndex)
      const value = token.slice(separatorIndex + 1)
      options[key] = value
    })
  return options
}

/**
 * Distinguish metric-engine tables via `information_schema.tables`:
 * - `engine = 'metric'` + `on_physical_table=<name>` -> logical (virtual) table
 * - `engine = 'metric'` + `physical_metric_table=true` -> physical metric table
 */
export function resolveMetricTableMeta(engine?: string | null, createOptions?: string | null): MetricTableMeta {
  if (!engine || engine.toLowerCase() !== 'metric') {
    return { isLogicalTable: false, isPhysicalMetricTable: false }
  }

  const options = parseCreateOptions(createOptions)
  const physicalTableName = options.on_physical_table
  return {
    isLogicalTable: Boolean(physicalTableName),
    isPhysicalMetricTable: options.physical_metric_table === 'true',
    physicalTableName: physicalTableName || undefined,
  }
}
