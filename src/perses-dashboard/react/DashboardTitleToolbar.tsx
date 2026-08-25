import * as React from 'react'
import { Box, Button, Menu, MenuItem, Typography } from '@mui/material'
import { useAllVariableValues, useDatasourceStore, useTimeRange } from '@perses-dev/plugin-system'
import { setLiveExportRuntime } from '../snapshot/liveExportRuntimeStore'

export type DashboardToolbarLabels = {
  saveSnapshot: string
  exportSnapshot: string
}

interface DashboardTitleToolbarProps {
  dashboardName: string
  labels: DashboardToolbarLabels
}

function SnapshotIcon(): JSX.Element {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden
      sx={{ width: 18, height: 18, display: 'block', fill: 'currentColor' }}
    >
      <path d="M4 7h3l1.5-2h7L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2m8 11a5 5 0 1 0 0-10 5 5 0 0 0 0 10m0-2a3 3 0 1 1 0-6 3 3 0 0 1 0 6" />
    </Box>
  )
}

function postToolbarAction(action: 'saveSnapshot' | 'exportSnapshotJson'): void {
  if (window.parent === window) return
  window.parent.postMessage({ type: 'perses-toolbar-action', action }, '*')
}

/**
 * Dashboard title row: captures live export runtime and exposes a compact snapshot
 * dropdown beside the Perses Edit button.
 */
export default function DashboardTitleToolbar({ dashboardName, labels }: DashboardTitleToolbarProps) {
  const { absoluteTimeRange } = useTimeRange()
  const variableState = useAllVariableValues()
  const datasourceStore = useDatasourceStore()
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null)
  const menuOpen = Boolean(menuAnchor)

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

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget)
  }

  const handleMenuClose = () => {
    setMenuAnchor(null)
  }

  const handleSaveSnapshot = () => {
    handleMenuClose()
    postToolbarAction('saveSnapshot')
  }

  const handleExportSnapshot = () => {
    handleMenuClose()
    postToolbarAction('exportSnapshotJson')
  }

  return (
    <Box
      className="gpt-dashboard-title-toolbar"
      sx={{
        display: 'flex',
        alignItems: 'center',
        flex: 1,
        minWidth: 0,
        gap: 2,
      }}
    >
      <Typography variant="h2" sx={{ margin: 0, minWidth: 0 }} noWrap>
        {dashboardName}
      </Typography>
      <Button
        className="gpt-dashboard-toolbar-actions"
        variant="outlined"
        color="secondary"
        aria-label={labels.saveSnapshot}
        aria-haspopup="menu"
        aria-expanded={menuOpen ? 'true' : undefined}
        onClick={handleMenuOpen}
        sx={{
          ml: 'auto',
          minWidth: 'auto',
          px: 1,
          gap: 0.25,
          whiteSpace: 'nowrap',
        }}
      >
        <SnapshotIcon />
        <Box component="span" sx={{ fontSize: 10, lineHeight: 1, opacity: 0.85 }}>
          ▾
        </Box>
      </Button>
      <Menu
        anchorEl={menuAnchor}
        open={menuOpen}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={handleSaveSnapshot}>{labels.saveSnapshot}</MenuItem>
        <MenuItem onClick={handleExportSnapshot}>{labels.exportSnapshot}</MenuItem>
      </Menu>
    </Box>
  )
}
