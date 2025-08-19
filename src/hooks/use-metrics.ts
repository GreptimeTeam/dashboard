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
import useTimeRange from '@/hooks/use-time-range'

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
  const queryLoading = ref(false)

  // Current query state
  const currentQuery = ref('')
  const currentTimeRange = ref<number[]>([])
  const queryResult = ref<QueryResult | null>(null)
  const rangeQueryResult = ref<Array<any>>(null)
  const queryStep = ref<number>()

  // Time range and step management
  const timeRangeState = useTimeRange({ time: 10 })
  const { rangeTime, time, unixTimeRange } = timeRangeState

  // Manual step override
  const manualStep = ref<number>()

  // Track previous query for partial updates
  const previousQuery = ref('')
  const previousStep = ref<number>()

  // Computed properties
  const metricNames = computed(() => metrics.value.map((m) => m.name))

  // Auto compute step based on user-selected time range using Prometheus UI logic
  const getQueryStep = () => {
    // If step is manually set, use it
    if (manualStep.value) {
      console.log('Using manually set step:', manualStep.value)
      return manualStep.value
    }

    // Auto-calculate step based on user-selected time range
    const timeRange = unixTimeRange()
    if (timeRange.length === 2) {
      const [start, end] = timeRange as [number, number]
      const diffSeconds = end - start

      // Use Prometheus UI's exact logic: range / 250 for ~250 data points
      const targetStepSeconds = Math.max(Math.floor(diffSeconds / 250), 1)
      return targetStepSeconds
    }
    return 1 // Prometheus UI default when no range
  }

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

  // Execute PromQL range query (lower-level method)
  const executeRangeQuery = async (query: string, start?: number, end?: number, step?: number) => {
    try {
      queryLoading.value = true
      error.value = null
      currentQuery.value = query

      const startTime = start
      const endTime = end
      const stepValue = step

      const response = await executePromQLRange(
        query,
        (startTime || 0).toString(),
        (endTime || 0).toString(),
        (stepValue || 1).toString(), // Convert number to string for API call
        appStore.database
      )

      rangeQueryResult.value = response.data.result
      return response.data
    } catch (err: any) {
      error.value = err.message || 'Failed to execute range query'
      console.error('Error executing range query:', err)
      throw err
    } finally {
      queryLoading.value = false
    }
  }

  // Execute PromQL range query with automatic time range and step
  const executeQuery = async (query: string) => {
    if (!query.trim()) {
      throw new Error('Query cannot be empty')
    }

    // Get time range and step
    const timeRange = unixTimeRange()
    queryStep.value = getQueryStep()
    const stepValue = queryStep.value

    // Check if this is the same PromQL query (important for partial series updates)
    const isSameQuery = previousQuery.value === query && previousStep.value === stepValue

    let actualTimeRange: number[]

    if (isSameQuery) {
      // Same query: align time range to step boundaries for consistent timestamps
      const [rawStart, rawEnd] = timeRange
      const duration = rawEnd - rawStart

      // Align end time to step boundary (round down to nearest step)
      const alignedEnd = Math.floor(rawEnd / stepValue) * stepValue
      // Align start time to maintain duration
      const alignedStart = alignedEnd - duration

      actualTimeRange = [alignedStart, alignedEnd]
    } else {
      // Different query: align to step boundaries for clean timestamps
      const [rawStart, rawEnd] = timeRange
      const duration = rawEnd - rawStart

      // Align both start and end to step boundaries
      const alignedEnd = Math.floor(rawEnd / stepValue) * stepValue
      const alignedStart = alignedEnd - duration
      actualTimeRange = [alignedStart, alignedEnd]
    }

    // Store current query state for next comparison
    previousQuery.value = query
    previousStep.value = stepValue
    currentTimeRange.value = actualTimeRange
    const [start, end] = actualTimeRange

    console.log('🚀 Executing query with step-aligned params:', {
      query,
      timeRange: actualTimeRange,
      start: new Date(start * 1000).toISOString(),
      end: new Date(end * 1000).toISOString(),
      step: stepValue,
      isSameQuery,
    })

    return executeRangeQuery(query, start, end, stepValue)
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
    currentTimeRange,
    queryResult,
    rangeQueryResult,
    queryLoading,

    // Time range state
    rangeTime,
    time,
    manualStep,

    // Previous query tracking (for partial updates)
    previousQuery,
    previousStep,

    // Computed
    metricNames,
    unixTimeRange,
    queryStep,

    // Methods
    fetchMetrics,
    fetchLabelValues,
    executeQuery, // High-level reactive method
    executeRangeQuery, // Low-level method
    searchMetrics,
  }
}
