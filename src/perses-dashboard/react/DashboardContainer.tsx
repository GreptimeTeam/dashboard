import * as React from 'react'
import {
  DashboardResource,
  EphemeralDashboardResource,
  DEFAULT_DASHBOARD_DURATION,
  DEFAULT_REFRESH_INTERVAL,
} from '@perses-dev/core'
import { ChartsProvider, generateChartsTheme, getTheme } from '@perses-dev/components'
import { createTheme, ThemeProvider, GlobalStyles } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { QueryParamProvider } from 'use-query-params'
import { ReactRouter6Adapter } from 'use-query-params/adapters/react-router-6'
import HelperDashboardView from './DashboardView'
import { useWorkbenchContext } from './WorkbenchProvider'
import DASHBOARD_TOKENS from './Dashboard.styles'
import getPersesDashboardLayoutStyles, { getPersesDashboardComponents } from './theme/persesDashboardTheme'
import { getGptTablePalette, getPersesTableComponents, getPersesTableGlobalStyles } from './theme/persesTableTheme'
import { ensureTraceTableLinks } from '../traceLink'

interface DashboardProps {
  dashboardEditable?: boolean
  controlEditableBodyClass?: boolean
}

export default function Dashboard(props: DashboardProps = {}) {
  const { name, file } = useWorkbenchContext()
  const dashboardEditable = props.dashboardEditable ?? false
  const controlEditableBodyClass = props.controlEditableBodyClass ?? true
  const [saveRefreshToken, setSaveRefreshToken] = React.useState(0)

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
      // Match Arco primary palette: main-dark idle, purple hover (arco-theme.less)
      primary: {
        main: DASHBOARD_TOKENS.colors.controlAccent,
        light: DASHBOARD_TOKENS.colors.controlAccentHover,
        dark: DASHBOARD_TOKENS.colors.controlAccentActive,
        contrastText: '#ffffff',
      },
      background: {
        // Use paper (white) for component-level backgrounds (Legend, Dialog, Popover, etc.)
        // The page/body warm gray (#f9f8f7) is applied separately via GlobalStyles
        default: DASHBOARD_TOKENS.colors.paper,
        paper: DASHBOARD_TOKENS.colors.paper,
      },
      divider: DASHBOARD_TOKENS.colors.divider,
      text: {
        primary: DASHBOARD_TOKENS.colors.textPrimary,
        secondary: DASHBOARD_TOKENS.colors.textSecondary,
      },
      gpt: {
        table: getGptTablePalette(),
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
            // backgroundColor intentionally omitted — palette.background.paper already provides white.
            // Explicitly setting it here would override MuiAppBar's transparent background.
            backgroundImage: 'none',
          },
        },
      },
      MuiTypography: {
        styleOverrides: {
          h3: {
            'fontFamily': DASHBOARD_TOKENS.fonts.sans,
            'fontWeight': 600,
            'letterSpacing': '-0.02em',
            'fontFeatureSettings': "'tnum' 1",
            'color': `${DASHBOARD_TOKENS.colors.textPrimary} !important`,
            'display': 'flex',
            'alignItems': 'baseline',
            'justifyContent': 'center',
            // Inside table cells: compact inline style
            '.MuiTableCell-root &': {
              display: 'block',
              textAlign: 'inherit',
              fontSize: '14px',
              fontWeight: DASHBOARD_TOKENS.fonts.weightMedium,
              color: 'inherit',
              lineHeight: 'inherit',
              letterSpacing: 0,
              padding: 0,
              margin: 0,
            },
            // Unit/label spans (not bold) next to the stat value
            '&:not(.MuiTableCell-root *) :not(b):not(strong)': {
              fontSize: '0.55em',
              fontWeight: 400,
              color: DASHBOARD_TOKENS.colors.textSecondary,
              marginLeft: '4px',
              letterSpacing: 0,
            },
          },
          h2: {
            color: `${DASHBOARD_TOKENS.colors.textPrimary} !important`,
            fontWeight: 600,
            letterSpacing: '-0.02em',
          },
          h6: {
            'fontSize': '14px',
            'fontWeight': 600,
            'color': DASHBOARD_TOKENS.colors.textSecondary,
            'marginBottom': '16px',
            'marginTop': '40px',
            'display': 'flex',
            'alignItems': 'center',
            'textTransform': 'none',
            'letterSpacing': '-0.01em',
            // Decorative horizontal rule after the heading text
            '&::after': {
              content: '""',
              flex: 1,
              height: '1px',
              background: DASHBOARD_TOKENS.colors.dividerDark,
              marginLeft: '12px',
            },
          },
          subtitle1: {
            color: DASHBOARD_TOKENS.colors.textSecondary,
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '0.01em',
            lineHeight: 1.4,
            minHeight: 'auto',
            textTransform: 'none',
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: {
            'display': 'flex',
            'flexDirection': 'column',
            'flex': 1,
            'overflow': 'hidden',
            '& > .MuiStack-root': {
              flex: 1,
              height: '100%',
              minHeight: 0,
              overflow: 'visible',
            },
          },
        },
      },
      MuiCardHeader: {
        styleOverrides: {
          root: {
            '& .MuiTypography-root': {
              color: DASHBOARD_TOKENS.colors.textSecondary,
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.01em',
              lineHeight: 1.4,
              minHeight: 'auto',
              textTransform: 'none',
            },
          },
        },
      },
      ...getPersesDashboardComponents(),
      ...getPersesTableComponents(),
      MuiListItem: {
        styleOverrides: {
          root: {
            backgroundColor: 'transparent',
          },
        },
      },
      MuiListItemText: {
        styleOverrides: {
          root: {
            '& .MuiTypography-root': {
              fontSize: '11px',
              color: DASHBOARD_TOKENS.colors.textSecondary,
            },
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            transition: 'all 0.2s ease',
            fontWeight: 600,
          },
          contained: {
            'color': '#ffffff',
            'backgroundColor': DASHBOARD_TOKENS.colors.controlAccent,
            'border': `1px solid ${DASHBOARD_TOKENS.colors.controlAccent}`,
            '&:hover': {
              backgroundColor: DASHBOARD_TOKENS.colors.controlAccentHover,
              borderColor: DASHBOARD_TOKENS.colors.controlAccentHover,
            },
            '&:active': {
              backgroundColor: DASHBOARD_TOKENS.colors.controlAccentActive,
              borderColor: DASHBOARD_TOKENS.colors.controlAccentActive,
            },
          },
          outlined: {
            'color': DASHBOARD_TOKENS.colors.controlAccent,
            'borderColor': DASHBOARD_TOKENS.colors.controlBorder,
            '&:hover': {
              color: DASHBOARD_TOKENS.colors.controlAccentHover,
              borderColor: DASHBOARD_TOKENS.colors.controlAccentHover,
              backgroundColor: DASHBOARD_TOKENS.colors.brandHover,
            },
          },
          text: {
            'color': DASHBOARD_TOKENS.colors.controlAccent,
            '&:hover': {
              color: DASHBOARD_TOKENS.colors.controlAccentHover,
              backgroundColor: DASHBOARD_TOKENS.colors.brandHover,
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            'color': DASHBOARD_TOKENS.colors.controlAccent,
            'transition': 'all 0.2s ease',
            '&:hover': {
              color: DASHBOARD_TOKENS.colors.controlAccentHover,
              backgroundColor: DASHBOARD_TOKENS.colors.brandHover,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            'color': DASHBOARD_TOKENS.colors.controlAccent,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: DASHBOARD_TOKENS.colors.controlBorder,
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            },
            '&:hover:not(.Mui-focused) .MuiOutlinedInput-notchedOutline': {
              borderColor: DASHBOARD_TOKENS.colors.controlAccent,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: DASHBOARD_TOKENS.colors.controlAccentHover,
              boxShadow: `0 0 0 3px ${DASHBOARD_TOKENS.colors.brandBase}`,
            },
            '&.Mui-focused': {
              backgroundColor: DASHBOARD_TOKENS.colors.brandBase,
            },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            '&.Mui-focused': {
              color: DASHBOARD_TOKENS.colors.controlAccentHover,
            },
          },
        },
      },
      MuiCheckbox: {
        styleOverrides: {
          root: {
            'color': DASHBOARD_TOKENS.colors.controlAccent,
            '&:hover': {
              backgroundColor: DASHBOARD_TOKENS.colors.brandHover,
            },
            '&.Mui-checked': {
              'color': DASHBOARD_TOKENS.colors.controlAccent,
              '&:hover': {
                color: DASHBOARD_TOKENS.colors.controlAccentHover,
              },
            },
          },
        },
      },
      MuiRadio: {
        styleOverrides: {
          root: {
            'color': DASHBOARD_TOKENS.colors.controlAccent,
            '&:hover': {
              backgroundColor: DASHBOARD_TOKENS.colors.brandHover,
            },
            '&.Mui-checked': {
              'color': DASHBOARD_TOKENS.colors.controlAccent,
              '&:hover': {
                color: DASHBOARD_TOKENS.colors.controlAccentHover,
              },
            },
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          switchBase: {
            '&.Mui-checked': {
              'color': DASHBOARD_TOKENS.colors.controlAccentHover,
              '&:hover': {
                backgroundColor: DASHBOARD_TOKENS.colors.brandHover,
              },
              '& + .MuiSwitch-track': {
                backgroundColor: DASHBOARD_TOKENS.colors.controlAccentHover,
                opacity: 1,
              },
              '&:hover + .MuiSwitch-track': {
                backgroundColor: DASHBOARD_TOKENS.colors.controlAccentActive,
              },
            },
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            'color': DASHBOARD_TOKENS.colors.textSecondary,
            'fontWeight': 600,
            'textTransform': 'none',
            '&.Mui-selected': {
              color: DASHBOARD_TOKENS.colors.controlAccent,
            },
            '&:hover': {
              color: DASHBOARD_TOKENS.colors.controlAccentHover,
            },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            backgroundColor: DASHBOARD_TOKENS.colors.controlAccentHover,
          },
        },
      },
      MuiLink: {
        styleOverrides: {
          root: {
            'color': DASHBOARD_TOKENS.colors.controlAccentHover,
            '&:hover': {
              color: DASHBOARD_TOKENS.colors.controlAccentActive,
            },
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          select: {
            backgroundColor: 'transparent',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            'backgroundColor': DASHBOARD_TOKENS.colors.brandHover,
            'borderRadius': '4px',
            'height': '24px',
            // Chips inside AppBar (variable dropdowns) use paper bg
            '.MuiAppBar-root &': {
              backgroundColor: DASHBOARD_TOKENS.colors.paper,
            },
          },
          label: {
            fontFamily: DASHBOARD_TOKENS.fonts.mono,
            fontSize: '11px',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            'border': 'none',
            'boxShadow': 'none',
            // Sticky/fixed appbar gets a subtle frosted-glass effect
            '&.mui-fixed': {
              backgroundColor: 'rgba(250, 250, 250, 0.9)',
              backdropFilter: 'blur(8px)',
              borderBottom: `1px solid ${DASHBOARD_TOKENS.colors.dividerDark}`,
            },
            // Inputs inside AppBar use paper background when focused
            '& .MuiOutlinedInput-root.Mui-focused, & .MuiInputBase-root:has(.MuiSelect-select:focus)': {
              backgroundColor: DASHBOARD_TOKENS.colors.paper,
            },
          },
        },
      },
    },
  })

  const chartsTheme = generateChartsTheme(muiTheme, {
    legend: {
      backgroundColor: 'transparent',
    },
    thresholds: {
      defaultColor: DASHBOARD_TOKENS.colors.normal,
      palette: [DASHBOARD_TOKENS.colors.warning, DASHBOARD_TOKENS.colors.warning, '#ef4444'],
    },
    noDataOption: {
      title: {
        show: true,
        text: 'No data',
        left: 'center',
        top: 'center',
        textStyle: {
          color: DASHBOARD_TOKENS.colors.textMuted,
          fontSize: 15,
          fontWeight: 500,
        },
      },
      xAxis: { show: false },
      yAxis: { show: false },
    },
    echartsTheme: {
      textStyle: {
        color: DASHBOARD_TOKENS.colors.textPrimary,
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
        const normalizedDashboardJSON = ensureTraceTableLinks(dashboardJSON)

        const handleMessage = (event: MessageEvent) => {
          if (event.data.type === 'save-dashboard-response' && event.data.requestId === requestId) {
            window.removeEventListener('message', handleMessage)
            if (event.data.success) {
              setSaveRefreshToken((prev) => prev + 1)
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
            <GlobalStyles
              styles={{
                ...getPersesDashboardLayoutStyles(),
                ...getPersesTableGlobalStyles(),
                'html, body, #root, [data-reactroot]': {
                  backgroundColor: DASHBOARD_TOKENS.colors.background,
                  margin: 0,
                },
                // Dashboard toolbar: hide edit controls by default, show when editable
                '[data-testid="dashboard-toolbar"]': {
                  'paddingBottom': '12px',
                  'borderBottom': `1px solid ${DASHBOARD_TOKENS.colors.dividerDark}`,
                  'marginBottom': '8px',
                  '& .MuiButton-root, & .MuiIconButton-root': {
                    height: '100%',
                  },
                  '& > .MuiBox-root:first-child': {
                    display: 'none',
                  },
                },
                'body.dashboard-editable [data-testid="dashboard-toolbar"] > .MuiBox-root:first-child': {
                  display: 'flex',
                },
                // Panel group header hover
                '[data-testid="panel-group-header"]': {
                  'backgroundColor': 'transparent',
                  'transition': 'background-color 0.2s ease',
                  'marginBottom': '4px',
                  'borderRadius': '4px',
                  '& .MuiTypography-root': {
                    fontWeight: 600,
                    color: DASHBOARD_TOKENS.colors.textSecondary,
                    fontSize: '14px',
                  },
                  '&:hover': {
                    backgroundColor: DASHBOARD_TOKENS.colors.brandHover,
                  },
                },
                // Variable filter bar layout.
                // The AppBar inside uses color="inherit" + sx={{ backgroundColor: 'inherit' }} from perses,
                // so sx overrides our styleOverrides. Use a higher-specificity selector (0,2,0) to win.
                '[data-testid="variable-list"] .MuiAppBar-root': {
                  backgroundColor: 'transparent',
                },
                '[data-testid="variable-list"]': {
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                },
              }}
            />
            <HelperDashboardView
              key={`${data.metadata.name}-${saveRefreshToken}`}
              dashboardResource={data}
              onSave={save}
              isReadonly={!dashboardEditable}
              isEditing={false}
              isCreating={false}
            />
          </ChartsProvider>
        </QueryParamProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
