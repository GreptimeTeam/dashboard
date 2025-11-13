export const CARD_DIMENSIONS = {
  width: 200,
  minHeight: 40,
  progressBarHeight: 30,
  singleMetricHeight: 20,
  expandedBaseHeight: 25,
  metricLineHeight: 18,
  padding: 20, // Padding between nodes
  horizontalPadding: 60, // Add this new parameter for horizontal spacing
}

export const NODE_INDEX_CARD = {
  width: 70,
  height: 30,
  fontSize: 12,
}

export function formatNumber(value) {
  return new Intl.NumberFormat().format(value)
}

export function formatTimeValue(nanoseconds) {
  if (nanoseconds === undefined || nanoseconds === null) return '0'

  if (nanoseconds < 1000) return `${nanoseconds}ns`
  if (nanoseconds < 1000000) return `${(nanoseconds / 1000).toFixed(2)}μs`
  if (nanoseconds < 1000000000) return `${(nanoseconds / 1000000).toFixed(2)}ms`
  return `${(nanoseconds / 1000000000).toFixed(2)}s`
}

export function formatMetricValue(key, value) {
  if (typeof value === 'number') {
    if (key.includes('elapsed_compute')) {
      return formatTimeValue(value)
    }

    return formatNumber(value)
  }
  return value
}

export function getProgressColor(percentage) {
  if (percentage < 20) return 'var(--success-color)'
  if (percentage < 80) return 'var(--warning-color)'
  return 'var(--danger-color)'
}

export function formatMetricName(key: string): string {
  const map: Record<string, string> = {
    output_rows: 'Rows',
    elapsed_compute: 'Duration',
  }
  return (
    map[key] ||
    key
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  )
}
