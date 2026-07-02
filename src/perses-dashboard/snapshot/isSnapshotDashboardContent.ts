import { isSnapshotDashboardContent as isSnapshotContent } from './dashboardCategory'

export {
  DASHBOARD_CATEGORY_ANNOTATION,
  DASHBOARD_CATEGORY_DASHBOARD,
  DASHBOARD_CATEGORY_SNAPSHOT,
  annotateDashboardCategory,
  getDashboardCategoryFromContent,
  type DashboardCategory,
} from './dashboardCategory'

export const isSnapshotDashboardContent = isSnapshotContent

export function getSnapshotDisplayName(name: string, content: string | undefined): string {
  if (!isSnapshotContent(content)) return name
  if (name.startsWith('[Snapshot] ')) return name
  return `[Snapshot] ${name}`
}
