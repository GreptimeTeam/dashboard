/** Matches any non-alphanumeric separator in metric names (_, -, :, ., etc.). */
export const METRIC_NAME_SEPARATOR = /[^a-zA-Z0-9]/

/** Hierarchical filter value separator: parent:child (e.g. grafana:alert). */
export const HIERARCHICAL_SEPARATOR = ':'

export interface PrefixGroup {
  label: string
  value: string
  count: number
}

export interface PrefixChildGroup {
  label: string
  value: string
  count: number
}

export function splitMetricName(name: string): string[] {
  return name.split(METRIC_NAME_SEPARATOR).filter(Boolean)
}

export function computeMetricPrefixGroups(names: string[]): PrefixGroup[] {
  const rawPrefixesMap = new Map<string, string[]>()

  names.forEach((name) => {
    const parts = splitMetricName(name)
    const key = parts.length <= 1 ? name : parts[0]
    const values = rawPrefixesMap.get(key) ?? []
    values.push(name)
    rawPrefixesMap.set(key || '<none>', values)
  })

  return [...rawPrefixesMap.entries()]
    .sort((left, right) => {
      if (left[1].length !== right[1].length) {
        return right[1].length - left[1].length
      }
      return left[0].localeCompare(right[0])
    })
    .map(([value, metricNames]) => ({
      label: value,
      value,
      count: metricNames.length,
    }))
}

export function computeMetricPrefixSecondLevel(names: string[], parentPrefix: string): PrefixChildGroup[] {
  const sublevelMap = new Map<string, number>()

  names.forEach((name) => {
    const parts = splitMetricName(name)
    if (parts[0] === parentPrefix && parts.length > 1) {
      const sublevel = parts[1]
      sublevelMap.set(sublevel, (sublevelMap.get(sublevel) || 0) + 1)
    }
  })

  return [...sublevelMap.entries()]
    .sort((left, right) => {
      if (left[1] !== right[1]) {
        return right[1] - left[1]
      }
      return left[0].localeCompare(right[0])
    })
    .map(([sublevel, count]) => ({
      label: sublevel,
      value: `${parentPrefix}${HIERARCHICAL_SEPARATOR}${sublevel}`,
      count,
    }))
}

export function isHierarchicalPrefix(value: string): boolean {
  return value.includes(HIERARCHICAL_SEPARATOR)
}

export function parentPrefixOf(value: string): string {
  return value.split(HIERARCHICAL_SEPARATOR)[0] ?? value
}

export function matchesPrefix(name: string, filter: string): boolean {
  const parts = splitMetricName(name)
  if (!parts.length) {
    return false
  }

  if (isHierarchicalPrefix(filter)) {
    const [parent, child] = filter.split(HIERARCHICAL_SEPARATOR)
    return parts[0] === parent && parts[1] === child
  }

  return parts[0] === filter
}

export function matchesAnyPrefix(name: string, prefixes: string[]): boolean {
  if (!prefixes.length) {
    return true
  }
  return prefixes.some((prefix) => matchesPrefix(name, prefix))
}
