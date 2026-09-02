const RECENT_METRICS_KEY = 'drilldown-recent-metrics'
const MAX_RECENT_METRICS = 20

export function getRecentMetrics(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_METRICS_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((item) => typeof item === 'string')
  } catch {
    return []
  }
}

export function rememberRecentMetric(name: string) {
  const trimmed = name.trim()
  if (!trimmed) {
    return
  }
  const next = [trimmed, ...getRecentMetrics().filter((item) => item !== trimmed)].slice(0, MAX_RECENT_METRICS)
  localStorage.setItem(RECENT_METRICS_KEY, JSON.stringify(next))
}
