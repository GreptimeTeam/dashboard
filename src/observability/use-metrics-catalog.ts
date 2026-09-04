import { computed, ref, watch, type Ref } from 'vue'
import { buildMatchSelector, fetchMetricNamesPool } from './adapters/metrics'
import {
  applySidebarFilters,
  groupMetricNames,
  matchesSearch,
  sortMetricNames,
  type MetricsSortOption,
} from './metrics/catalog'
import { computeMetricPrefixGroups } from './metrics/prefix-tree'
import { computeMetricSuffixGroups } from './metrics/suffix-tree'
import { getRecentMetrics } from './metrics/recent'
import type { DrilldownContext } from './context'

export default function useMetricsCatalog(ctx: DrilldownContext, search: Ref<string>, sort: Ref<MetricsSortOption>) {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const poolNames = ref<string[]>([])
  const truncated = ref(false)

  const loadPool = async () => {
    loading.value = true
    error.value = null
    try {
      const unixRange = ctx.unixTimeRange()
      const start = unixRange.length === 2 ? String(unixRange[0]) : undefined
      const end = unixRange.length === 2 ? String(unixRange[1]) : undefined
      const selector = buildMatchSelector(ctx.filters.value, ctx.metric.value)
      const result = await fetchMetricNamesPool({
        start,
        end,
        ...(selector ? { match: [selector] } : {}),
      })
      poolNames.value = result.names
      truncated.value = result.truncated
    } catch (err) {
      console.error('Failed to load metric catalog:', err)
      poolNames.value = []
      truncated.value = false
      error.value = err instanceof Error ? err.message : 'Failed to load metrics'
    } finally {
      loading.value = false
    }
  }

  watch(
    () => [ctx.filters.value, ctx.time.value, ctx.rangeTime.value[0], ctx.rangeTime.value[1], ctx.refreshKey.value],
    () => {
      loadPool()
    },
    { deep: true, immediate: true }
  )

  const catalogNamesForTree = computed(() => poolNames.value.filter((name) => matchesSearch(name, search.value)))

  const prefixGroups = computed(() => computeMetricPrefixGroups(catalogNamesForTree.value))
  const suffixGroups = computed(() => computeMetricSuffixGroups(catalogNamesForTree.value))

  const filteredNames = computed(() => applySidebarFilters(poolNames.value, ctx.sidebarFilters.value, search.value))

  const sortedNames = computed(() => sortMetricNames(filteredNames.value, sort.value, getRecentMetrics()))

  const groups = computed(() => groupMetricNames(sortedNames.value, ctx.sidebarFilters.value.groupBy))

  return {
    loading,
    error,
    truncated,
    poolCount: computed(() => poolNames.value.length),
    filteredCount: computed(() => sortedNames.value.length),
    prefixGroups,
    metricNames: catalogNamesForTree,
    suffixGroups,
    groups,
    flatNames: sortedNames,
    reload: loadPool,
  }
}
