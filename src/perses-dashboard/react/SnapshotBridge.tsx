import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DashboardResource, DatasourceApi } from '@perses-dev/core'
import { usePluginRegistry, type VariableStateMap } from '@perses-dev/plugin-system'
import { adaptRegistryGetPlugin } from '../snapshot/adaptRegistryGetPlugin'
import { buildSnapshotDashboard } from '../snapshot/buildSnapshotDashboard'
import { buildExportPrefetchContext } from '../snapshot/buildExportPrefetchContext'
import { getLiveExportRuntime, resolvePrefetchContext } from '../snapshot/liveExportRuntimeStore'
import { waitForVariablesReady } from '../snapshot/prefetchMissingPanelQueries'

function variableStateToSnapshotVariables(state: VariableStateMap): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  Object.entries(state).forEach(([name, entry]) => {
    if (!entry || entry.loading) return
    const { value } = entry
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value) && value.length === 0) return
    if (name.startsWith('__')) return
    result[name] = value
  })
  return result
}

interface SnapshotBridgeProps {
  dashboard: DashboardResource
  sourceDashboardName: string
  datasourceApi: DatasourceApi
}

/**
 * Export-only listener. Prefers live TimeRange/Variable/Datasource captured inside
 * ViewDashboard; falls back to URL/default constructed context.
 */
export default function SnapshotBridge({ dashboard, sourceDashboardName, datasourceApi }: SnapshotBridgeProps) {
  const queryClient = useQueryClient()
  const { getPlugin } = usePluginRegistry()

  const dashboardRef = React.useRef(dashboard)
  dashboardRef.current = dashboard

  const datasourceApiRef = React.useRef(datasourceApi)
  datasourceApiRef.current = datasourceApi

  const getPluginRef = React.useRef(getPlugin)
  getPluginRef.current = getPlugin

  React.useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type !== 'create-snapshot-request') return
      if (window.parent === window) return

      const { requestId, snapshotName } = event.data

      try {
        const getPluginFn = adaptRegistryGetPlugin(getPluginRef.current)
        const fallback = buildExportPrefetchContext({
          dashboard: dashboardRef.current,
          datasourceApi: datasourceApiRef.current,
          getPlugin: getPluginFn,
        })
        const prefetchContext = resolvePrefetchContext(fallback, getPluginFn)
        if (getLiveExportRuntime()) {
          await waitForVariablesReady(() => getLiveExportRuntime()?.variableState ?? prefetchContext.variableState)
        }
        // Refresh context after wait so variable values are current
        const readyContext = resolvePrefetchContext(fallback, getPluginFn)
        const variables = variableStateToSnapshotVariables(readyContext.variableState)

        const result = await buildSnapshotDashboard(queryClient, dashboardRef.current, {
          sourceDashboard: sourceDashboardName,
          snapshotName,
          prefetchContext: readyContext,
          variables,
        })

        const snapshotData = result.dashboard.spec?.snapshot
        const notLoadedBefore = result.debug?.notLoadedCount
        window.parent.postMessage(
          {
            type: 'create-snapshot-response',
            requestId,
            success: true,
            dashboard: result.dashboard,
            skipped: result.skipped,
            debug: result.debug,
            snapshotData,
          },
          '*'
        )
      } catch (error) {
        window.parent.postMessage(
          {
            type: 'create-snapshot-response',
            requestId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          '*'
        )
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [queryClient, sourceDashboardName])

  return null
}
