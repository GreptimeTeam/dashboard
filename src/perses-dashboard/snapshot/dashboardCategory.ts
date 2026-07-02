import type { DashboardResource } from '@perses-dev/core'
import { SNAPSHOT_VERSION } from './types'

export const DASHBOARD_CATEGORY_SNAPSHOT = 'snapshot'
export const DASHBOARD_CATEGORY_DASHBOARD = 'dashboard'

export type DashboardCategory = typeof DASHBOARD_CATEGORY_SNAPSHOT | typeof DASHBOARD_CATEGORY_DASHBOARD

export const DASHBOARD_CATEGORY_ANNOTATION = 'greptime.com/dashboard-category'

export function getDashboardCategoryFromContent(content: string | undefined): DashboardCategory {
  if (!content?.trim()) {
    return DASHBOARD_CATEGORY_DASHBOARD
  }

  try {
    const parsed = JSON.parse(content) as DashboardResource & {
      metadata?: { annotations?: Record<string, string> }
    }
    const annotated = parsed.metadata?.annotations?.[DASHBOARD_CATEGORY_ANNOTATION]
    if (annotated === DASHBOARD_CATEGORY_SNAPSHOT) {
      return DASHBOARD_CATEGORY_SNAPSHOT
    }

    const snapshot = (parsed.spec as { snapshot?: { version?: number | string; panelData?: unknown } } | undefined)
      ?.snapshot
    if (snapshot && typeof snapshot === 'object') {
      if (snapshot.version === SNAPSHOT_VERSION || snapshot.version === '1' || snapshot.panelData) {
        return DASHBOARD_CATEGORY_SNAPSHOT
      }
    }
  } catch {
    // fall through
  }

  return DASHBOARD_CATEGORY_DASHBOARD
}

export function isSnapshotDashboardContent(content: string | undefined): boolean {
  return getDashboardCategoryFromContent(content) === DASHBOARD_CATEGORY_SNAPSHOT
}

export function annotateDashboardCategory<T extends Record<string, unknown>>(
  dashboard: T,
  category: DashboardCategory
): T {
  const next = { ...dashboard } as T & {
    metadata?: { annotations?: Record<string, string> }
  }
  const metadata = {
    ...(next.metadata ?? {}),
    annotations: {
      ...((next.metadata as { annotations?: Record<string, string> } | undefined)?.annotations ?? {}),
      [DASHBOARD_CATEGORY_ANNOTATION]: category,
    },
  }
  next.metadata = metadata as T['metadata']
  return next
}
