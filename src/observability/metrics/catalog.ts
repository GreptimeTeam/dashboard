import type { DrilldownGroupBy, DrilldownSidebarFilters } from '../types'
import { matchesAnyPrefix, splitMetricName } from './prefix-tree'
import { matchesAnySuffix } from './suffix-tree'

export type MetricsSortOption = 'default' | 'asc' | 'desc'

export interface MetricGroup {
  key: string
  label: string
  names: string[]
}

export function matchesSearch(name: string, search: string): boolean {
  const query = search.trim().toLowerCase()
  if (!query) {
    return true
  }
  return name.toLowerCase().includes(query)
}

export function applySidebarFilters(
  names: string[],
  sidebarFilters: DrilldownSidebarFilters,
  search: string
): string[] {
  return names.filter(
    (name) =>
      matchesAnyPrefix(name, sidebarFilters.prefixes) &&
      matchesAnySuffix(name, sidebarFilters.suffixes) &&
      matchesSearch(name, search)
  )
}

export function sortMetricNames(names: string[], sort: MetricsSortOption, recentMetrics: string[]): string[] {
  const sorted = [...names]
  if (sort === 'asc') {
    sorted.sort((left, right) => left.localeCompare(right))
    return sorted
  }
  if (sort === 'desc') {
    sorted.sort((left, right) => right.localeCompare(left))
    return sorted
  }

  const recentRank = new Map(recentMetrics.map((name, index) => [name, index]))
  sorted.sort((left, right) => {
    const leftRank = recentRank.get(left)
    const rightRank = recentRank.get(right)
    if (leftRank !== undefined && rightRank !== undefined) {
      return leftRank - rightRank
    }
    if (leftRank !== undefined) {
      return -1
    }
    if (rightRank !== undefined) {
      return 1
    }
    return left.localeCompare(right)
  })
  return sorted
}

export function groupMetricNames(names: string[], groupBy: DrilldownGroupBy): MetricGroup[] {
  if (!names.length) {
    return []
  }

  if (groupBy !== '__name__') {
    return [
      {
        key: '__flat__',
        label: '',
        names,
      },
    ]
  }

  const groups = new Map<string, string[]>()
  names.forEach((name) => {
    const parts = splitMetricName(name)
    const key = parts.length <= 1 ? name : parts[0]
    const items = groups.get(key)
    if (items) {
      items.push(name)
    } else {
      groups.set(key, [name])
    }
  })

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, groupNames]) => ({
      key,
      label: key,
      names: groupNames,
    }))
}
