import { getLabelNames, getLabelValues } from '@/api/metrics'
import { buildPromMatchSelector } from '../filters'
import type { DrilldownContext } from '../context'

const INTERNAL_LABEL_PREFIX = '__'

function promTimeParams(ctx: DrilldownContext): { start?: string; end?: string } {
  const unixRange = ctx.unixTimeRange()
  if (unixRange.length !== 2) {
    return {}
  }
  return {
    start: String(unixRange[0]),
    end: String(unixRange[1]),
  }
}

function asStringArray(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload.map(String).filter(Boolean)
  }
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const { data } = payload as { data?: unknown }
    return Array.isArray(data) ? data.map(String).filter(Boolean) : []
  }
  return []
}

function filterLabelKeys(keys: string[]): string[] {
  return [...new Set(keys)]
    .filter((key) => key && !key.startsWith(INTERNAL_LABEL_PREFIX))
    .sort((left, right) => left.localeCompare(right))
}

export async function fetchBreakdownLabelKeys(ctx: DrilldownContext, metric: string): Promise<string[]> {
  const match = buildPromMatchSelector(ctx.filters.value, { metric })
  const selector = match ?? `{__name__="${metric.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"}`
  const time = promTimeParams(ctx)

  try {
    const response = await getLabelNames({
      match: selector,
      ...time,
    })
    return filterLabelKeys(asStringArray(response))
  } catch (error) {
    console.error(`Failed to load breakdown labels for ${metric}:`, error)
    return []
  }
}

export async function fetchBreakdownLabelValues(
  ctx: DrilldownContext,
  metric: string,
  labelKey: string
): Promise<string[]> {
  const trimmedKey = labelKey.trim()
  if (!trimmedKey || !metric) {
    return []
  }

  const match = buildPromMatchSelector(ctx.filters.value, {
    excludeKey: trimmedKey,
    metric,
  })

  if (!match) {
    return []
  }

  const time = promTimeParams(ctx)

  try {
    const response = await getLabelValues(trimmedKey, {
      match,
      ...time,
    })
    return asStringArray(response)
  } catch (error) {
    console.error(`Failed to load breakdown values for ${trimmedKey}:`, error)
    return []
  }
}

export { inferMetricKind, inferPromQL, type MetricKind } from './infer-promql'
