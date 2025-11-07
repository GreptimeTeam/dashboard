/**
 * Composable for managing PromQL queries and time series data
 * Handles both instant queries (for table data) and range queries (for charts)
 * with automatic time range alignment and step calculation
 *
 * This hook is specifically for series data operations, not metric metadata
 */
import { ref, computed, watch } from 'vue'
// import { useStorage } from '@vueuse/core'
import { executePromQL, executePromQLRange } from '@/api/metrics'
import { useAppStore } from '@/store'
import useTimeRange from '@/hooks/use-time-range'

export interface SeriesQueryResult {
  status: string
  data: {
    resultType: string
    result: any[]
  }
}

export interface SeriesRangeResult {
  status: string
  data: {
    resultType: string
    result: any[]
  }
}

export function useSeries() {
  const appStore = useAppStore()

  // Reactive state
  const queryLoading = ref(false)

  // Current query state
  const currentQuery = ref('')
  const currentTimeRange = ref<number[]>([])
  const queryResult = ref<SeriesQueryResult | null>(null)
  const rangeQueryResult = ref<Array<any>>(null)
  const instantQueryResult = ref<Array<any>>(null) // For table data
  const queryStep = ref<number>()
  const currentStep = ref(0)

  // Instant query specific time (for table data)
  const instantQueryTime = ref<Date | null>(null)

  // Time range and step management
  const timeRangeState = useTimeRange({ time: 10 })
  const { rangeTime, time, unixTimeRange } = timeRangeState

  // Track previous query for partial updates
  const previousQuery = ref('')
  const previousStep = ref<number>()

  // Execute PromQL instant query (for table data - current values)
  const executeInstantQuery = async (query: string, timestamp?: Date) => {
    currentQuery.value = query

    // Use provided timestamp, or instantQueryTime, or current time as fallback
    const queryTime = timestamp || instantQueryTime.value || new Date()
    const unixTimestamp = Math.floor(queryTime.getTime() / 1000).toString()

    const response = await executePromQL(query, unixTimestamp)

    instantQueryResult.value = response.data.result
    return response.data
  }

  // Execute PromQL range query (lower-level method)
  const executeRangeQuery = async (query: string, start?: number, end?: number, step?: number) => {
    try {
      queryLoading.value = true
      currentQuery.value = query

      const startTime = start
      const endTime = end
      const stepValue = step

      const response = await executePromQLRange(
        query,
        (startTime || 0).toString(),
        (endTime || 0).toString(),
        (stepValue || 1).toString() // Convert number to string for API call
      )

      rangeQueryResult.value = response.data.result
      return response.data
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
    const stepValue = currentStep.value
    queryStep.value = stepValue
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

    return executeRangeQuery(query, start, end, stepValue)
  }

  return {
    // State
    currentQuery,
    currentTimeRange,
    queryResult,
    rangeQueryResult,
    instantQueryResult, // For table data
    queryLoading,
    instantQueryTime, // For instant query timestamp

    // Time range state
    rangeTime,
    time,

    // Previous query tracking (for partial updates)
    previousQuery,
    previousStep,

    // Computed
    unixTimeRange,
    queryStep,
    currentStep,

    // Methods
    executeQuery, // High-level reactive method
    executeInstantQuery, // For table data
    executeRangeQuery, // Low-level method
  }
}
