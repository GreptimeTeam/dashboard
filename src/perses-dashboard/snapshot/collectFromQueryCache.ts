/**
 * Snapshot export: read panel query results from Perses global TanStack Query cache.
 *
 * ## Why matching instead of panelId lookup
 *
 * Perses does not expose `getPanelData(panelId)`. Each panel's `DataQueriesProvider` runs
 * queries into a **shared** cache keyed by query definition + time range + variables — not
 * by panelId. See `@perses-dev/plugin-system` `time-series-queries.js` / `log-queries.js`:
 *
 *   ['query', category, definition, timeRange, variablesValueKey, ...]
 *
 * `GridItemContent` also strips queries before caching (`{ kind: plugin.kind, spec: plugin.spec }`
 * then re-wrapped in `DataQueriesProvider`), so dashboard JSON `queryDef` objects rarely match
 * cache key[2] by reference. We therefore match by JSON or plugin fingerprint.
 *
 * ## Matching pipeline (per panel query)
 *
 * 1. Iterate `dashboard.spec.panels` by `panelId` (output is keyed by panelId; lookup is not).
 * 2. Map plugin kind → cache category (`GreptimeDBTimeSeriesQuery` → `TimeSeriesQuery`, etc.).
 * 3. Scan all cache entries where `queryKey[0] === 'query'` and `queryKey[1] === category`.
 * 4. Keep only `status === 'success'` with `data !== undefined`.
 * 5. Pick best match in order (first tier with hits wins):
 *    a. **Reference** — `queryKey[2] === queryDef` (same object; rare across dashboard vs runtime).
 *    b. **JSON** — `JSON.stringify(queryKey[2]) === JSON.stringify(queryDef)`.
 *    c. **Fingerprint** — inner plugin `{ kind, spec }` with `datasource` stripped from spec.
 * 6. If multiple entries match a tier, take the one with latest `dataUpdatedAt`.
 *
 * ## Not enforced during match (known limitations)
 *
 * - Active dashboard time range is **not** required to match `queryKey[3]` (used only for snapshot
 *   `timeRange` inference and debug `matchesActiveTimeRange`).
 * - Variable values in `queryKey[4+]` are **not** compared to current dashboard variables.
 * - Panels that never scrolled into view have `queryOptions.enabled: inView === false` → no cache →
 *   `not_loaded` (export path fills these via `fillNotLoadedPanelQueries` without rendering).
 * - Two panels with identical queries share one cache entry; both match the same data.
 *
 * ## Data transform at export vs view
 *
 * Matched cache `data` is stored as `normalized` in the snapshot JSON. TimeSeries/Prometheus
 * queries run through `sanitizeTimeSeriesDataForSnapshot` here so persisted series timestamps are
 * canonical ms numbers (JSON-safe). Log/Trace are stored as-is from cache. On snapshot **view**,
 * `snapshotEmbedStore` + `reviveNormalizedQueryData` revive Dates and normalize all kinds again
 * after JSON parse — that is the primary transform path; export-time TimeSeries sanitize is an
 * optional canonicalization layer, not required for correctness if view revive always runs.
 */
import type { Query, QueryClient } from '@tanstack/react-query'
import type { DashboardResource, TimeSeriesData } from '@perses-dev/core'
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

/** Perses cache categories we scan (`queryKey[1]`). */
const SNAPSHOT_QUERY_CATEGORIES: SnapshotQueryCategory[] = ['TimeSeriesQuery', 'LogQuery', 'TraceQuery']

function stableStringify(value: unknown): string {
  return JSON.stringify(value)
}

/** Strip datasource from plugin spec so dashboard vs runtime cache keys can still fingerprint-match. */
function normalizePluginSpec(spec: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!spec) {
    return {}
  }
  const next = { ...spec }
  delete next.datasource
  return next
}

/**
 * Unwrap Perses query definition shapes:
 * - Dashboard / cache wrapped: `{ kind: 'TimeSeriesQuery', spec: { plugin: { kind, spec } } }`
 * - GridItemContent stripped: `{ kind: '<PluginQueryKind>', spec: { query, ... } }`
 */
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

/** Fingerprint for tier-3 matching: `JSON.stringify({ kind, spec })` with datasource removed. */
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

/** Only successful queries with materialized data are eligible for snapshot export. */
function hasUsableCacheData(query: Query): boolean {
  return query.state.status === 'success' && query.state.data !== undefined
}

/** All Perses query cache rows for one category (`TimeSeriesQuery` | `LogQuery` | `TraceQuery`). */
function getQueryCacheEntries(queryClient: QueryClient, category: SnapshotQueryCategory) {
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((query) => {
      const key = query.queryKey
      return Array.isArray(key) && key[0] === 'query' && key[1] === category
    })
}

/** When several cache rows match the same tier, prefer the most recently updated result. */
function pickBestMatchingQuery(queries: Query[]): Query | undefined {
  return queries.reduce<Query | undefined>((best, query) => {
    if (!best) {
      return query
    }
    return getQueryUpdatedAt(query) >= getQueryUpdatedAt(best) ? query : best
  }, undefined)
}

/**
 * Three-tier cache match for one dashboard `queryDef` within a single category bucket.
 * See file header for full rules and limitations.
 */
function pickCachedQueryFromQueries(queries: Query[], definition: unknown): Query | undefined {
  const usable = queries.filter(hasUsableCacheData)
  if (usable.length === 0) {
    return undefined
  }

  // Tier 1: same definition object reference (uncommon between dashboard spec and runtime cache).
  const byReference = pickBestMatchingQuery(usable.filter((query) => query.queryKey[2] === definition))
  if (byReference) {
    return byReference
  }

  // Tier 2: deep structural equality via JSON (handles wrapper shape differences if identical).
  const targetJson = stableStringify(definition)
  const byJson = pickBestMatchingQuery(usable.filter((query) => stableStringify(query.queryKey[2]) === targetJson))
  if (byJson) {
    return byJson
  }

  // Tier 3: plugin kind + spec fingerprint (ignores datasource and outer TimeSeriesQuery wrapper).
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

/** Resolve one panel query to cache data + optional time range from `queryKey[3]`. */
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

/**
 * Export-time normalization before JSON persistence.
 * TimeSeries only: canonicalize point timestamps to ms. Log/Trace pass through; view-time
 * `reviveNormalizedQueryData` handles revival for all kinds after parse.
 */
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

/**
 * Walk every panel in dashboard spec, match each live query to global Perses cache, and build
 * `panelData[panelId][queryIndex]`. Skipped entries record `not_loaded` / `query_error` / etc.
 */
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
