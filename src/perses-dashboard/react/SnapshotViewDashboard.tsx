import * as React from 'react'
import { Box } from '@mui/material'
import {
  DashboardProvider,
  DatasourceStoreProvider,
  VariableProvider,
  type OnSaveDashboard,
  type ViewDashboardProps,
} from '@perses-dev/dashboards'
import { DashboardApp } from '@perses-dev/dashboards/dist/views/ViewDashboard/DashboardApp'
import { DEFAULT_REFRESH_INTERVAL } from '@perses-dev/core'
import { ErrorAlert, ErrorBoundary, combineSx } from '@perses-dev/components'
import { TimeRangeProviderBasic, usePluginBuiltinVariableDefinitions } from '@perses-dev/plugin-system'
import { getSnapshotEmbed } from '../snapshot/isSnapshotDashboard'
import { snapshotTimeRangeToAbsoluteValue } from '../snapshot/resolveSnapshotTimeRange'

/**
 * Snapshot dashboard view: time range comes only from `spec.snapshot.timeRange`,
 * not from URL query params.
 */
export default function SnapshotViewDashboard(props: ViewDashboardProps): JSX.Element {
  const {
    dashboardResource,
    datasourceApi,
    externalVariableDefinitions,
    emptyDashboardProps,
    isReadonly,
    isVariableEnabled,
    isDatasourceEnabled,
    isEditing,
    isCreating,
    isInitialVariableSticky,
    isLeavingConfirmDialogEnabled,
    dashboardTitleComponent,
    onSave,
    onDiscard,
    sx,
    ...others
  } = props
  const { spec } = dashboardResource
  const snapshot = getSnapshotEmbed(dashboardResource)
  const frozenTimeRange = snapshotTimeRangeToAbsoluteValue(snapshot?.timeRange)
  const initialTimeRange = frozenTimeRange ?? { pastDuration: '1h' as const }
  const initialRefreshInterval = spec.refreshInterval ?? DEFAULT_REFRESH_INTERVAL

  const { data } = usePluginBuiltinVariableDefinitions()
  const builtinVariables = React.useMemo(() => {
    const result = [
      {
        kind: 'BuiltinVariable' as const,
        spec: {
          name: '__dashboard',
          value: () => dashboardResource.metadata.name,
          source: 'Dashboard' as const,
          display: {
            name: '__dashboard',
            description: 'The name of the current dashboard',
            hidden: true,
          },
        },
      },
      {
        kind: 'BuiltinVariable' as const,
        spec: {
          name: '__project',
          value: () => dashboardResource.metadata.project,
          source: 'Dashboard' as const,
          display: {
            name: '__project',
            description: 'The name of the current dashboard project',
            hidden: true,
          },
        },
      },
    ]
    if (data) {
      data.forEach((def) => result.push(def))
    }
    return result
  }, [dashboardResource.metadata.name, dashboardResource.metadata.project, data])

  return (
    <DatasourceStoreProvider dashboardResource={dashboardResource} datasourceApi={datasourceApi}>
      <DashboardProvider
        initialState={{
          isEditMode: !!isEditing,
          dashboardResource,
        }}
      >
        <TimeRangeProviderBasic initialTimeRange={initialTimeRange} initialRefreshInterval={initialRefreshInterval}>
          <VariableProvider
            initialVariableDefinitions={spec.variables}
            externalVariableDefinitions={externalVariableDefinitions}
            builtinVariableDefinitions={builtinVariables}
          >
            <Box
              sx={combineSx(
                {
                  display: 'flex',
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                  overflow: 'hidden',
                },
                sx
              )}
              {...others}
            >
              <ErrorBoundary FallbackComponent={ErrorAlert}>
                <DashboardApp
                  dashboardResource={dashboardResource}
                  emptyDashboardProps={emptyDashboardProps}
                  isReadonly={isReadonly}
                  isVariableEnabled={isVariableEnabled}
                  isDatasourceEnabled={isDatasourceEnabled}
                  isCreating={isCreating}
                  isInitialVariableSticky={isInitialVariableSticky}
                  isLeavingConfirmDialogEnabled={isLeavingConfirmDialogEnabled}
                  dashboardTitleComponent={dashboardTitleComponent}
                  onSave={onSave as OnSaveDashboard | undefined}
                  onDiscard={onDiscard}
                />
              </ErrorBoundary>
            </Box>
          </VariableProvider>
        </TimeRangeProviderBasic>
      </DashboardProvider>
    </DatasourceStoreProvider>
  )
}
