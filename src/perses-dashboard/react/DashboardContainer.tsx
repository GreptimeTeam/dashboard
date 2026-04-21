import * as React from 'react'
import {
  DashboardResource,
  EphemeralDashboardResource,
  DEFAULT_DASHBOARD_DURATION,
  DEFAULT_REFRESH_INTERVAL,
} from '@perses-dev/core'
import { ChartsProvider, generateChartsTheme, getTheme } from '@perses-dev/components'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { QueryParamProvider } from 'use-query-params'
import { ReactRouter6Adapter } from 'use-query-params/adapters/react-router-6'
import HelperDashboardView from './DashboardView'
import { useWorkbenchContext } from './WorkbenchProvider'
import { DASHBOARD_TOKENS, globalStyles } from './Dashboard.styles'
import { ensureTraceTableLinks } from '../traceLink'

interface DashboardProps {
  dashboardEditable?: boolean
  controlEditableBodyClass?: boolean
}

export default function Dashboard(props: DashboardProps = {}) {
  const { name, file } = useWorkbenchContext()
  const dashboardEditable = props.dashboardEditable ?? false
  const controlEditableBodyClass = props.controlEditableBodyClass ?? true

  React.useEffect(() => {
    if (!controlEditableBodyClass) return undefined
    const { body } = document
    if (dashboardEditable) {
      body.classList.add('dashboard-editable')
    } else {
      body.classList.remove('dashboard-editable')
    }
    return () => {
      body.classList.remove('dashboard-editable')
    }
  }, [dashboardEditable, controlEditableBodyClass])

  React.useEffect(() => {
    let patched = false

    const patchEChartsTooltip = (): boolean => {
      if (patched) return true

      try {
        const { echarts } = window as any
        if (!echarts) return false

        let TooltipHTMLContent: any = null
        const { component, extensions } = echarts as any
        const { TooltipHTMLContent: directTooltip } = echarts
        if (directTooltip) {
          TooltipHTMLContent = directTooltip
        } else {
          const { tooltip: componentTooltip } = component || {}
          const { TooltipHTMLContent: componentTooltipHTML } = componentTooltip || {}
          if (componentTooltipHTML) {
            TooltipHTMLContent = componentTooltipHTML
          } else {
            const { tooltip: extensionsTooltip } = extensions || {}
            const { TooltipHTMLContent: extensionsTooltipHTML } = extensionsTooltip || {}
            if (extensionsTooltipHTML) {
              TooltipHTMLContent = extensionsTooltipHTML
            }
          }
        }

        if (TooltipHTMLContent && !(TooltipHTMLContent.prototype as any).__patched) {
          const { getSize: originalGetSize } = TooltipHTMLContent.prototype

          if (typeof originalGetSize === 'function') {
            TooltipHTMLContent.prototype.getSize = function getSize(...args: any[]) {
              if (!this._container || !this._container.parentNode) {
                return { width: 0, height: 0 }
              }

              try {
                const { offsetWidth, offsetHeight } = this._container
                if (offsetWidth === undefined || offsetHeight === undefined) {
                  return { width: 0, height: 0 }
                }

                return originalGetSize.apply(this, args)
              } catch {
                return { width: 0, height: 0 }
              }
            }
            ;(TooltipHTMLContent.prototype as any).__patched = true
            patched = true
            return true
          }
        }
      } catch {
        // ignore
      }

      return false
    }

    if (patchEChartsTooltip()) {
      return undefined
    }

    let retryCount = 0
    const maxRetries = 20

    const retryInterval = setInterval(() => {
      retryCount += 1
      if (patchEChartsTooltip() || retryCount >= maxRetries) {
        clearInterval(retryInterval)
      }
    }, 100)

    return (): void => {
      clearInterval(retryInterval)
    }
  }, [])

  React.useEffect(() => {
    const { error: originalConsoleError } = console
    const errorHandler = (event: ErrorEvent): void => {
      const { error } = event
      if (
        error &&
        error.message &&
        typeof error.message === 'string' &&
        (error.message.includes('offsetWidth') || error.message.includes('Cannot read properties of null'))
      ) {
        const stack = error.stack || ''
        if (stack.includes('TooltipHTMLContent') || stack.includes('TooltipView')) {
          event.stopPropagation()
        }
      }
    }

    console.error = (...args: any[]): void => {
      const errorMsg = args[0]?.toString() || ''
      if (
        errorMsg.includes('offsetWidth') &&
        (errorMsg.includes('TooltipHTMLContent') || errorMsg.includes('TooltipView'))
      ) {
        return
      }
      originalConsoleError.apply(console, args)
    }

    window.addEventListener('error', errorHandler, true)

    return () => {
      window.removeEventListener('error', errorHandler, true)
      console.error = originalConsoleError
    }
  }, [])

  const baseTheme = getTheme('light')

  const muiTheme = createTheme(baseTheme, {
    typography: {
      fontFamily: DASHBOARD_TOKENS.fonts.sans,
      h6: { fontWeight: 700, letterSpacing: '-0.01em' },
      subtitle1: { fontWeight: 600 },
      body2: { color: DASHBOARD_TOKENS.colors.textSecondary },
    },
    palette: {
      mode: 'light',
      primary: { main: DASHBOARD_TOKENS.colors.brand },
      background: {
        default: DASHBOARD_TOKENS.colors.background,
        paper: DASHBOARD_TOKENS.colors.paper,
      },
      divider: DASHBOARD_TOKENS.colors.divider,
      text: {
        primary: DASHBOARD_TOKENS.colors.textPrimary,
        secondary: DASHBOARD_TOKENS.colors.textSecondary,
      },
    },
    shape: { borderRadius: 4 },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            boxShadow: DASHBOARD_TOKENS.shadows.soft,
            border: `1px solid ${DASHBOARD_TOKENS.colors.dividerDark}`,
            borderRadius: 4,
            backgroundColor: DASHBOARD_TOKENS.colors.paper,
            backgroundImage: 'none',
          },
        },
      },
    },
  })

  const chartsTheme = generateChartsTheme(muiTheme, {
    legend: {
      backgroundColor: 'transparent',
    },
    noDataOption: {
      title: {
        show: true,
        text: 'No data',
        left: 'center',
        top: 'center',
        textStyle: {
          color: '#64748b',
          fontSize: 15,
          fontWeight: 500,
        },
      },
      xAxis: { show: false },
      yAxis: { show: false },
    },
    echartsTheme: {
      textStyle: {
        color: '#0f172a',
      },
      grid: {
        borderColor: DASHBOARD_TOKENS.colors.dividerDark,
      },
      categoryAxis: {
        axisLine: { show: true, lineStyle: { color: DASHBOARD_TOKENS.colors.dividerDark } },
        splitLine: {
          show: true,
          lineStyle: {
            color: DASHBOARD_TOKENS.colors.divider,
            width: 1,
            type: 'solid',
            opacity: 0.8,
          },
        },
      },
      valueAxis: {
        axisLine: { show: true, lineStyle: { color: DASHBOARD_TOKENS.colors.dividerDark } },
        splitLine: {
          show: true,
          lineStyle: {
            color: DASHBOARD_TOKENS.colors.divider,
            width: 1,
            type: 'solid',
            opacity: 0.8,
          },
        },
      },
      timeAxis: {
        axisLine: { show: true, lineStyle: { color: DASHBOARD_TOKENS.colors.dividerDark } },
        splitLine: {
          show: true,
          lineStyle: {
            color: DASHBOARD_TOKENS.colors.divider,
            width: 1,
            type: 'solid',
            opacity: 0.8,
          },
        },
      },
      line: {
        smooth: true,
        width: 2,
      },
    },
  } as any)

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 0,
      },
    },
  })

  const save = React.useCallback(
    async (dashboardJSON: DashboardResource | EphemeralDashboardResource): Promise<boolean> => {
      return new Promise((resolve, reject) => {
        const requestId = `save-${Date.now()}-${Math.random()}`
        const normalizedDashboardJSON = dashboardJSON

        const handleMessage = (event: MessageEvent) => {
          if (event.data.type === 'save-dashboard-response' && event.data.requestId === requestId) {
            window.removeEventListener('message', handleMessage)
            if (event.data.success) {
              resolve(true)
            } else {
              reject(new Error(event.data.error || 'Save failed'))
            }
          }
        }

        window.addEventListener('message', handleMessage)

        if (window.parent !== window) {
          window.parent.postMessage(
            {
              type: 'save-dashboard-request',
              requestId,
              data: {
                dashboardJSON: normalizedDashboardJSON,
                name,
                commitId: file.meta?.commit?.id || '',
              },
            },
            '*'
          )
        } else {
          reject(new Error('Not in iframe context'))
        }

        setTimeout(() => {
          window.removeEventListener('message', handleMessage)
          reject(new Error('Save request timeout'))
        }, 30000)
      })
    },
    [name, file]
  )

  const INIT_DATA: DashboardResource = {
    kind: 'Dashboard',
    metadata: {
      name: name.split('.')[0],
      project: 'default',
      version: 0,
    },
    spec: {
      display: {
        name: name.split('.')[0],
      },
      duration: DEFAULT_DASHBOARD_DURATION,
      refreshInterval: DEFAULT_REFRESH_INTERVAL,
      variables: [],
      layouts: [],
      panels: {},
    },
  }

  let data: DashboardResource | EphemeralDashboardResource
  try {
    data = ensureTraceTableLinks(JSON.parse(file.content) || INIT_DATA)

    if (data.spec?.panels) {
      Object.values(data.spec.panels).forEach((panel: any) => {
        if (panel.spec?.plugin?.kind === 'TimeSeriesChart') {
          if (panel.spec?.yAxis?.format?.unit === 'percent-decimal' && panel.spec?.yAxis?.max === undefined) {
            if (!panel.spec.yAxis) {
              panel.spec.yAxis = {}
            }
            panel.spec.yAxis.max = 1
          }

          if (panel.spec?.thresholds && (!panel.spec.thresholds.steps || panel.spec.thresholds.steps.length === 0)) {
            delete panel.spec.thresholds
          }
        }
      })
    }
  } catch (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h3>Error parsing dashboard JSON</h3>
        <pre>{String(error)}</pre>
      </div>
    )
  }

  return (
    <ThemeProvider theme={muiTheme}>
      <QueryClientProvider client={queryClient}>
        <QueryParamProvider adapter={ReactRouter6Adapter}>
          <ChartsProvider chartsTheme={chartsTheme}>
            <style>{globalStyles}</style>
            <HelperDashboardView
              dashboardResource={data}
              onSave={save}
              isReadonly={!dashboardEditable}
              isEditing={false}
              isCreating={false}
            ></HelperDashboardView>
          </ChartsProvider>
        </QueryParamProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
