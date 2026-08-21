import * as React from 'react'
import type { DashboardResource } from '@perses-dev/core'
import type { SnapshotEmbed } from '../snapshot/types'
import { getSnapshotEmbed } from '../snapshot/isSnapshotDashboard'
import { getActiveSnapshotEmbed, setActiveSnapshotEmbed } from '../snapshot/plugins/snapshotEmbedStore'

type SnapshotContextValue = {
  snapshot: SnapshotEmbed | undefined
  isSnapshotMode: boolean
}

const SnapshotContext = React.createContext<SnapshotContextValue>({
  snapshot: undefined,
  isSnapshotMode: false,
})

export function SnapshotProvider({ dashboard, children }: { dashboard: DashboardResource; children: React.ReactNode }) {
  const snapshot = getSnapshotEmbed(dashboard)
  const isSnapshotMode = snapshot !== undefined

  // Set before children render so first panel queries see embedded data (staleTime: Infinity).
  if (getActiveSnapshotEmbed() !== snapshot) {
    setActiveSnapshotEmbed(snapshot)
  }

  React.useEffect(() => {
    setActiveSnapshotEmbed(snapshot)
    return () => {
      setActiveSnapshotEmbed(undefined)
    }
  }, [snapshot])

  const value = React.useMemo(
    () => ({
      snapshot,
      isSnapshotMode,
    }),
    [snapshot, isSnapshotMode]
  )

  return <SnapshotContext.Provider value={value}>{children}</SnapshotContext.Provider>
}

export function useSnapshotContext() {
  return React.useContext(SnapshotContext)
}
