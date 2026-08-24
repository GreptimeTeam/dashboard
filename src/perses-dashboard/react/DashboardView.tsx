import * as React from 'react'
import { Box } from '@mui/material'
import { OnSaveDashboard, ViewDashboard } from '@perses-dev/dashboards'
import { ErrorAlert, ErrorBoundary } from '@perses-dev/components'
import { PluginRegistry, ValidationProvider } from '@perses-dev/plugin-system'
import {
  DashboardResource,
  DatasourceApi,
  GlobalDatasourceResource,
  EphemeralDashboardResource,
} from '@perses-dev/core'
import type { DashboardSpec } from '@perses-dev/spec'
import bundledPluginLoader from './plugin'
import { useWorkbenchContext } from './WorkbenchProvider'
import { prepareSnapshotViewDashboard } from '../snapshot/prepareSnapshotViewDashboard'
import SnapshotViewDashboard from './SnapshotViewDashboard'

export interface GenericDashboardViewProps {
  dashboardResource: DashboardResource | EphemeralDashboardResource
  onSave?: OnSaveDashboard
  onDiscard?: (name: string, spec: DashboardSpec) => void
  isReadonly: boolean
  isSnapshotMode?: boolean
  isEditing: boolean
  isCreating?: boolean
}

export default function HelperDashboardView(props: GenericDashboardViewProps): JSX.Element {
  const { onSave, onDiscard, isReadonly, isSnapshotMode = false, isEditing, isCreating, dashboardResource } = props
  const { database, username, password, authHeader, instance } = useWorkbenchContext()

  const viewDashboardResource = React.useMemo(() => {
    if (!isSnapshotMode) {
      return dashboardResource
    }
    if (dashboardResource.kind === 'EphemeralDashboard') {
      return prepareSnapshotViewDashboard(dashboardResource)
    }
    return prepareSnapshotViewDashboard(dashboardResource)
  }, [dashboardResource, isSnapshotMode])

  const prometheusDirectUrl = instance ? `/api/v1/instances/${instance}/metrics/prometheus` : '/v1/prometheus'

  const prometheusDataSource = {
    kind: 'GlobalDatasource',
    metadata: { name: 'promql-default' },
    spec: {
      default: true,
      plugin: {
        kind: 'PrometheusDatasource',
        spec: {
          directUrl: prometheusDirectUrl,
          proxy: {
            spec: {
              headers: {
                [authHeader || 'Authorization']: `Basic ${btoa(`${username}:${password}`)}`,
                'x-greptime-db-name': database,
              },
            },
          },
        },
      },
    },
  } as GlobalDatasourceResource

  const greptimeSqlBaseUrl = instance ? `/api/v1/instances/${instance}/greptime` : ''

  const createGreptimeDataSource = (name: string) =>
    ({
      kind: 'GlobalDatasource' as const,
      metadata: { name },
      spec: {
        default: false,
        plugin: {
          kind: 'GreptimeDBDatasource',
          spec: {
            directUrl: greptimeSqlBaseUrl,
            proxy: {
              kind: 'HTTPProxy',
              spec: {
                headers: {
                  [authHeader || 'Authorization']: `Basic ${btoa(`${username}:${password}`)}`,
                  'x-greptime-db-name': database,
                },
              },
            },
          },
        },
      },
    } as GlobalDatasourceResource)

  const greptimeDataSource = createGreptimeDataSource('sql-default')

  const allDatasources = new Map<string, GlobalDatasourceResource>([
    [prometheusDataSource.metadata.name, prometheusDataSource],
    [greptimeDataSource.metadata.name, greptimeDataSource],
  ])

  const datasourceApi: DatasourceApi = {
    getDatasource() {
      return Promise.resolve(undefined)
    },
    getGlobalDatasource(selector: any) {
      if (selector?.name) {
        const datasource = allDatasources.get(selector.name)
        if (datasource) return Promise.resolve(datasource)
      }
      if (selector?.kind === 'GreptimeDBDatasource') {
        return Promise.resolve(greptimeDataSource)
      }
      return Promise.resolve(prometheusDataSource)
    },
    listDatasources() {
      return Promise.resolve([])
    },
    listGlobalDatasources() {
      return Promise.resolve([prometheusDataSource, greptimeDataSource])
    },
    buildProxyUrl(): string {
      return '/'
    },
  }

  const dashboardKey = viewDashboardResource.metadata.name
  const viewDashboardProps = {
    dashboardResource: viewDashboardResource,
    datasourceApi,
    emptyDashboardProps: {
      additionalText: 'In order to save this dashboard, you need to add at least one panel!',
    },
    onSave,
    onDiscard,
    isInitialVariableSticky: true as const,
    isReadonly,
    isEditing,
    isCreating,
    isVariableEnabled: true,
    isAnnotationEnabled: false,
    isDatasourceEnabled: !isSnapshotMode,
  } as unknown as import('@perses-dev/dashboards').ViewDashboardProps

  return (
    <Box
      component="main"
      sx={{
        flexGrow: 1,
      }}
    >
      <ErrorBoundary FallbackComponent={ErrorAlert}>
        <PluginRegistry
          pluginLoader={bundledPluginLoader}
          defaultPluginKinds={{
            Panel: 'TimeSeriesChart',
            TimeSeriesQuery: 'GreptimeDBTimeSeriesQuery',
          }}
        >
          <ValidationProvider>
            <ErrorBoundary FallbackComponent={ErrorAlert}>
              {isSnapshotMode ? (
                <SnapshotViewDashboard key={dashboardKey} {...viewDashboardProps} />
              ) : (
                <ViewDashboard key={dashboardKey} {...viewDashboardProps} />
              )}
            </ErrorBoundary>
          </ValidationProvider>
        </PluginRegistry>
      </ErrorBoundary>
    </Box>
  )
}
