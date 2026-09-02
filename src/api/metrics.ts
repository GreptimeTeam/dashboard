import axios, { AxiosRequestConfig } from 'axios'
import { useAppStore } from '@/store'

const prometheusBaseURL = `/v1/prometheus/api/v1`

/** Max metric names returned per list/search request (Prometheus label values API). */
export const METRIC_NAMES_LIMIT = 40000

export interface MetricNamesOptions {
  start?: string
  end?: string
  match?: string[]
  limit?: number
}

const addDatabaseParams = () => {
  const appStore = useAppStore()
  return {
    params: {
      db: appStore.database,
    },
  } as AxiosRequestConfig
}

const isEmptyPromSelector = (selector: string): boolean => {
  const trimmed = selector.trim()
  return !trimmed || trimmed === '{}'
}

/** Normalize a match input to a Prometheus series selector */
const toSeriesSelector = (m: string): string => {
  const trimmed = (m || '').trim()
  if (!trimmed) return ''
  // If it's already a selector (starts with '{' and ends with '}'), keep as is
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed
  // If looks like a full selector expression containing '{'
  if (trimmed.includes('{') && trimmed.includes('}')) return trimmed
  // Treat as metric name
  return `{__name__="${trimmed}"}`
}

/**
 * Get all metric names
 * @returns Promise with array of metric names
 */
export const getMetricNames = (options?: MetricNamesOptions) => {
  const config = addDatabaseParams()
  const match = options?.match?.filter((selector) => !isEmptyPromSelector(selector))
  config.params = {
    ...config.params,
    limit: options?.limit ?? METRIC_NAMES_LIMIT,
    ...(options?.start && { start: options.start }),
    ...(options?.end && { end: options.end }),
    ...(match?.length && { match }),
  }
  return axios.get(`${prometheusBaseURL}/label/__name__/values`, config)
}

/**
 * Search metric names remotely using a regex-based match
 * @param regex - Regex body for metric name (without leading/trailing /)
 */
export const searchMetricNames = (regex: string) => {
  const config = addDatabaseParams()
  // Prom-compatible: pass match parameter to filter by __name__ regex
  config.params = {
    ...config.params,
    limit: METRIC_NAMES_LIMIT,
    match: [`{__name__=~".*${regex}.*"}`],
  }
  return axios.get(`${prometheusBaseURL}/label/__name__/values`, config)
}

export interface LabelQueryOptions {
  match?: string
  start?: string
  end?: string
}

/**
 * Get all label names (attributes) for metrics
 * @param options - Optional match selector and time range
 * @returns Promise with array of label names
 */
export const getLabelNames = (options?: LabelQueryOptions) => {
  const config = addDatabaseParams()
  if (options?.match) {
    config.params.match = [toSeriesSelector(options.match)]
  }
  if (options?.start) {
    config.params.start = options.start
  }
  if (options?.end) {
    config.params.end = options.end
  }
  return axios.get(`${prometheusBaseURL}/labels`, config)
}

/**
 * Get all values for a specific label
 * @param labelName - The label name to get values for
 * @param options - Match selector (required on Greptime) and optional time range
 * @returns Promise with array of label values
 */
export const getLabelValues = (labelName: string, options?: LabelQueryOptions) => {
  const config = addDatabaseParams()
  if (options?.match) {
    config.params.match = [toSeriesSelector(options.match)]
  }
  if (options?.start) {
    config.params.start = options.start
  }
  if (options?.end) {
    config.params.end = options.end
  }
  return axios.get(`${prometheusBaseURL}/label/${labelName}/values`, config)
}

/**
 * Get series for a metric selector
 * @param match - Metric selector
 * @param start - Start timestamp
 * @param end - End timestamp
 * @returns Promise with series data
 */
export const getSeries = (match: string | string[], start?: string, end?: string) => {
  const config = addDatabaseParams()
  const matchList = Array.isArray(match) ? match : [match]
  config.params = {
    ...config.params,
    match: matchList,
    ...(start && { start }),
    ...(end && { end }),
  }
  return axios.get(`${prometheusBaseURL}/series`, config)
}

/**
 * Execute a PromQL query
 * @param query - PromQL query string
 * @param time - Query time (Unix timestamp)
 * @returns Promise with query results
 */
export const executePromQL = (query: string, time?: string) => {
  const config = addDatabaseParams()
  config.params = {
    ...config.params,
    query,
    ...(time && { time }),
  }
  return axios.get(`${prometheusBaseURL}/query`, config)
}

/**
 * Execute a PromQL range query
 * @param query - PromQL query string
 * @param start - Start timestamp
 * @param end - End timestamp
 * @param step - Query step
 * @returns Promise with range query results
 */
export const executePromQLRange = (query: string, start: string, end: string, step: string) => {
  const config = addDatabaseParams()
  config.params = {
    ...config.params,
    query,
    start,
    end,
    step,
  }
  return axios.get(`${prometheusBaseURL}/query_range`, config)
}
