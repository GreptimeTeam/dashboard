import { logLevelRank, normalizeLogLevelName } from './level-color'

export interface LogVolumeSeries {
  name: string
  points: Array<[number, number]>
}

export interface LogVolumeRow {
  unix: number
  level: string | null
  count: number
}

/** Align buckets and stack by level. Single-series when the breakdown column is severity. */
export function pivotLogVolumeRows(
  rows: LogVolumeRow[],
  options: { groupByLevel: boolean; singleSeriesName: string }
): LogVolumeSeries[] {
  if (!rows.length) {
    return []
  }

  if (!options.groupByLevel) {
    const points = rows.map((row): [number, number] => [row.unix, row.count]).sort((left, right) => left[0] - right[0])
    return [{ name: normalizeLogLevelName(options.singleSeriesName), points }]
  }

  const buckets = new Set<number>()
  const countsByLevel = new Map<string, Map<number, number>>()
  rows.forEach((row) => {
    const name = normalizeLogLevelName(row.level)
    buckets.add(row.unix)
    const counts = countsByLevel.get(name) ?? new Map<number, number>()
    counts.set(row.unix, (counts.get(row.unix) ?? 0) + row.count)
    countsByLevel.set(name, counts)
  })

  const timeline = Array.from(buckets).sort((left, right) => left - right)
  return Array.from(countsByLevel.entries())
    .map(([name, counts]) => ({
      name,
      points: timeline.map((unix): [number, number] => [unix, counts.get(unix) ?? 0]),
    }))
    .sort((left, right) => logLevelRank(left.name) - logLevelRank(right.name))
}

/** Align buckets and stack by an arbitrary series name. Smallest total sits at the bottom. */
export function pivotLogVolumeByName(rows: Array<{ unix: number; name: string; count: number }>): LogVolumeSeries[] {
  if (!rows.length) {
    return []
  }

  const buckets = new Set<number>()
  const countsByName = new Map<string, Map<number, number>>()
  rows.forEach((row) => {
    buckets.add(row.unix)
    const counts = countsByName.get(row.name) ?? new Map<number, number>()
    counts.set(row.unix, (counts.get(row.unix) ?? 0) + row.count)
    countsByName.set(row.name, counts)
  })

  const timeline = Array.from(buckets).sort((left, right) => left - right)
  return Array.from(countsByName.entries())
    .map(([name, counts]) => ({
      name,
      points: timeline.map((unix): [number, number] => [unix, counts.get(unix) ?? 0]),
    }))
    .sort((left, right) => {
      const total = (series: LogVolumeSeries) => series.points.reduce((sum, point) => sum + point[1], 0)
      const byTotal = total(left) - total(right)
      return byTotal === 0 ? left.name.localeCompare(right.name) : byTotal
    })
}
