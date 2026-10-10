/**
 * Classic Wagner–Fischer Levenshtein distance (small strings: metric names).
 * Avoids an extra dependency for Related metrics sort.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0
  }
  if (!a.length) {
    return b.length
  }
  if (!b.length) {
    return a.length
  }

  const previous = new Array<number>(b.length + 1)
  const current = new Array<number>(b.length + 1)

  for (let j = 0; j <= b.length; j += 1) {
    previous[j] = j
  }

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j]
    }
  }

  return previous[b.length]
}

type LevenDistances = { halfLeven: number; wholeLeven: number }

/** Cache: candidate → target → distances (Grafana RelatedMetrics order). */
const candidateToTargetDistances = new Map<string, Map<string, LevenDistances>>()

/**
 * Levenshtein distances for related-metric sort.
 * Only `candidate` is split for the half-name distance (asymmetric, matches Grafana).
 */
function getLevenDistances(candidate: string, targetMetric: string): LevenDistances {
  let targetMap = candidateToTargetDistances.get(candidate)
  if (!targetMap) {
    targetMap = new Map<string, LevenDistances>()
    candidateToTargetDistances.set(candidate, targetMap)
  }

  let distances = targetMap.get(targetMetric)
  if (!distances) {
    const parts = candidate.split('_')
    const half = parts.slice(0, Math.floor(parts.length / 2)).join('_')
    distances = {
      halfLeven: levenshtein(half, targetMetric),
      wholeLeven: levenshtein(candidate, targetMetric),
    }
    targetMap.set(targetMetric, distances)
  }

  return distances
}

/** Sort metric names by similarity to `metric` (lower edit distance first). */
export function sortRelatedMetrics(metricList: string[], metric: string): string[] {
  return [...metricList].sort((left, right) => {
    const a = getLevenDistances(left, metric)
    const b = getLevenDistances(right, metric)
    return a.halfLeven + a.wholeLeven - (b.halfLeven + b.wholeLeven)
  })
}

/** Test helper: clear distance cache between cases. */
export function clearRelatedMetricsDistanceCache(): void {
  candidateToTargetDistances.clear()
}
