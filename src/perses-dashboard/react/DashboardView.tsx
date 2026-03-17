import * as React from 'react'
import { Box } from '@mui/material'
import { DatasourceApi, OnSaveDashboard, ViewDashboard } from '@perses-dev/dashboards'
import { ErrorAlert, ErrorBoundary } from '@perses-dev/components'
import { PluginRegistry, ValidationProvider } from '@perses-dev/plugin-system'
import { DashboardResource, GlobalDatasourceResource, EphemeralDashboardResource } from '@perses-dev/core'
import bundledPluginLoader from './plugin'
import { useWorkbenchContext } from './WorkbenchProvider'
import './greptime-sql-adapter'

export interface GenericDashboardViewProps {
  dashboardResource: DashboardResource | EphemeralDashboardResource
  onSave?: OnSaveDashboard
  onDiscard?: (entity: DashboardResource) => void
  isReadonly: boolean
  isEditing: boolean
  isCreating?: boolean
}

export default function HelperDashboardView(props: GenericDashboardViewProps): JSX.Element {
  const { onSave, onDiscard, isReadonly, isEditing, isCreating, dashboardResource } = props
  const { database, username, password, authHeader, instance } = useWorkbenchContext()

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

  const greptimeSqlBaseUrl = instance ? `/api/v1/instances/${instance}/greptime/v1/sql` : '/v1/sql'

  const createClickHouseDataSource = (name: string) =>
    ({
      kind: 'GlobalDatasource' as const,
      metadata: { name },
      spec: {
        default: false,
        plugin: {
          kind: 'ClickHouseDatasource',
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

  const clickhouseDataSource = createClickHouseDataSource('sql-default')

  const allDatasources = new Map<string, GlobalDatasourceResource>([
    [prometheusDataSource.metadata.name, prometheusDataSource],
    [clickhouseDataSource.metadata.name, clickhouseDataSource],
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
      if (selector?.kind === 'ClickHouseDatasource') {
        return Promise.resolve(clickhouseDataSource)
      }
      return Promise.resolve(prometheusDataSource)
    },
    listDatasources() {
      return Promise.resolve([])
    },
    listGlobalDatasources() {
      return Promise.resolve([prometheusDataSource, clickhouseDataSource])
    },
    buildProxyUrl(): string {
      return '/'
    },
  }

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
            TimeSeriesQuery: 'PrometheusTimeSeriesQuery',
          }}
        >
          <ValidationProvider>
            <ErrorBoundary FallbackComponent={ErrorAlert}>
              <ViewDashboard
                key={dashboardResource.metadata.name}
                dashboardResource={dashboardResource}
                datasourceApi={datasourceApi}
                emptyDashboardProps={{
                  additionalText: 'In order to save this dashboard, you need to add at least one panel!',
                }}
                onSave={onSave}
                onDiscard={onDiscard}
                isInitialVariableSticky={true}
                isReadonly={isReadonly}
                isEditing={isEditing}
                isCreating={isCreating}
                isVariableEnabled={true}
                isDatasourceEnabled={true}
              />
            </ErrorBoundary>
          </ValidationProvider>
        </PluginRegistry>
      </ErrorBoundary>
    </Box>
  )
}
