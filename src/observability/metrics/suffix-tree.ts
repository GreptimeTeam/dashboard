import { METRIC_NAME_SEPARATOR, splitMetricName } from './prefix-tree'

export interface SuffixGroup {
  label: string
  value: string
  count: number
}

/** Grafana: metric name ends with suffix token after start or a non-alphanumeric separator. */
export function matchesSuffix(name: string, suffix: string): boolean {
  if (!suffix || !name.endsWith(suffix)) {
    return false
  }
  if (name.length === suffix.length) {
    return true
  }
  const charBefore = name[name.length - suffix.length - 1]
  return METRIC_NAME_SEPARATOR.test(charBefore)
}

export function matchesAnySuffix(name: string, suffixes: string[]): boolean {
  if (!suffixes.length) {
    return true
  }
  return suffixes.some((suffix) => matchesSuffix(name, suffix))
}

export function computeMetricSuffixGroups(names: string[]): SuffixGroup[] {
  const rawSuffixesMap = new Map<string, string[]>()

  names.forEach((name) => {
    const parts = splitMetricName(name)
    const key = parts.length <= 1 ? name : parts[parts.length - 1]
    const values = rawSuffixesMap.get(key) ?? []
    values.push(name)
    rawSuffixesMap.set(key || '<none>', values)
  })

  return [...rawSuffixesMap.entries()]
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
