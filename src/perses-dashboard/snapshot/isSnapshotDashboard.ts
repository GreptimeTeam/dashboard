import type { DashboardResource, EphemeralDashboardResource } from '@perses-dev/core'
import type { SnapshotDashboardResource, SnapshotEmbed } from './types'
import { SNAPSHOT_VERSION } from './types'

type DashboardLike = DashboardResource | EphemeralDashboardResource

export type { DashboardLike }

function isValidSnapshotVersion(version: unknown): boolean {
  return version === SNAPSHOT_VERSION || version === '1'
}

function hasSnapshotEmbedContent(snapshot: {
  panelData?: unknown
  timeRange?: unknown
  capturedAt?: unknown
}): boolean {
  return Boolean(snapshot.panelData || snapshot.timeRange || snapshot.capturedAt)
}

export function getSnapshotEmbed(dashboard: DashboardLike | undefined): SnapshotEmbed | undefined {
  if (!dashboard?.spec) return undefined
  const { snapshot } = dashboard.spec as SnapshotDashboardResource['spec']
  if (!snapshot || typeof snapshot !== 'object') return undefined

  if (isValidSnapshotVersion(snapshot.version) || hasSnapshotEmbedContent(snapshot)) {
    return snapshot
  }

  return undefined
}

export function isSnapshotDashboard(dashboard: DashboardLike | undefined): boolean {
  return getSnapshotEmbed(dashboard) !== undefined
}
