import * as React from 'react'
import { Typography } from '@mui/material'
import { useAllVariableValues, useDatasourceStore, useTimeRange } from '@perses-dev/plugin-system'
import { setLiveExportRuntime } from '../snapshot/liveExportRuntimeStore'

interface LiveExportRuntimeCaptureProps {
  dashboardName: string
}

/**
 * Renders the default dashboard title and silently captures live TimeRange /
 * Variable / DatasourceStore for snapshot export (runs inside ViewDashboard providers).
 */
export default function LiveExportRuntimeCapture({ dashboardName }: LiveExportRuntimeCaptureProps) {
  const { absoluteTimeRange } = useTimeRange()
  const variableState = useAllVariableValues()
  const datasourceStore = useDatasourceStore()

  React.useLayoutEffect(() => {
    setLiveExportRuntime({
      absoluteTimeRange,
      variableState,
      datasourceStore,
    })
    return () => {
      setLiveExportRuntime(undefined)
    }
  }, [absoluteTimeRange, variableState, datasourceStore])

  return (
    <Typography variant="h2" sx={{ margin: 0 }}>
      {dashboardName}
    </Typography>
  )
}
