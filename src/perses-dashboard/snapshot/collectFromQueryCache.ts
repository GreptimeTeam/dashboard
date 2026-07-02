import type { Query, QueryClient } from '@tanstack/react-query'
import type { DashboardResource } from '@perses-dev/core'
import type { TimeSeriesData } from '@perses-dev/core'
import {
  LIVE_QUERY_KINDS,
  type PanelQueryResult,
  QUERY_KIND_TO_CATEGORY,
  type SnapshotCollectDebugInfo,
  type SnapshotQueryCategory,
} from './types'
import { sanitizeTimeSeriesDataForSnapshot } from './reviveSnapshotPanelData'
import {
  getQueryUpdatedAt,
  getTimeRangeFromQueryKey,
  resolveSnapshotTimeRangeFromMatches,
  type SnapshotTimeRange,
} from './resolveSnapshotTimeRange'

const SNAPSHOT_QUERY_CATEGORIES: SnapshotQueryCategory[] = ['TimeSeriesQuery', 'LogQuery', 'TraceQuery']

function stableStringify(value: unknown): string {
  return JSON.stringify(value)
}

function normalizePluginSpec(spec: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!spec) {
    return {}
  }
  const next = { ...spec }
  delete next.datasource
  return next
}

function extractPlugin(definition: unknown): { kind?: string; spec?: Record<string, unknown> } | undefined {
  const def = definition as {
    kind?: string
    spec?: { plugin?: { kind?: string; spec?: Record<string, unknown> }; query?: unknown; expr?: unknown }
  }

  if (def?.spec?.plugin) {
    return def.spec.plugin
  }

  if (def?.kind && def.spec && !def.spec.plugin) {
    return { kind: def.kind, spec: def.spec as Record<string, unknown> }
  }

  return undefined
}

function getInnerPluginFingerprint(definition: unknown): string {
  const plugin = extractPlugin(definition)
  if (!plugin?.kind) {
    return ''
  }

  return stableStringify({
    kind: plugin.kind,
    spec: normalizePluginSpec(plugin.spec),
  })
}

function getQueryPreview(definition: unknown): string | undefined {
  const plugin = extractPlugin(definition)
  const spec = plugin?.spec
  if (!spec) {
    return undefined
  }

  const candidate = spec.query ?? spec.expr ?? spec.promql
  return typeof candidate === 'string' ? candidate.slice(0, 120) : undefined
}

function hasUsableCacheData(query: Query): boolean {
  return query.state.status === 'success' && query.state.data !== undefined
}

function getQueryCacheEntries(queryClient: QueryClient, category: SnapshotQueryCategory) {
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((query) => {
      const key = query.queryKey
      return Array.isArray(key) && key[0] === 'query' && key[1] === category
    })
}

function pickBestMatchingQuery(queries: Query[]): Query | undefined {
  return queries.reduce<Query | undefined>((best, query) => {
    if (!best) {
      return query
    }
    return getQueryUpdatedAt(query) >= getQueryUpdatedAt(best) ? query : best
  }, undefined)
}

function pickCachedQueryFromQueries(queries: Query[], definition: unknown): Query | undefined {
  const usable = queries.filter(hasUsableCacheData)
  if (usable.length === 0) {
    return undefined
  }

  const byReference = pickBestMatchingQuery(usable.filter((query) => query.queryKey[2] === definition))
  if (byReference) {
    return byReference
  }

  const targetJson = stableStringify(definition)
  const byJson = pickBestMatchingQuery(usable.filter((query) => stableStringify(query.queryKey[2]) === targetJson))
  if (byJson) {
    return byJson
  }

  const fingerprint = getInnerPluginFingerprint(definition)
  if (!fingerprint) {
    return undefined
  }

  return pickBestMatchingQuery(usable.filter((query) => getInnerPluginFingerprint(query.queryKey[2]) === fingerprint))
}

interface CachedQueryMatch {
  data: unknown
  timeRange?: SnapshotTimeRange
  updatedAt: number
}

function findCachedQueryMatch(
  queryClient: QueryClient,
  definition: unknown,
  category: SnapshotQueryCategory
): CachedQueryMatch | undefined {
  const match = pickCachedQueryFromQueries(getQueryCacheEntries(queryClient, category), definition)
  if (!match) {
    return undefined
  }

  return {
    data: match.state.data,
    timeRange: getTimeRangeFromQueryKey(match),
    updatedAt: getQueryUpdatedAt(match),
  }
}

function buildCollectDebugInfo(
  queryClient: QueryClient,
  dashboard: DashboardResource,
  panelData: Record<string, PanelQueryResult[]>,
  activeTimeRange: SnapshotTimeRange
): SnapshotCollectDebugInfo {
  const persesQueryEntries: SnapshotCollectDebugInfo['persesQueryEntries'] = []
  const panelLookups: SnapshotCollectDebugInfo['panelLookups'] = []

  SNAPSHOT_QUERY_CATEGORIES.forEach((category) => {
    getQueryCacheEntries(queryClient, category).forEach((query) => {
      const plugin = extractPlugin(query.queryKey[2])
      const queryTimeRange = getTimeRangeFromQueryKey(query)
      persesQueryEntries.push({
        category,
        status: query.state.status,
        hasData: query.state.data !== undefined,
        pluginKind: plugin?.kind ?? 'unknown',
        fingerprint: getInnerPluginFingerprint(query.queryKey[2]),
        queryPreview: getQueryPreview(query.queryKey[2]),
        timeRange: queryTimeRange,
        matchesActiveTimeRange:
          queryTimeRange != null &&
          queryTimeRange.from === activeTimeRange.from &&
          queryTimeRange.to === activeTimeRange.to,
      })
    })
  })

  const panels = dashboard.spec?.panels ?? {}
  Object.entries(panels).forEach(([panelId, panel]) => {
    const queries = panel?.spec?.queries
    if (!Array.isArray(queries)) {
      return
    }

    queries.forEach((queryDef, queryIndex) => {
      const queryKind = queryDef?.spec?.plugin?.kind ?? 'unknown'
      const fingerprint = getInnerPluginFingerprint(queryDef)
      const result = panelData[panelId]?.[queryIndex]
      panelLookups.push({
        panelId,
        queryIndex,
        queryKind,
        fingerprint,
        matched: Boolean(result && !result.skipped),
      })
    })
  })

  return {
    totalCacheQueries: queryClient.getQueryCache().getAll().length,
    activeTimeRange,
    persesQueryEntries,
    otherCacheKeySamples: queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => {
        const key = query.queryKey
        return !Array.isArray(key) || key[0] !== 'query'
      })
      .slice(0, 10)
      .map((query) => ({
        head: Array.isArray(query.queryKey) ? query.queryKey.slice(0, 3) : query.queryKey,
        status: query.state.status,
        hasData: query.state.data !== undefined,
      })),
    panelLookups,
  }
}

function sanitizeCachedData(cached: unknown, queryKind: string): PanelQueryResult['normalized'] {
  if (queryKind.includes('TimeSeries') || queryKind.includes('Prometheus')) {
    return sanitizeTimeSeriesDataForSnapshot(cached as TimeSeriesData)
  }
  return cached as PanelQueryResult['normalized']
}

export interface CollectPanelDataResult {
  panelData: Record<string, PanelQueryResult[]>
  timeRange: { from: number; to: number }
  debug: SnapshotCollectDebugInfo
}

export function collectPanelDataFromQueryCache(
  queryClient: QueryClient,
  dashboard: DashboardResource
): CollectPanelDataResult {
  const panelData: Record<string, PanelQueryResult[]> = {}
  const panels = dashboard.spec?.panels ?? {}
  const matchedTimeRanges: Array<{ range: SnapshotTimeRange; updatedAt: number }> = []

  Object.entries(panels).forEach(([panelId, panel]) => {
    const queries = panel?.spec?.queries
    if (!Array.isArray(queries) || queries.length === 0) {
      return
    }

    panelData[panelId] = queries.map((queryDef) => {
      const queryKind = queryDef?.spec?.plugin?.kind ?? 'unknown'

      if (!LIVE_QUERY_KINDS.has(queryKind)) {
        return {
          queryKind,
          skipped: true,
          reason: 'unsupported_query_kind' as const,
          error: `Query kind "${queryKind}" is not supported for snapshots`,
        }
      }

      const category = QUERY_KIND_TO_CATEGORY[queryKind]
      if (!category) {
        return {
          queryKind,
          skipped: true,
          reason: 'unsupported_query_kind' as const,
        }
      }

      const match = findCachedQueryMatch(queryClient, queryDef, category)
      if (match === undefined) {
        return {
          queryKind,
          skipped: true,
          reason: 'not_loaded' as const,
        }
      }

      if (match.timeRange) {
        matchedTimeRanges.push({
          range: match.timeRange,
          updatedAt: match.updatedAt,
        })
      }

      const { data: cached } = match
      if (cached && typeof cached === 'object' && 'error' in (cached as object)) {
        return {
          queryKind,
          skipped: true,
          reason: 'query_error' as const,
          error: String((cached as { error?: unknown }).error ?? 'Query failed'),
        }
      }

      return {
        queryKind,
        normalized: sanitizeCachedData(cached, queryKind),
      }
    })
  })

  const timeRange = resolveSnapshotTimeRangeFromMatches(matchedTimeRanges, queryClient, dashboard)

  return {
    panelData,
    timeRange,
    debug: buildCollectDebugInfo(queryClient, dashboard, panelData, timeRange),
  }
}
