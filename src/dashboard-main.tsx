import '@/perses-dashboard/react/app.css'
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { SnackbarProvider } from '@perses-dev/components'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ReactRouterProvider } from '@perses-dev/plugin-system'
import Dashboard from '@/perses-dashboard/react/DashboardContainer'
import { WorkbenchProvider, PersesDashboardFile } from '@/perses-dashboard/react/WorkbenchProvider'
import {
  TraceModalPayload,
  isTraceModalPayload,
  parseTraceModalPayloadFromHref,
  TRACE_MODAL_LINK_PATH,
  TRACE_MODAL_MODE,
  TRACE_MODAL_SOURCE,
  TRACE_MODAL_VIEW,
} from '@/perses-dashboard/traceLink'

function buildTraceGanttFile(payload: TraceModalPayload): PersesDashboardFile {
  const { traceId, table = 'spans', database } = payload
  const escapedTraceId = traceId.replace(/'/g, "''")
  const escapedTable = table.replace(/"/g, '""')
  const fullTableName = database ? `"${database.replace(/"/g, '""')}"."${escapedTable}"` : `"${escapedTable}"`

  const traceGanttDashboard = {
    kind: 'Dashboard',
    metadata: {
      name: `trace-gantt-${traceId}`,
      project: 'default',
      version: 0,
    },
    spec: {
      display: {
        name: `Trace Gantt - ${traceId}`,
      },
      duration: '1h',
      refreshInterval: '30s',
      variables: [],
      layouts: [
        {
          kind: 'Grid',
          spec: {
            items: [
              {
                x: 0,
                y: 0,
                width: 24,
                height: 30,
                content: {
                  $ref: '#/spec/panels/traceGanttPanel',
                },
              },
            ],
          },
        },
      ],
      panels: {
        traceGanttPanel: {
          kind: 'Panel',
          spec: {
            display: {
              name: `Trace ${traceId}`,
            },
            plugin: {
              kind: 'TracingGanttChart',
              spec: {},
            },
            queries: [
              {
                kind: 'TraceQuery',
                spec: {
                  plugin: {
                    kind: 'GreptimeDBTraceQuery',
                    spec: {
                      datasource: {
                        kind: 'GreptimeDBDatasource',
                        name: 'sql-default',
                      },
                      query: `SELECT * FROM ${fullTableName} WHERE trace_id = '${escapedTraceId}' ORDER BY timestamp ASC`,
                    },
                  },
                },
              },
            ],
          },
        },
      },
      datasources: {},
    },
  }

  return {
    filename: `trace-gantt-${traceId}.json`,
    content: JSON.stringify(traceGanttDashboard),
    meta: {
      commit: {
        id: 'ephemeral',
      },
    },
  }
}

function StandaloneApp() {
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [traceModalPayload, setTraceModalPayload] = useState<TraceModalPayload | null>(null)
  const [traceModalFile, setTraceModalFile] = useState<PersesDashboardFile | null>(null)

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'update-dashboard') {
        try {
          const pureData = JSON.parse(JSON.stringify(event.data.data))
          setDashboardData(pureData)
        } catch (e) {
          console.error('[ReactDashboard] Failed to parse dashboard data:', e)
        }
      }
    }

    window.addEventListener('message', handleMessage)

    if (window.parent !== window) {
      window.parent.postMessage({ type: 'dashboard-iframe-ready' }, '*')
    }

    return () => window.removeEventListener('message', handleMessage)
  }, [])

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const anchor = target?.closest?.('a') as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href) return

      let url: URL
      try {
        url = new URL(href, window.location.origin)
      } catch {
        return
      }

      // Intercept only our modal protocol path.
      if (url.pathname !== TRACE_MODAL_LINK_PATH) return

      const payload = parseTraceModalPayloadFromHref(href)
      if (!payload?.traceId) return

      const normalizedPayload = {
        ...payload,
        view: payload.view || TRACE_MODAL_VIEW,
        mode: payload.mode || TRACE_MODAL_MODE,
        source: payload.source || TRACE_MODAL_SOURCE,
      }

      // Only intercept when link explicitly opts into modal mode.
      if (payload.mode !== TRACE_MODAL_MODE) return

      if (!isTraceModalPayload(normalizedPayload)) return

      event.preventDefault()
      event.stopPropagation()
      setTraceModalPayload(normalizedPayload)
      setTraceModalFile(buildTraceGanttFile(normalizedPayload))
    }

    document.addEventListener('click', handleDocumentClick, true)
    return () => document.removeEventListener('click', handleDocumentClick, true)
  }, [])

  if (!dashboardData) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          background: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        Loading Dashboard...
      </div>
    )
  }

  const { file } = dashboardData as { file: PersesDashboardFile }
  const modalTraceId = traceModalPayload?.traceId || ''
  const modalDatabase = traceModalPayload?.database || dashboardData.database || ''
  const closeTraceModal = () => {
    setTraceModalPayload(null)
    setTraceModalFile(null)
  }

  return (
    <SnackbarProvider anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
      <WorkbenchProvider
        database={dashboardData.database || ''}
        username={dashboardData.username || ''}
        password={dashboardData.password || ''}
        authHeader={dashboardData.authHeader || 'Authorization'}
        name={dashboardData.name || ''}
        file={file}
        instance={dashboardData.instance || ''}
      >
        <BrowserRouter>
          <ReactRouterProvider>
            <Routes>
              <Route path="*" element={<Dashboard dashboardEditable={dashboardData.dashboardEditable} />} />
            </Routes>
            {traceModalPayload && traceModalFile ? (
              <div
                className="trace-gantt-sidepanel"
                style={{
                  position: 'fixed',
                  top: 0,
                  right: 0,
                  height: '100vh',
                  width: 'min(1200px, 78vw)',
                  minWidth: '720px',
                  zIndex: 1300,
                  background: '#fff',
                  borderLeft: '1px solid #e5e7eb',
                  boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.12)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    height: '48px',
                    borderBottom: '1px solid #f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 12px',
                    fontSize: '14px',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  <span>{`Trace Gantt - ${modalTraceId}`}</span>
                  <button
                    type="button"
                    onClick={closeTraceModal}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: '16px',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <WorkbenchProvider
                    database={modalDatabase}
                    username={dashboardData.username || ''}
                    password={dashboardData.password || ''}
                    authHeader={dashboardData.authHeader || 'Authorization'}
                    name={traceModalFile.filename}
                    file={traceModalFile}
                    instance={dashboardData.instance || ''}
                  >
                    <Dashboard dashboardEditable={false} controlEditableBodyClass={false} />
                  </WorkbenchProvider>
                </div>
              </div>
            ) : null}
          </ReactRouterProvider>
        </BrowserRouter>
      </WorkbenchProvider>
    </SnackbarProvider>
  )
}

const rootElement = document.getElementById('react-root')
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(<StandaloneApp />)
}
