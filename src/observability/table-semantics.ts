import editorApi from '@/api/editor'
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

const cache = new Map<string, MetricTableSemantics | null>()
const inflight = new Map<string, Promise<MetricTableSemantics | null>>()

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''")
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

async function fetchMetricTableSemantics(tableName: string): Promise<MetricTableSemantics | null> {
  const trimmed = tableName.trim()
  if (!trimmed) {
    return null
  }

  try {
    const response = await editorApi.runSQL(
      `SELECT table_name, signal_type, source, metadata_quality, semantic_options FROM information_schema.table_semantics WHERE table_name = '${escapeSqlLiteral(
        trimmed
      )}' LIMIT 1`
    )
    const records = response?.output?.[0]?.records
    const schemas = records?.schema?.column_schemas ?? []
    const rows = records?.rows
    if (!Array.isArray(rows) || !rows.length) {
      return null
    }
    return rowToSemantics(rows[0], schemas)
  } catch {
    // table_semantics may be unavailable on older deployments.
    return null
  }
}

/**
 * Look up metric table semantics (cached). Soft-fails when the view is missing.
 */
export async function getMetricTableSemantics(metricName: string): Promise<MetricTableSemantics | null> {
  const key = metricName.trim()
  if (!key) {
    return null
  }

  if (cache.has(key)) {
    return cache.get(key) ?? null
  }

  const pending = inflight.get(key)
  if (pending) {
    return pending
  }

  const request = fetchMetricTableSemantics(key).then((result) => {
    cache.set(key, result)
    inflight.delete(key)
    return result
  })
  inflight.set(key, request)
  return request
}

/** Test helper — clear in-memory cache between cases. */
export function clearMetricTableSemanticsCache(): void {
  cache.clear()
  inflight.clear()
}

export default getMetricTableSemantics
