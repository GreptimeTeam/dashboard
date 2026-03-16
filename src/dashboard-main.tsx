import '@/perses-dashboard/react/app.css'
import React, { useEffect, useState, StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { SnackbarProvider } from '@perses-dev/components'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from '@/perses-dashboard/react/DashboardContainer'
import { WorkbenchProvider, PersesDashboardFile } from '@/perses-dashboard/react/WorkbenchProvider'

function StandaloneApp() {
  const [dashboardData, setDashboardData] = useState<any>(null)

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
          <Routes>
            <Route path="*" element={<Dashboard dashboardEditable={dashboardData.dashboardEditable} />} />
          </Routes>
        </BrowserRouter>
      </WorkbenchProvider>
    </SnackbarProvider>
  )
}

const rootElement = document.getElementById('react-root')
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <StandaloneApp />
    </StrictMode>
  )
}
