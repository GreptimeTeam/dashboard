/**
 * Fill `not_loaded` snapshot panel queries by calling Perses query plugins directly.
 * Does not mount/render panels — only fetches query results into panelData.
 */
import type { AbsoluteTimeRange, DashboardResource } from '@perses-dev/core'
import type { DatasourceStore, VariableStateMap } from '@perses-dev/plugin-system'
import { sanitizeTimeSeriesDataForSnapshot } from './reviveSnapshotPanelData'
import { LIVE_QUERY_KINDS, QUERY_KIND_TO_CATEGORY, type PanelQueryResult, type SnapshotQueryCategory } from './types'

export interface PrefetchQueryContext {
  absoluteTimeRange: AbsoluteTimeRange
  variableState: VariableStateMap
  /** Fresh variable state for wait-for-ready; defaults to `variableState`. */
  getVariableState?: () => VariableStateMap
  datasourceStore: DatasourceStore
  getPlugin: (args: { kind: 'TimeSeriesQuery' | 'LogQuery' | 'TraceQuery' | 'Datasource'; name: string }) => Promise<{
    getTimeSeriesData?: (spec: never, ctx: unknown, signal?: AbortSignal) => Promise<unknown>
    getLogData?: (spec: never, ctx: unknown, signal?: AbortSignal) => Promise<unknown>
    getTraceData?: (spec: never, ctx: unknown, signal?: AbortSignal) => Promise<unknown>
    createClient?: (spec: unknown, options: { proxyUrl: string }) => unknown
  }>
  /** Max concurrent plugin fetches. Default 6. */
  concurrency?: number
}

interface MissingQueryJob {
  panelId: string
  queryIndex: number
  queryKind: string
  category: SnapshotQueryCategory
  pluginSpec: unknown
}

const DEFAULT_CONCURRENCY = 6

function sanitizeQueryData(cached: unknown, queryKind: string): PanelQueryResult['normalized'] {
  if (queryKind.includes('TimeSeries') || queryKind.includes('Prometheus')) {
    return sanitizeTimeSeriesDataForSnapshot(cached as import('@perses-dev/core').TimeSeriesData)
  }
  return cached as PanelQueryResult['normalized']
}

function extractPluginSpec(queryDef: {
  spec?: { plugin?: { kind?: string; spec?: unknown } }
}): { kind?: string; spec?: unknown } | undefined {
  return queryDef?.spec?.plugin
}

function collectMissingJobs(
  dashboard: DashboardResource,
  panelData: Record<string, PanelQueryResult[]>
): MissingQueryJob[] {
  const jobs: MissingQueryJob[] = []
  const panels = dashboard.spec?.panels ?? {}

  Object.entries(panelData).forEach(([panelId, results]) => {
    const queries = panels[panelId]?.spec?.queries
    if (!Array.isArray(queries)) return

    results.forEach((result, queryIndex) => {
      if (!result.skipped || result.reason !== 'not_loaded') return

      const queryDef = queries[queryIndex]
      const plugin = extractPluginSpec(queryDef as { spec?: { plugin?: { kind?: string; spec?: unknown } } })
      const queryKind = plugin?.kind ?? result.queryKind
      const category = QUERY_KIND_TO_CATEGORY[queryKind]

      if (!LIVE_QUERY_KINDS.has(queryKind) || !category || plugin?.spec === undefined) {
        return
      }

      jobs.push({
        panelId,
        queryIndex,
        queryKind,
        category,
        pluginSpec: plugin.spec,
      })
    })
  })

  return jobs
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return

  const queue = items.slice()
  const limit = Math.max(1, Math.min(concurrency, items.length))

  const drain = async (): Promise<void> => {
    const item = queue.shift()
    if (item === undefined) {
      return
    }
    await worker(item)
    await drain()
  }

  await Promise.all(Array.from({ length: limit }, () => drain()))
}

async function fetchOneQuery(job: MissingQueryJob, ctx: PrefetchQueryContext): Promise<PanelQueryResult> {
  const queryCtx = {
    timeRange: ctx.absoluteTimeRange,
    variableState: ctx.variableState,
    datasourceStore: ctx.datasourceStore,
  }

  try {
    if (job.category === 'TimeSeriesQuery') {
      const plugin = await ctx.getPlugin({ kind: 'TimeSeriesQuery', name: job.queryKind })
      if (!plugin.getTimeSeriesData) {
        throw new Error(`Plugin "${job.queryKind}" has no getTimeSeriesData`)
      }
      const data = await plugin.getTimeSeriesData(job.pluginSpec as never, queryCtx)
      if (data && typeof data === 'object' && 'error' in data && (data as { error?: unknown }).error) {
        return {
          queryKind: job.queryKind,
          skipped: true,
          reason: 'query_error',
          error: String((data as { error?: unknown }).error),
        }
      }
      return {
        queryKind: job.queryKind,
        normalized: sanitizeQueryData(data, job.queryKind),
      }
    }

    if (job.category === 'LogQuery') {
      const plugin = await ctx.getPlugin({ kind: 'LogQuery', name: job.queryKind })
      if (!plugin.getLogData) {
        throw new Error(`Plugin "${job.queryKind}" has no getLogData`)
      }
      const data = await plugin.getLogData(job.pluginSpec as never, { ...queryCtx, refreshKey: '' })
      return {
        queryKind: job.queryKind,
        normalized: sanitizeQueryData(data, job.queryKind),
      }
    }

    const plugin = await ctx.getPlugin({ kind: 'TraceQuery', name: job.queryKind })
    if (!plugin.getTraceData) {
      throw new Error(`Plugin "${job.queryKind}" has no getTraceData`)
    }
    const data = await plugin.getTraceData(job.pluginSpec as never, {
      datasourceStore: ctx.datasourceStore,
      variableState: ctx.variableState,
      absoluteTimeRange: ctx.absoluteTimeRange,
    })
    return {
      queryKind: job.queryKind,
      normalized: sanitizeQueryData(data, job.queryKind),
    }
  } catch (error) {
    return {
      queryKind: job.queryKind,
      skipped: true,
      reason: 'query_error',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Wait briefly if dashboard variables are still loading, so prefetch uses resolved values.
 */
export async function waitForVariablesReady(
  getVariableState: () => VariableStateMap,
  options: { timeoutMs?: number; pollMs?: number } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000
  const pollMs = options.pollMs ?? 100
  const deadline = Date.now() + timeoutMs

  const poll = async (): Promise<void> => {
    const state = getVariableState()
    const stillLoading = Object.values(state).some((v) => v?.loading)
    if (!stillLoading || Date.now() >= deadline) {
      return
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, pollMs)
    })
    await poll()
  }

  await poll()
}

/**
 * Mutates `panelData` in place: replaces `not_loaded` entries with fetched results (or query_error).
 * Does not render panels.
 */
export async function fillNotLoadedPanelQueries(
  dashboard: DashboardResource,
  panelData: Record<string, PanelQueryResult[]>,
  ctx: PrefetchQueryContext
): Promise<number> {
  const jobs = collectMissingJobs(dashboard, panelData)
  if (jobs.length === 0) {
    return 0
  }

  await runWithConcurrency(jobs, ctx.concurrency ?? DEFAULT_CONCURRENCY, async (job) => {
    const filled = await fetchOneQuery(job, ctx)
    const row = panelData[job.panelId]
    if (row) {
      row[job.queryIndex] = filled
    }
  })

  return jobs.length
}
