import * as React from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { DashboardResource } from '@perses-dev/core'
import { buildSnapshotDashboard } from '../snapshot/buildSnapshotDashboard'

interface SnapshotBridgeProps {
  queryClient: QueryClient
  dashboard: DashboardResource
  sourceDashboardName: string
}

export default function SnapshotBridge({ queryClient, dashboard, sourceDashboardName }: SnapshotBridgeProps) {
  const dashboardRef = React.useRef(dashboard)
  dashboardRef.current = dashboard

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'create-snapshot-request') return
      if (window.parent === window) return

      const { requestId, snapshotName } = event.data

      try {
        const result = buildSnapshotDashboard(queryClient, dashboardRef.current, {
          sourceDashboard: sourceDashboardName,
          snapshotName,
        })

        const snapshotData = result.dashboard.spec?.snapshot
        // eslint-disable-next-line no-console
        console.group('[snapshot-export] save snapshot dashboard')
        // eslint-disable-next-line no-console
        console.log('snapshot data JSON:', JSON.stringify(snapshotData, null, 2))
        // eslint-disable-next-line no-console
        console.log('skipped panels:', result.skipped)
        // eslint-disable-next-line no-console
        console.log('cache debug:', result.debug)
        // eslint-disable-next-line no-console
        console.log('active time range:', result.debug?.activeTimeRange)
        // eslint-disable-next-line no-console
        console.groupEnd()

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
