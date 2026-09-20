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

/** Series suffixes that a histogram family emits alongside its `_bucket` series. */
const HISTOGRAM_COMPANION_SUFFIXES = ['_sum', '_count']

/**
 * Prometheus remote-write 2.0 metadata describes a whole family, and writers such as
 * the OTel Collector's prometheusremotewrite exporter stamp `type=histogram` on every
 * series of it. The `_sum` / `_count` tables then arrive declared as histogram even
 * though they are cumulative counters with no `_bucket` of their own — querying them
 * as classic would ask for `foo_sum_bucket`, which does not exist.
 */
function isHistogramCompanionSeries(name: string): boolean {
  return HISTOGRAM_COMPANION_SUFFIXES.some((suffix) => name.endsWith(suffix))
}

/** `foo_seconds_count` → `foo_seconds`; null when the name is not a count series. */
function histogramCountBaseName(name: string): string | null {
  const suffix = '_count'
  return name.endsWith(suffix) && name.length > suffix.length ? name.slice(0, -suffix.length) : null
}

/**
 * OTLP stamps the metric's observed-value unit on every table it emits, so a
 * histogram's `{base}_count` table inherits `unit=s` / `{token}` even though a count
 * series counts observations — that unit only mislabels the axis (e.g. `token/s` for
 * observation rate, or raw seconds on a delta path).
 *
 * Dropped only for real histogram companions: a standalone counter such as
 * `dotnet_assembly_count` has no `dotnet_assembly_bucket` and keeps its declared unit.
 */
async function resolveSemanticUnit(name: string, declaredUnit: string | null): Promise<string | null> {
  const base = histogramCountBaseName(name)
  if (!declaredUnit || !base) {
    return declaredUnit
  }
  return (await hasSemanticsTable(`${base}_bucket`)) ? null : declaredUnit
}

/**
 * Classic OTLP histograms fan out into a `_bucket` table carrying `le`, which the
 * semantic layer declares too. An OTLP exponential histogram lands in the metric's
 * own table as a native histogram value with no `_bucket` sibling and no `le`
 * matrix — charting it as classic would query a table that does not exist.
 */
async function isNativeHistogram(name: string, semantics: MetricTableSemantics | null): Promise<boolean> {
  // `_bucket` is itself the classic histogram table, never a native one.
  if (name.endsWith('_bucket')) {
    return false
  }
  return !(await hasSemanticsTable(`${name}_bucket`))
}

async function resolveMetricKind(name: string, semantics: MetricTableSemantics | null): Promise<MetricKind> {
  const declaredKind = declaredMetricKindFromSemantics(semantics)
  if (declaredKind === 'histogram') {
    // Checked first: a remote-write `_sum`/`_count` table has no `_bucket` companion
    // either, so the native check below would otherwise swallow a chartable counter.
    if (isHistogramCompanionSeries(name)) {
      return 'counter'
    }
    if (await isNativeHistogram(name, semantics)) {
      return 'native_histogram'
    }
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
    semanticUnit: await resolveSemanticUnit(trimmed, declaredMetricUnitFromSemantics(semantics)),
    temporality: declaredTemporalityFromSemantics(semantics),
    // `metadata_quality` describes `metric.type` only; original_name is never guessed.
    originalName: semantics?.metricOriginalName ?? null,
    source: semantics?.source ?? null,
    metadataQuality: semantics?.metadataQuality ?? null,
    semantics,
  }
}
