import { ref, computed, watch } from 'vue'
// import { useStorage } from '@vueuse/core'
import {
  getMetricNames,
  getLabelNames,
  getLabelValues,
  executePromQL,
  executePromQLRange,
  searchMetricNames,
} from '@/api/metrics'
import { useAppStore } from '@/store'

export interface MetricData {
  name: string
  description?: string
}

export interface LabelData {
  name: string
  values: string[]
}

export interface QueryResult {
  status: string
  data: {
    resultType: string
    result: any[]
  }
}

export interface RangeQueryResult {
  status: string
  data: {
    resultType: string
    result: any[]
  }
}

export function useMetrics() {
  const appStore = useAppStore()

  // Reactive state
  const metrics = ref<MetricData[]>([])
  const labels = ref<LabelData[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Current query state
  const currentQuery = ref('')
  const queryResult = ref<QueryResult | null>(null)
  const rangeQueryResult = ref<RangeQueryResult | null>(null)

  // Time range for queries
  const timeRange = ref({
    start: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    end: Math.floor(Date.now() / 1000), // now
    step: '15s',
  })

  // Computed properties
  const metricNames = computed(() => metrics.value.map((m) => m.name))
  const labelNames = computed(() => labels.value.map((l) => l.name))

  // Fetch all metric names
  const fetchMetrics = async (_match?: string) => {
    try {
      loading.value = true
      error.value = null
      const response = await getMetricNames(appStore.database)
      if (response.data) {
        const metricList = response.data.map((name: string) => ({ name }))
        metrics.value = metricList
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch metrics'
      console.error('Error fetching metrics:', err)
    } finally {
      loading.value = false
    }
  }

  // Remote search for metric names
  const searchMetrics = async (keyword: string) => {
    try {
      loading.value = true
      error.value = null
      const safe = keyword.trim()
      if (!safe) {
        await fetchMetrics()
        return metrics.value.map((m) => m.name)
      }
      // Build a permissive regex body, escape quotes
      const regex = `${safe.replace(/"/g, '\\"')}`
      const resp = await searchMetricNames(regex, appStore.database)
      const list: string[] = resp.data || []
      return list
    } catch (err: any) {
      console.error('Error remote searching metrics:', err)
      return []
    } finally {
      loading.value = false
    }
  }

  // Fetch all label names
  const fetchLabels = async (match?: string) => {
    try {
      loading.value = true
      error.value = null
      const response = await getLabelNames(match, appStore.database)
      if (response.data) {
        const names: string[] = response.data.filter((n: string) => n !== '__name__')
        const labelList = names.map((name: string) => ({ name, values: [] }))
        labels.value = labelList
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch labels'
      console.error('Error fetching labels:', err)
    } finally {
      loading.value = false
    }
  }

  // Fetch values for a specific label
  const fetchLabelValues = async (labelName: string, match?: string) => {
    try {
      const response = await getLabelValues(labelName, match, appStore.database)
      if (response.data) {
        const values = response.data
        return values
      }
      return []
    } catch (err: any) {
      console.error(`Error fetching values for label ${labelName}:`, err)
      return []
    }
  }

  // Execute PromQL query
  const executeQuery = async (query: string, time?: number) => {
    try {
      loading.value = true
      error.value = null
      currentQuery.value = query

      const response = await executePromQL(query, time?.toString(), appStore.database)
      queryResult.value = response.data
      return response.data
    } catch (err: any) {
      error.value = err.message || 'Failed to execute query'
      console.error('Error executing query:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  // Execute PromQL range query
  const executeRangeQuery = async (query: string, start?: number, end?: number, step?: string) => {
    try {
      loading.value = true
      error.value = null
      currentQuery.value = query

      const startTime = start || timeRange.value.start
      const endTime = end || timeRange.value.end
      const stepValue = step || timeRange.value.step

      const response = await executePromQLRange(
        query,
        startTime.toString(),
        endTime.toString(),
        stepValue,
        appStore.database
      )
      rangeQueryResult.value = response.data
      return response.data
    } catch (err: any) {
      error.value = err.message || 'Failed to execute range query'
      console.error('Error executing range query:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  // Update time range
  const updateTimeRange = (start: number, end: number, step: string) => {
    timeRange.value = { start, end, step }
  }

  // Clear results
  const clearResults = () => {
    queryResult.value = null
    rangeQueryResult.value = null
    error.value = null
  }

  // Watch database changes to refresh data
  watch(
    () => appStore.database,
    () => {
      fetchMetrics()
      fetchLabels()
    }
  )

  // Initialize
  const initialize = async () => {
    await Promise.all([fetchMetrics(), fetchLabels()])
  }

  return {
    // State
    metrics,
    labels,
    loading,
    error,
    currentQuery,
    queryResult,
    rangeQueryResult,
    timeRange,

    // Computed
    metricNames,
    labelNames,

    // Methods
    fetchMetrics,
    fetchLabels,
    fetchLabelValues,
    executeQuery,
    executeRangeQuery,
    updateTimeRange,
    clearResults,
    initialize,
    searchMetrics,
  }
}
