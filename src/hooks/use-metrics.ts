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

  const loading = ref(false)
  const error = ref<string | null>(null)

  // Current query state
  const currentQuery = ref('')
  const queryResult = ref<QueryResult | null>(null)
  const rangeQueryResult = ref<RangeQueryResult | null>(null)

  // Computed properties
  const metricNames = computed(() => metrics.value.map((m) => m.name))

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
  const executeRangeQuery = async (query: string, start?: number, end?: number, step?: number) => {
    try {
      loading.value = true
      error.value = null
      currentQuery.value = query

      const startTime = start
      const endTime = end
      const stepValue = step

      const response = await executePromQLRange(
        query,
        startTime.toString(),
        endTime.toString(),
        stepValue.toString(), // Convert number to string for API call
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
    }
  )

  return {
    // State
    metrics,
    loading,
    error,
    currentQuery,
    queryResult,
    rangeQueryResult,
    // Computed
    metricNames,
    // Methods
    fetchMetrics,
    fetchLabelValues,
    executeQuery,
    executeRangeQuery,
    searchMetrics,
  }
}
