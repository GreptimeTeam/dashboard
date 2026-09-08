/**
 * Prometheus / Greptime `query_range` omits empty timestamps. Without null samples,
 * ECharts still draws a line across the hole even with `connectNulls: false`.
 *
 * Insert one null when consecutive points are farther than ~1.5× the effective step
 * (max of query step and median delta — tolerates server step rounding).
 */
export default function breakSparklineGaps(
  points: Array<[number, number | null]>,
  stepSeconds: number
): Array<[number, number | null]> {
  if (points.length < 2) {
    return points
  }

  const deltas: number[] = []
  for (let i = 1; i < points.length; i += 1) {
    const delta = points[i][0] - points[i - 1][0]
    if (delta > 0) {
      deltas.push(delta)
    }
  }
  if (!deltas.length) {
    return points
  }

  deltas.sort((a, b) => a - b)
  const medianDelta = deltas[Math.floor(deltas.length / 2)]
  const baseStep = Math.max(stepSeconds > 0 ? stepSeconds : 0, medianDelta)
  if (!(baseStep > 0)) {
    return points
  }

  const maxGap = baseStep * 1.5
  const result: Array<[number, number | null]> = [points[0]]

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]
    const curr = points[i]
    const delta = curr[0] - prev[0]
    if (delta > maxGap) {
      result.push([prev[0] + baseStep, null])
    }
    result.push(curr)
  }

  return result
}
