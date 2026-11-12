import { readJSON, sessionStore, writeJSON } from '@/utils/storage'

const RECENT_METRICS_KEY = 'drilldown-recent-metrics'
const MAX_RECENT_METRICS = 20

export function getRecentMetrics(): string[] {
  const parsed = readJSON<unknown>(RECENT_METRICS_KEY, sessionStore())
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed.filter((item): item is string => typeof item === 'string')
}

export function rememberRecentMetric(name: string) {
  const trimmed = name.trim()
  if (!trimmed) {
    return
  }
  const next = [trimmed, ...getRecentMetrics().filter((item) => item !== trimmed)].slice(0, MAX_RECENT_METRICS)
  writeJSON(RECENT_METRICS_KEY, next, sessionStore())
}
