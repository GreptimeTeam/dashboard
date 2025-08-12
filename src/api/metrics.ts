import axios, { AxiosRequestConfig } from 'axios'
import { useAppStore } from '@/store'

const prometheusBaseURL = `/v1/prometheus/api/v1`

const addDatabaseParams = (database?: string) => {
  const appStore = useAppStore()
  return {
    params: {
      db: database || appStore.database,
    },
  } as AxiosRequestConfig
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
 * @param database - Optional database name, defaults to current database
 * @returns Promise with array of metric names
 */
export const getMetricNames = (database?: string) => {
  return axios.get(`${prometheusBaseURL}/label/__name__/values`, addDatabaseParams(database))
}

/**
 * Search metric names remotely using a regex-based match
 * @param regex - Regex body for metric name (without leading/trailing /)
 * @param database - Optional database name
 */
export const searchMetricNames = (regex: string, database?: string) => {
  const config = addDatabaseParams(database)
  // Prom-compatible: pass match parameter to filter by __name__ regex
  config.params = {
    ...config.params,
    match: [`{__name__=~".*${regex}.*"}`],
  }
  return axios.get(`${prometheusBaseURL}/label/__name__/values`, config)
}

/**
 * Get all label names (attributes) for metrics
 * @param match - Metric selector(s) or metric name(s). Will be normalized to match[] selectors
 * @param database - Optional database name, defaults to current database
 * @returns Promise with array of label names
 */
export const getLabelNames = (match?: string, database?: string) => {
  const config = addDatabaseParams(database)
  if (match) {
    config.params.match = [toSeriesSelector(match)]
  }
  return axios.get(`${prometheusBaseURL}/labels`, config)
}

/**
 * Get all values for a specific label
 * @param labelName - The label name to get values for
 * @param match - Metric selector(s) or metric name(s). Will be normalized to match[] selectors
 * @param database - Optional database name, defaults to current database
 * @returns Promise with array of label values
 */
export const getLabelValues = (labelName: string, match?: string, database?: string) => {
  const config = addDatabaseParams(database)
  if (match) {
    config.params.match = [toSeriesSelector(match)]
  }
  return axios.get(`${prometheusBaseURL}/label/${labelName}/values`, config)
}

/**
 * Get series for a metric selector
 * @param match - Metric selector
 * @param start - Start timestamp
 * @param end - End timestamp
 * @param database - Optional database name, defaults to current database
 * @returns Promise with series data
 */
export const getSeries = (match: string, start?: string, end?: string, database?: string) => {
  const config = addDatabaseParams(database)
  config.params = {
    ...config.params,
    match,
    ...(start && { start }),
    ...(end && { end }),
  }
  return axios.get(`${prometheusBaseURL}/series`, config)
}

/**
 * Execute a PromQL query
 * @param query - PromQL query string
 * @param time - Query time (Unix timestamp)
 * @param database - Optional database name, defaults to current database
 * @returns Promise with query results
 */
export const executePromQL = (query: string, time?: string, database?: string) => {
  const config = addDatabaseParams(database)
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
 * @param database - Optional database name, defaults to current database
 * @returns Promise with range query results
 */
export const executePromQLRange = (query: string, start: string, end: string, step: string, database?: string) => {
  const config = addDatabaseParams(database)
  config.params = {
    ...config.params,
    query,
    start,
    end,
    step,
  }
  return axios.get(`${prometheusBaseURL}/query_range`, config)
}
