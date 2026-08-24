import type { Query, QueryClient } from '@tanstack/react-query'
import type { DashboardResource } from '@perses-dev/core'
import { toAbsoluteTimeRange } from '@perses-dev/core'
import { isDurationString, type DurationString } from '@perses-dev/spec'

export interface SnapshotTimeRange {
  from: number
  to: number
}

/** Accepts export format `{ from, to }` or persisted `{ start, end }` (ISO / epoch). */
export type SnapshotTimeRangeInput = {
  from?: unknown
  to?: unknown
  start?: unknown
  end?: unknown
}

export function toEpochMs(value: unknown): number | undefined {
  if (value instanceof Date) {
    return value.getTime()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) {
      return asNumber
    }
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

export function normalizeSnapshotTimeRange(input: SnapshotTimeRangeInput | undefined): SnapshotTimeRange | undefined {
  if (!input || typeof input !== 'object') {
    return undefined
  }

  const from = toEpochMs(input.from ?? input.start)
  const to = toEpochMs(input.to ?? input.end)

  if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to)) {
    return undefined
  }

  return { from, to }
}

export function getTimeRangeFromQueryKey(query: Query): SnapshotTimeRange | undefined {
  const key = query.queryKey
  if (!Array.isArray(key) || key[0] !== 'query') {
    return undefined
  }

  const timeRange = key[3] as { start?: unknown; end?: unknown; from?: unknown; to?: unknown } | undefined
  const from = toEpochMs(timeRange?.start ?? timeRange?.from)
  const to = toEpochMs(timeRange?.end ?? timeRange?.to)

  if (from == null || to == null) {
    return undefined
  }

  return { from, to }
}

export function timeRangesMatch(a: SnapshotTimeRange, b: SnapshotTimeRange, toleranceMs = 1000): boolean {
  return Math.abs(a.from - b.from) <= toleranceMs && Math.abs(a.to - b.to) <= toleranceMs
}

export function snapshotTimeRangeToAbsoluteValue(
  input: SnapshotTimeRangeInput | undefined
): { start: Date; end: Date } | undefined {
  const frozen = normalizeSnapshotTimeRange(input)
  if (!frozen) {
    return undefined
  }
  return {
    start: new Date(frozen.from),
    end: new Date(frozen.to),
  }
}

export function resolveTimeRangeFromUrl(
  search = typeof window !== 'undefined' ? window.location.search : '',
  defaultDuration = '1h'
): SnapshotTimeRange | undefined {
  const params = new URLSearchParams(search)
  const startParam = params.get('start')
  const endParam = params.get('end')

  if (!startParam) {
    return undefined
  }

  if (isDurationString(startParam)) {
    const absolute = toAbsoluteTimeRange({ pastDuration: startParam as DurationString })
    return {
      from: absolute.start.getTime(),
      to: absolute.end.getTime(),
    }
  }

  const from = toEpochMs(startParam)
  const to = toEpochMs(endParam)
  if (from != null && to != null) {
    return { from, to }
  }

  if (from != null && isDurationString(defaultDuration)) {
    const absolute = toAbsoluteTimeRange({ pastDuration: defaultDuration as DurationString })
    return {
      from,
      to: absolute.end.getTime(),
    }
  }

  return undefined
}

export function resolveBestTimeRangeFromCache(queryClient: QueryClient): SnapshotTimeRange | undefined {
  const scores = new Map<string, { range: SnapshotTimeRange; score: number }>()

  queryClient
    .getQueryCache()
    .getAll()
    .forEach((query) => {
      const range = getTimeRangeFromQueryKey(query)
      if (!range) {
        return
      }

      const key = `${range.from}:${range.to}`
      const observerCount = query.observers?.length ?? 0
      const updatedAt = query.state.dataUpdatedAt ?? 0
      const score = observerCount * 1_000_000_000_000 + updatedAt
      const existing = scores.get(key)

      if (!existing || score > existing.score) {
        scores.set(key, { range, score })
      }
    })

  let best: SnapshotTimeRange | undefined
  let bestScore = -1

  scores.forEach(({ range, score }) => {
    if (score > bestScore) {
      bestScore = score
      best = range
    }
  })

  return best
}

export function resolveSnapshotTimeRange(queryClient: QueryClient, dashboard?: DashboardResource): SnapshotTimeRange {
  const defaultDuration = typeof dashboard?.spec?.duration === 'string' ? dashboard.spec.duration : '1h'

  const fromCache = resolveBestTimeRangeFromCache(queryClient)
  if (fromCache) {
    return fromCache
  }

  const fromUrl = resolveTimeRangeFromUrl(undefined, defaultDuration)
  if (fromUrl) {
    return fromUrl
  }

  const now = Date.now()
  if (isDurationString(defaultDuration)) {
    const absolute = toAbsoluteTimeRange({ pastDuration: defaultDuration })
    return {
      from: absolute.start.getTime(),
      to: absolute.end.getTime(),
    }
  }

  return { from: now - 60 * 60 * 1000, to: now }
}

export function resolveSnapshotTimeRangeFromMatches(
  matched: Array<{ range: SnapshotTimeRange; updatedAt: number }>,
  queryClient: QueryClient,
  dashboard?: DashboardResource
): SnapshotTimeRange {
  if (matched.length > 0) {
    const best = matched.reduce((current, candidate) =>
      candidate.updatedAt >= current.updatedAt ? candidate : current
    )
    return best.range
  }

  return resolveSnapshotTimeRange(queryClient, dashboard)
}

export function timeRangesLooselyMatch(
  a: SnapshotTimeRange,
  b: SnapshotTimeRange,
  endDriftMs = 10 * 60 * 1000
): boolean {
  const durationA = a.to - a.from
  const durationB = b.to - b.from
  if (Math.abs(durationA - durationB) > 2000) {
    return false
  }
  return Math.abs(a.to - b.to) <= endDriftMs && Math.abs(a.from - b.from) <= endDriftMs
}

export function queryMatchesTimeRangeLoosely(query: Query, activeTimeRange: SnapshotTimeRange | undefined): boolean {
  if (!activeTimeRange) {
    return true
  }

  const range = getTimeRangeFromQueryKey(query)
  if (!range) {
    return false
  }

  if (timeRangesMatch(range, activeTimeRange)) {
    return true
  }

  return timeRangesLooselyMatch(range, activeTimeRange)
}

export function queryMatchesTimeRange(query: Query, activeTimeRange: SnapshotTimeRange | undefined): boolean {
  if (!activeTimeRange) {
    return true
  }

  const range = getTimeRangeFromQueryKey(query)
  if (!range) {
    return false
  }

  return timeRangesMatch(range, activeTimeRange)
}

export function getQueryUpdatedAt(query: Query): number {
  return query.state.dataUpdatedAt ?? 0
}
