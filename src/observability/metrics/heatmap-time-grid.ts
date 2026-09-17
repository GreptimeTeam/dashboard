/** Safety cap so a 1s step over a long range cannot allocate tens of thousands of empty columns. */
const MAX_HEATMAP_TIME_COLUMNS = 800

function inferHeatmapStepSec(timesSec: number[], stepSeconds?: number): number {
  if (stepSeconds != null && stepSeconds > 0) {
    return Math.max(1, Math.round(stepSeconds))
  }
  const sorted = [...timesSec].sort((left, right) => left - right)
  let minGap = Number.POSITIVE_INFINITY
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = sorted[index] - sorted[index - 1]
    if (gap > 0 && gap < minGap) {
      minGap = gap
    }
  }
  if (Number.isFinite(minGap) && minGap >= 1) {
    return Math.round(minGap)
  }
  return 0
}

/**
 * Grafana heatmap: X scale is the selected time range; each cell is one X bucket
 * (`step`) wide at its sample timestamp. Empty buckets stay empty — they are not
 * stretched across the panel (ECharts category axis would do that if we only passed
 * the timestamps that have data).
 */
export default function expandHeatmapTimeGrid(
  timesSec: number[],
  cells: Array<[number, number, number]>,
  timeRange: [number, number] | undefined,
  stepSeconds?: number
): { times: number[]; cells: Array<[number, number, number]> } {
  if (!timeRange || !(timeRange[1] > timeRange[0]) || timesSec.length === 0) {
    return { times: timesSec, cells }
  }

  const startSec = timeRange[0]
  const endSec = timeRange[1]
  let step = inferHeatmapStepSec(timesSec, stepSeconds)
  if (!(step > 0)) {
    return { times: timesSec, cells }
  }

  const span = endSec - startSec
  if (Math.floor(span / step) + 1 > MAX_HEATMAP_TIME_COLUMNS) {
    step = Math.max(step, Math.ceil(span / (MAX_HEATMAP_TIME_COLUMNS - 1)))
  }
  // One bucket covers the whole window — filling the width is the bucket itself.
  if (!(span > step)) {
    return { times: timesSec, cells }
  }

  const anchor = Math.min(...timesSec)
  let first = anchor + Math.ceil((startSec - anchor) / step) * step
  if (first < startSec) {
    first += step
  }
  if (!(first <= endSec)) {
    return { times: timesSec, cells }
  }

  const grid: number[] = []
  for (let timestamp = first; timestamp <= endSec + 1e-6 && grid.length < MAX_HEATMAP_TIME_COLUMNS; timestamp += step) {
    grid.push(timestamp)
  }
  if (grid.length < 2) {
    return { times: timesSec, cells }
  }

  const merged = new Map<string, [number, number, number]>()
  cells.forEach(([timeIndex, bucketIndex, value]) => {
    const timeSec = timesSec[timeIndex]
    if (timeSec == null || !Number.isFinite(timeSec)) {
      return
    }
    const offset = Math.round((timeSec - grid[0]) / step)
    const nextIndex = Math.min(grid.length - 1, Math.max(0, offset))
    const key = `${nextIndex}\0${bucketIndex}`
    const existing = merged.get(key)
    if (existing) {
      existing[2] += value
      return
    }
    merged.set(key, [nextIndex, bucketIndex, value])
  })

  return { times: grid, cells: [...merged.values()] }
}
