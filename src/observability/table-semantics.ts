import editorApi from '@/api/editor'
import { currentDatabase } from './current-database'
import type { MetricKind } from './metrics/infer-promql'

export type MetadataQuality = 'declared' | 'inferred' | 'unknown' | string

/** Greptime `metric.temporality` values. */
export type MetricTemporality = 'cumulative' | 'delta' | 'mixed' | 'unknown' | string

export interface MetricTableSemantics {
  tableName: string
  metadataQuality: MetadataQuality
  signalType?: string
  source?: string
  metricType?: string
  /** UCUM unit from `metric.unit` (e.g. `s`, `By`, `{request}`). */
  metricUnit?: string
  metricTemporality?: MetricTemporality
  metricOriginalName?: string
}

const METRIC_SEMANTICS_SELECT =
  'SELECT table_name, signal_type, source, metadata_quality, semantic_options FROM information_schema.table_semantics'

/**
 * One dump per database, shared by concurrent callers.
 *
 * `loadedDatabase` is the database `dump` belongs to; a different current database
 * starts a fresh dump, so switching schemas can neither leak another schema's
 * declarations nor hide the new schema's own. A failed dump is cached as an empty
 * map for that database — older deployments without the view cost one query, not
 * one per lookup.
 */
let loadedDatabase: string | null = null
let dump: Promise<Map<string, MetricTableSemantics>> | null = null

/**
 * `information_schema.table_semantics` covers every schema of the current catalog,
 * so the schema filter is what keeps two same-named tables from colliding.
 */
function metricSemanticsSQL(database: string): string {
  return `${METRIC_SEMANTICS_SELECT} WHERE signal_type = 'metric' AND table_schema = '${database}'`
}

function parseSemanticOptions(raw: unknown): Record<string, unknown> {
  if (raw == null) {
    return {}
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }
  return {}
}

function optionString(options: Record<string, unknown>, key: string): string | undefined {
  const value = options[key]
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

function rowToSemantics(row: unknown[], schemas: Array<{ name: string }>): MetricTableSemantics | null {
  const indexOf = (name: string) => schemas.findIndex((schema) => schema.name === name)
  const tableNameIndex = indexOf('table_name')
  if (tableNameIndex < 0) {
    return null
  }
  const tableName = String(row[tableNameIndex] ?? '').trim()
  if (!tableName) {
    return null
  }

  const qualityIndex = indexOf('metadata_quality')
  const optionsIndex = indexOf('semantic_options')
  const signalIndex = indexOf('signal_type')
  const sourceIndex = indexOf('source')
  const metadataQuality = qualityIndex >= 0 ? String(row[qualityIndex] ?? 'unknown') : 'unknown'
  const options = parseSemanticOptions(optionsIndex >= 0 ? row[optionsIndex] : undefined)

  return {
    tableName,
    metadataQuality,
    signalType: signalIndex >= 0 ? String(row[signalIndex] ?? '').trim() || undefined : undefined,
    source: sourceIndex >= 0 ? String(row[sourceIndex] ?? '').trim() || undefined : undefined,
    metricType: optionString(options, 'metric.type'),
    metricUnit: optionString(options, 'metric.unit'),
    metricTemporality: optionString(options, 'metric.temporality'),
    metricOriginalName: optionString(options, 'metric.original_name'),
  }
}

/**
 * Map Greptime / OTLP `metric.type` strings onto dashboard MetricKind.
 * Only call with declared semantics; unknown strings fall through to null.
 */
export function mapDeclaredMetricType(metricType: string | undefined): MetricKind | null {
  if (!metricType) {
    return null
  }
  const normalized = metricType.trim().toLowerCase().replace(/-/g, '_')
  switch (normalized) {
    case 'counter':
      return 'counter'
    case 'gauge':
      return 'gauge'
    case 'updowncounter':
    case 'updown_counter':
    case 'up_down_counter':
      return 'updown_counter'
    case 'histogram':
    case 'exponentialhistogram':
    case 'exponential_histogram':
    case 'gauge_histogram':
      return 'histogram'
    case 'summary':
      return 'summary'
    default:
      return null
  }
}

/** Declared kind only — null when missing, non-declared, or unmapped. */
export function declaredMetricKindFromSemantics(semantics: MetricTableSemantics | null): MetricKind | null {
  if (!semantics || semantics.metadataQuality !== 'declared') {
    return null
  }
  return mapDeclaredMetricType(semantics.metricType)
}

/** Declared UCUM unit — null when missing or non-declared. */
export function declaredMetricUnitFromSemantics(semantics: MetricTableSemantics | null): string | null {
  if (!semantics || semantics.metadataQuality !== 'declared' || !semantics.metricUnit) {
    return null
  }
  return semantics.metricUnit
}

/** Declared temporality — null when missing or non-declared. */
export function declaredTemporalityFromSemantics(semantics: MetricTableSemantics | null): MetricTemporality | null {
  if (!semantics || semantics.metadataQuality !== 'declared' || !semantics.metricTemporality) {
    return null
  }
  return semantics.metricTemporality
}

/**
 * Whether PromQL should wrap the series in `rate()`.
 * Prefer importing from infer-promql; re-exported for convenience.
 */
export { shouldApplyRate } from './metrics/infer-promql'

function ingestSemanticsRows(
  rows: unknown[],
  schemas: Array<{ name: string }>,
  target: Map<string, MetricTableSemantics>
): void {
  rows.forEach((row) => {
    if (!Array.isArray(row)) {
      return
    }
    const semantics = rowToSemantics(row, schemas)
    if (semantics?.tableName) {
      // Core fields only — rowToSemantics already drops raw semantic_options JSON.
      target.set(semantics.tableName, semantics)
    }
  })
}

async function fetchMetricSemantics(database: string): Promise<Map<string, MetricTableSemantics>> {
  const byTableName = new Map<string, MetricTableSemantics>()
  try {
    const response = await editorApi.runSQL(metricSemanticsSQL(database))
    const records = response?.output?.[0]?.records
    const schemas = records?.schema?.column_schemas ?? []
    const rows = records?.rows
    if (Array.isArray(rows)) {
      ingestSemanticsRows(rows, schemas, byTableName)
    }
  } catch {
    // View missing / query failed — treat as empty semantics catalog.
  }
  return byTableName
}

/** The dump for `database`, reusing the loaded/in-flight one and swapping on db change. */
function semanticsFor(database: string): Promise<Map<string, MetricTableSemantics>> {
  if (!dump || loadedDatabase !== database) {
    loadedDatabase = database
    dump = fetchMetricSemantics(database)
  }
  return dump
}

/**
 * Load all metric rows from `table_semantics` for the current database.
 * Success or failure both settle the dump — no per-name LIMIT 1 fallback
 * (older DBs without the view simply have no declared semantics).
 */
export async function ensureMetricSemanticsLoaded(): Promise<void> {
  await semanticsFor(currentDatabase())
}

/**
 * Look up metric table semantics from the in-memory dump of the current database.
 * Always waits for the dump; never issues per-name SQL.
 */
export async function getMetricTableSemantics(metricName: string): Promise<MetricTableSemantics | null> {
  const key = metricName.trim()
  if (!key) {
    return null
  }

  const semantics = await semanticsFor(currentDatabase())
  return semantics.get(key) ?? null
}

/**
 * Whether the current database's dump has a row for `tableName`.
 * Answers "does this table exist in the semantic layer" without a second query —
 * used to tell a classic histogram's `_bucket` companion from a native one.
 */
export async function hasSemanticsTable(tableName: string): Promise<boolean> {
  const key = tableName.trim()
  if (!key) {
    return false
  }

  const semantics = await semanticsFor(currentDatabase())
  return semantics.has(key)
}

/** Test helper — drop the cached dump (and its database binding) between cases. */
export function clearMetricTableSemanticsCache(): void {
  loadedDatabase = null
  dump = null
}

export default getMetricTableSemantics
