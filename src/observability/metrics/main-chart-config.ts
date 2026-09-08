import { computed, type Ref } from 'vue'
import { useStorage } from '@vueuse/core'
import { inferMetricKind, type MetricKind } from './infer-promql'

/** Grafana-like main panel visualization mode. */
export type MainChartVariant = 'timeseries' | 'heatmap' | 'percentiles'

/** Aggregation preset for non-histogram timeseries (Configure). */
export type TimeseriesAgg = 'avg' | 'sum' | 'min_max'

export interface MainChartMetricPrefs {
  variant?: MainChartVariant
  agg?: TimeseriesAgg
  percentiles?: number[]
}

export interface ResolvedMainChartPrefs {
  variant: MainChartVariant
  agg: TimeseriesAgg
  percentiles: number[]
}

const STORAGE_KEY = 'greptime-drilldown-main-chart-prefs'
export const DEFAULT_PERCENTILES = [99, 90, 50] as const

export function defaultPrefsForMetric(metric: string): ResolvedMainChartPrefs {
  const kind = inferMetricKind(metric)
  if (kind === 'histogram') {
    return {
      variant: 'heatmap',
      agg: 'sum',
      percentiles: [...DEFAULT_PERCENTILES],
    }
  }
  if (kind === 'counter') {
    return {
      variant: 'timeseries',
      agg: 'sum',
      percentiles: [...DEFAULT_PERCENTILES],
    }
  }
  return {
    variant: 'timeseries',
    agg: 'avg',
    percentiles: [...DEFAULT_PERCENTILES],
  }
}

export function resolvePrefsForMetric(metric: string, stored?: MainChartMetricPrefs | null): ResolvedMainChartPrefs {
  const defaults = defaultPrefsForMetric(metric)
  if (!stored) {
    return defaults
  }
  return {
    variant: stored.variant ?? defaults.variant,
    agg: stored.agg ?? defaults.agg,
    percentiles: stored.percentiles?.length ? [...stored.percentiles] : defaults.percentiles,
  }
}

export function configureOptionsForKind(
  kind: MetricKind
): Array<{ key: string; agg?: TimeseriesAgg; variant?: MainChartVariant }> {
  // Histogram uses the Heatmap / Percentiles radio group — no Configure dropdown.
  if (kind === 'histogram') {
    return []
  }
  if (kind === 'counter') {
    return [
      { key: 'sum', agg: 'sum' },
      { key: 'avg', agg: 'avg' },
    ]
  }
  return [
    { key: 'avg', agg: 'avg' },
    { key: 'sum', agg: 'sum' },
    { key: 'min_max', agg: 'min_max' },
  ]
}

/**
 * Per-metric main-chart Configure / variant prefs (localStorage).
 * Shared by title actions and useMetricMainChart.
 */
export default function useMainChartPrefs(metricName: Ref<string>) {
  const allPrefs = useStorage<Record<string, MainChartMetricPrefs>>(STORAGE_KEY, {})

  const prefs = computed(() => resolvePrefsForMetric(metricName.value.trim(), allPrefs.value[metricName.value.trim()]))

  const patchPrefs = (patch: MainChartMetricPrefs) => {
    const name = metricName.value.trim()
    if (!name) {
      return
    }
    allPrefs.value = {
      ...allPrefs.value,
      [name]: {
        ...allPrefs.value[name],
        ...patch,
      },
    }
  }

  const setAgg = (agg: TimeseriesAgg) => {
    patchPrefs({ agg, variant: 'timeseries' })
  }

  const setVariant = (variant: MainChartVariant) => {
    patchPrefs({ variant })
  }

  return {
    prefs,
    setAgg,
    setVariant,
    patchPrefs,
  }
}
