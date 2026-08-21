import type { AbsoluteTimeRange } from '@perses-dev/core'
import type { DatasourceStore, VariableStateMap } from '@perses-dev/plugin-system'
import type { PrefetchQueryContext } from './prefetchMissingPanelQueries'

export type LiveExportRuntime = {
  absoluteTimeRange: AbsoluteTimeRange
  variableState: VariableStateMap
  datasourceStore: DatasourceStore
}

let liveExportRuntime: LiveExportRuntime | undefined

export function setLiveExportRuntime(runtime: LiveExportRuntime | undefined) {
  liveExportRuntime = runtime
}

export function getLiveExportRuntime(): LiveExportRuntime | undefined {
  return liveExportRuntime
}

/** Prefer live dashboard providers; fall back to export-time constructed context. */
export function resolvePrefetchContext(
  fallback: PrefetchQueryContext,
  getPlugin: PrefetchQueryContext['getPlugin']
): PrefetchQueryContext {
  const live = getLiveExportRuntime()
  if (!live) {
    return fallback
  }
  return {
    absoluteTimeRange: live.absoluteTimeRange,
    variableState: live.variableState,
    getVariableState: () => getLiveExportRuntime()?.variableState ?? live.variableState,
    datasourceStore: live.datasourceStore,
    getPlugin,
  }
}
