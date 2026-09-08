import {
  declaredMetricKindFromSemantics,
  declaredMetricUnitFromSemantics,
  declaredTemporalityFromSemantics,
  getMetricTableSemantics,
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
    kind: declaredMetricKindFromSemantics(semantics) ?? inferMetricKind(trimmed),
    semanticUnit: declaredMetricUnitFromSemantics(semantics),
    temporality: declaredTemporalityFromSemantics(semantics),
    originalName: semantics?.metadataQuality === 'declared' ? semantics.metricOriginalName ?? null : null,
    source: semantics?.source ?? null,
    metadataQuality: semantics?.metadataQuality ?? null,
    semantics,
  }
}
