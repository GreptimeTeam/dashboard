import resolveMetricMeta from './resolve-metric-meta'
import type { MetricKind } from './metrics/infer-promql'

/**
 * Prefer declared `table_semantics.metric.type`, else name heuristic.
 * @deprecated Prefer `resolveMetricMeta` when unit/temporality are also needed.
 */
export default async function resolveMetricKind(name: string): Promise<MetricKind> {
  const meta = await resolveMetricMeta(name)
  return meta.kind
}
