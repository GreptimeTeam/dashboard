import {
  declaredMetricKindFromSemantics,
  declaredMetricUnitFromSemantics,
  declaredTemporalityFromSemantics,
  getMetricTableSemantics,
  hasSemanticsTable,
  type MetricTableSemantics,
  type MetricTemporality,
} from './table-semantics'
import { inferMetricKind, type MetricKind } from './metrics/infer-promql'

export interface ResolvedMetricMeta {
  kind: MetricKind
  /** Declared UCUM unit when available. */
  semanticUnit: string | null
  temporality: MetricTemporality | null
  originalName: string | null
  source: string | null
  metadataQuality: string | null
  semantics: MetricTableSemantics | null
}

/** Greptime `metric.type` strings that can only mean a native (exponential) histogram. */
const NATIVE_HISTOGRAM_METRIC_TYPES = new Set(['exponentialhistogram', 'exponential_histogram'])

function normalizeMetricType(metricType: string | undefined): string {
  return (metricType ?? '').trim().toLowerCase().replace(/-/g, '_')
}

/**
 * Classic OTLP histograms fan out into a `_bucket` table carrying `le`, which the
 * semantic layer declares too. An OTLP exponential histogram lands in the metric's
 * own table as a native histogram value with no `_bucket` sibling and no `le`
 * matrix — charting it as classic would query a table that does not exist.
 */
async function isNativeHistogram(name: string, semantics: MetricTableSemantics | null): Promise<boolean> {
  if (NATIVE_HISTOGRAM_METRIC_TYPES.has(normalizeMetricType(semantics?.metricType))) {
    return true
  }
  // `_bucket` is itself the classic histogram table, never a native one.
  if (name.endsWith('_bucket')) {
    return false
  }
  return !(await hasSemanticsTable(`${name}_bucket`))
}

async function resolveMetricKind(name: string, semantics: MetricTableSemantics | null): Promise<MetricKind> {
  const declaredKind = declaredMetricKindFromSemantics(semantics)
  if (declaredKind === 'histogram' && (await isNativeHistogram(name, semantics))) {
    return 'native_histogram'
  }
  return declaredKind ?? inferMetricKind(name)
}

/**
 * Resolve kind + declared unit/temporality/original_name for charting & UI.
 */
export default async function resolveMetricMeta(name: string): Promise<ResolvedMetricMeta> {
  const trimmed = name.trim()
  if (!trimmed) {
    return {
      kind: 'unknown',
      semanticUnit: null,
      temporality: null,
      originalName: null,
      source: null,
      metadataQuality: null,
      semantics: null,
    }
  }

  const semantics = await getMetricTableSemantics(trimmed)
  return {
    kind: await resolveMetricKind(trimmed, semantics),
    semanticUnit: declaredMetricUnitFromSemantics(semantics),
    temporality: declaredTemporalityFromSemantics(semantics),
    originalName: semantics?.metadataQuality === 'declared' ? semantics.metricOriginalName ?? null : null,
    source: semantics?.source ?? null,
    metadataQuality: semantics?.metadataQuality ?? null,
    semantics,
  }
}
