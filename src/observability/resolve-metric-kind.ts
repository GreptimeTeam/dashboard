import { declaredMetricKindFromSemantics, getMetricTableSemantics } from './table-semantics'
import { inferMetricKind, type MetricKind } from './metrics/infer-promql'

/**
 * Prefer declared `table_semantics.metric.type`, else name heuristic.
 */
export default async function resolveMetricKind(name: string): Promise<MetricKind> {
  const trimmed = name.trim()
  if (!trimmed) {
    return 'unknown'
  }
  const semantics = await getMetricTableSemantics(trimmed)
  return declaredMetricKindFromSemantics(semantics) ?? inferMetricKind(trimmed)
}
