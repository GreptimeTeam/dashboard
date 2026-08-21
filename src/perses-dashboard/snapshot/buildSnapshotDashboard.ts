import type { QueryClient } from '@tanstack/react-query'
import type { DashboardResource } from '@perses-dev/core'
import { collectPanelDataFromQueryCache } from './collectFromQueryCache'
import { annotateDashboardCategory, DASHBOARD_CATEGORY_SNAPSHOT } from './dashboardCategory'
import { fillNotLoadedPanelQueries, type PrefetchQueryContext } from './prefetchMissingPanelQueries'
import resolveSnapshotVariables from './resolveSnapshotVariables'
import {
  type EmbeddedSnapshotQuerySpec,
  SNAPSHOT_QUERY_KIND_MAP,
  SNAPSHOT_VERSION,
  type BuildSnapshotResult,
  type SkippedPanelInfo,
  type SnapshotDashboardResource,
  type SnapshotOriginalPlugin,
} from './types'

export interface BuildSnapshotOptions {
  sourceDashboard?: string
  snapshotName?: string
  variables?: Record<string, string | string[]>
  /** When set, not_loaded queries are fetched via plugins (no panel render). */
  prefetchContext?: PrefetchQueryContext
}

function cloneOriginalPlugin(plugin: unknown): SnapshotOriginalPlugin | undefined {
  const candidate = plugin as { kind?: string; spec?: Record<string, unknown> } | undefined
  if (!candidate?.kind) {
    return undefined
  }
  return {
    kind: candidate.kind,
    spec: structuredClone(candidate.spec ?? {}),
  }
}

function prepareSnapshotDashboard(dashboard: DashboardResource): SnapshotDashboardResource {
  const prepared = structuredClone(dashboard) as SnapshotDashboardResource
  const panels = prepared.spec?.panels ?? {}

  Object.entries(panels).forEach(([panelId, panel]) => {
    const queries = panel?.spec?.queries
    if (!Array.isArray(queries)) return

    queries.forEach((queryDef, queryIndex) => {
      const originalKind = queryDef?.spec?.plugin?.kind
      if (!originalKind || !SNAPSHOT_QUERY_KIND_MAP[originalKind]) {
        return
      }

      const originalPlugin = cloneOriginalPlugin(queryDef.spec.plugin)
      const embeddedKind = SNAPSHOT_QUERY_KIND_MAP[originalKind]
      const embeddedSpec: EmbeddedSnapshotQuerySpec = {
        panelId,
        queryIndex,
        originalPlugin,
      }

      queryDef.spec.plugin = {
        kind: embeddedKind,
        spec: embeddedSpec,
      }
    })
  })

  return prepared
}

export async function buildSnapshotDashboard(
  queryClient: QueryClient,
  dashboard: DashboardResource,
  options: BuildSnapshotOptions = {}
): Promise<BuildSnapshotResult> {
  const collected = collectPanelDataFromQueryCache(queryClient, dashboard)
  const { panelData, debug } = collected
  let { timeRange } = collected

  if (options.prefetchContext) {
    const ctx = options.prefetchContext
    await fillNotLoadedPanelQueries(dashboard, panelData, ctx)

    const { absoluteTimeRange } = ctx
    timeRange = {
      from: absoluteTimeRange.start.getTime(),
      to: absoluteTimeRange.end.getTime(),
    }
  }

  const skipped: SkippedPanelInfo[] = []

  const panels = dashboard.spec?.panels ?? {}
  Object.entries(panelData).forEach(([panelId, results]) => {
    results.forEach((result, queryIndex) => {
      if (!result.skipped) return
      skipped.push({
        panelId,
        panelName: panels[panelId]?.spec?.display?.name,
        queryIndex,
        queryKind: result.queryKind,
        reason: result.reason,
        error: result.error,
      })
    })
  })

  const snapshotDashboard = prepareSnapshotDashboard(structuredClone(dashboard))

  const snapshotName =
    options.snapshotName?.trim() ||
    `${dashboard.metadata?.name || dashboard.spec?.display?.name || 'dashboard'}-snapshot`

  snapshotDashboard.metadata = {
    ...snapshotDashboard.metadata,
    name: snapshotName.split('.')[0],
    version: 0,
  }

  if (snapshotDashboard.spec.display) {
    snapshotDashboard.spec.display.name = snapshotName.split('.')[0]
  } else {
    snapshotDashboard.spec.display = { name: snapshotName.split('.')[0] }
  }

  snapshotDashboard.spec.snapshot = {
    version: SNAPSHOT_VERSION,
    capturedAt: new Date().toISOString(),
    sourceDashboard: options.sourceDashboard ?? dashboard.metadata?.name,
    timeRange,
    variables: options.variables ?? resolveSnapshotVariables(dashboard),
    panelData,
  }

  return {
    dashboard: annotateDashboardCategory(snapshotDashboard, DASHBOARD_CATEGORY_SNAPSHOT) as SnapshotDashboardResource,
    skipped,
    debug,
  }
}
