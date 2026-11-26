import { getMetricNames, getSeries, type MetricNamesOptions } from '@/api/metrics'
import { buildPromMatchSelector } from '../filters'
import type { DrilldownFilter } from '../types'

export function buildMatchSelector(filters: DrilldownFilter[], metric?: string): string | undefined {
  return buildPromMatchSelector(filters, { metric })
}

function uniqueMetricNamesFromSeries(payload: unknown): string[] {
  if (!Array.isArray(payload)) {
    return []
  }
  const names = payload
    .map((item) => {
      if (item && typeof item === 'object' && '__name__' in item) {
        const value = (item as Record<string, unknown>).__name__
        return typeof value === 'string' ? value : ''
      }
      return ''
    })
    .filter(Boolean)
  return [...new Set(names)]
}

export async function fetchMetricNamesPool(
  options: MetricNamesOptions
): Promise<{ names: string[]; truncated: boolean }> {
  // `0` means unlimited: the catalog needs the complete pool to build accurate
  // prefix/suffix groups. Callers that still need a cap can pass an explicit limit.
  const limit = options.limit ?? 0
  try {
    const response = await getMetricNames({ ...options, limit })
    const names = Array.isArray(response.data) ? (response.data as string[]) : []
    return {
      names,
      truncated: limit > 0 && names.length >= limit,
    }
  } catch (error) {
    const selector = options.match?.find((item) => item.trim() && item.trim() !== '{}')
    if (!selector) {
      throw error
    }
    const response = await getSeries(selector, options.start, options.end, options.database)
    const names = uniqueMetricNamesFromSeries(response.data)
    return {
      names,
      truncated: limit > 0 && names.length >= limit,
    }
  }
}
