/**
 * Build PrefetchQueryContext only at snapshot-export time (no live dashboard providers).
 */
import type {
  AbsoluteTimeRange,
  DashboardResource,
  DatasourceApi,
  DatasourceSelector,
  DatasourceSpec,
} from '@perses-dev/core'
import { toAbsoluteTimeRange } from '@perses-dev/core'
import { isDurationString, type DurationString } from '@perses-dev/spec'
import type { DatasourceStore, VariableStateMap } from '@perses-dev/plugin-system'
import { adaptRegistryGetPlugin } from './adaptRegistryGetPlugin'
import type { PrefetchQueryContext } from './prefetchMissingPanelQueries'
import resolveSnapshotVariables from './resolveSnapshotVariables'
import { resolveTimeRangeFromUrl, type SnapshotTimeRange } from './resolveSnapshotTimeRange'

type GetPlugin = ReturnType<typeof adaptRegistryGetPlugin>

export interface BuildExportPrefetchContextOptions {
  dashboard: DashboardResource
  datasourceApi: DatasourceApi
  getPlugin: GetPlugin
  search?: string
}

function toAbsoluteTimeRangeValue(range: SnapshotTimeRange): AbsoluteTimeRange {
  return {
    start: new Date(range.from),
    end: new Date(range.to),
  }
}

function resolveExportAbsoluteTimeRange(dashboard: DashboardResource, search: string): AbsoluteTimeRange {
  const defaultDuration =
    typeof dashboard.spec?.duration === 'string' && isDurationString(dashboard.spec.duration)
      ? dashboard.spec.duration
      : ('1h' as DurationString)

  const fromUrl = resolveTimeRangeFromUrl(search, defaultDuration)
  if (fromUrl) {
    return toAbsoluteTimeRangeValue(fromUrl)
  }

  const absolute = toAbsoluteTimeRange({ pastDuration: defaultDuration })
  return {
    start: absolute.start,
    end: absolute.end,
  }
}

function buildVariableStateMap(dashboard: DashboardResource, search: string): VariableStateMap {
  const values = resolveSnapshotVariables(dashboard, search)
  const state: VariableStateMap = {}
  Object.entries(values).forEach(([name, value]) => {
    state[name] = {
      value,
      loading: false,
    }
  })
  return state
}

function findDashboardDatasource(
  dashboardDatasources: DashboardResource['spec']['datasources'] | undefined,
  selector: DatasourceSelector
): { name: string; spec: DatasourceSpec } | undefined {
  if (!dashboardDatasources) return undefined

  if (selector.name !== undefined) {
    const named = dashboardDatasources[selector.name]
    if (named === undefined) return undefined
    return named.plugin.kind === selector.kind ? { name: selector.name, spec: named } : undefined
  }

  const result = Object.entries(dashboardDatasources).find(
    ([, spec]) => spec.plugin.kind === selector.kind && spec.default
  )
  if (!result) return undefined
  return { name: result[0], spec: result[1] }
}

function buildProxyUrl(api: DatasourceApi, params: { project?: string; dashboard?: string; name: string }): string {
  return api.buildProxyUrl ? api.buildProxyUrl(params) : ''
}

/**
 * Minimal DatasourceStore for export-time plugin queries (getDatasource / getDatasourceClient only).
 */
export function createExportDatasourceStore(options: {
  dashboard: DashboardResource
  datasourceApi: DatasourceApi
  getPlugin: GetPlugin
}): DatasourceStore {
  const { dashboard, datasourceApi, getPlugin } = options
  const project = dashboard.metadata?.project
  const specCache = new Map<string, DatasourceSpec>()

  const cacheKey = (selector: DatasourceSelector) => {
    const name = selector.name === undefined ? '__undefined__' : selector.name
    return `${selector.kind}:${name}:${project ?? 'global'}`
  }

  const findDatasource = async (selector: DatasourceSelector) => {
    const fromDashboard = findDashboardDatasource(dashboard.spec?.datasources, selector)
    if (fromDashboard) {
      const result = {
        spec: fromDashboard.spec,
        proxyUrl: buildProxyUrl(datasourceApi, {
          project: dashboard.metadata.project,
          dashboard: dashboard.metadata.name,
          name: fromDashboard.name,
        }),
      }
      specCache.set(cacheKey(selector), result.spec)
      return result
    }

    if (project) {
      const datasource = await datasourceApi.getDatasource(String(project), selector)
      if (datasource !== undefined) {
        const result = {
          spec: datasource.spec,
          proxyUrl: buildProxyUrl(datasourceApi, {
            project: datasource.metadata.project,
            name: datasource.metadata.name,
          }),
        }
        specCache.set(cacheKey(selector), result.spec)
        return result
      }
    }

    const globalDatasource = await datasourceApi.getGlobalDatasource(selector)
    if (globalDatasource !== undefined) {
      const result = {
        spec: globalDatasource.spec,
        proxyUrl: buildProxyUrl(datasourceApi, {
          name: globalDatasource.metadata.name,
        }),
      }
      specCache.set(cacheKey(selector), result.spec)
      return result
    }

    throw new Error(`No datasource found for kind '${selector.kind}' and name '${selector.name}'`)
  }

  return {
    getDatasource: async (selector) => {
      const { spec } = await findDatasource(selector)
      return spec
    },
    getDatasourceClient: async <Client>(selector: DatasourceSelector): Promise<Client> => {
      const { kind } = selector
      const [{ spec, proxyUrl }, plugin] = await Promise.all([
        findDatasource(selector),
        getPlugin({ kind: 'Datasource', name: kind }),
      ])
      if (!plugin.createClient) {
        throw new Error(`Datasource plugin '${kind}' has no createClient`)
      }
      return plugin.createClient(spec.plugin.spec, { proxyUrl }) as Client
    },
    listDatasourceSelectItems: async () => [],
    getLocalDatasources: () => dashboard.spec?.datasources ?? {},
    setLocalDatasources: () => undefined,
    getSavedDatasources: () => ({}),
    setSavedDatasources: () => undefined,
  }
}

export function buildExportPrefetchContext(options: BuildExportPrefetchContextOptions): PrefetchQueryContext {
  const search = options.search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const absoluteTimeRange = resolveExportAbsoluteTimeRange(options.dashboard, search)
  const variableState = buildVariableStateMap(options.dashboard, search)
  const datasourceStore = createExportDatasourceStore({
    dashboard: options.dashboard,
    datasourceApi: options.datasourceApi,
    getPlugin: options.getPlugin,
  })

  return {
    absoluteTimeRange,
    variableState,
    getVariableState: () => variableState,
    datasourceStore,
    getPlugin: options.getPlugin,
  }
}
