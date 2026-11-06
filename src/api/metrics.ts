import axios, { AxiosRequestConfig } from 'axios'
import { useAppStore } from '@/store'
import editorAPI from '@/api/editor'

const prometheusBaseURL = `/v1/prometheus/api/v1`

/** Max metric names returned per list/search request (Prometheus label values API). */
export const METRIC_NAMES_LIMIT = 40000
/** Bounded initial window for the Metrics sidebar (typing searches remotely). */
export const METRIC_LIST_LIMIT = 500
/** Bounded window for remote metric-name searches. */
export const METRIC_SEARCH_LIMIT = 500

export interface MetricNamesOptions {
  start?: string
  end?: string
  match?: string[]
  limit?: number
  /** Override connection DB; defaults to the global app store database. */
  database?: string
}

const addDatabaseParams = (database?: string) => {
  const appStore = useAppStore()
  return {
    params: {
      db: database || appStore.database,
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
  const config = addDatabaseParams(options?.database)
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

function metricTablesWhere(database: string, search?: string): string {
  const escaped = database.replace(/'/g, "''")
  const keyword = (search || '').trim().replace(/'/g, "''")
  const searchSql = keyword ? ` and table_name like '%${keyword}%'` : ''
  return `table_schema='${escaped}' and engine='metric' and table_name <> 'greptime_physical_table'${searchSql}`
}

/**
 * Exact metric count: metric-engine tables are the Prometheus `__name__` universe.
 * One catalog count keeps the sidebar label accurate without downloading all names.
 * The internal `greptime_physical_table` is not a metric.
 */
export const getMetricNamesCount = async (database?: string, search?: string): Promise<number> => {
  const db = database || useAppStore().database
  if (!db) return 0
  const response: any = await editorAPI.runSQL(
    `select count(*) from information_schema.tables where ${metricTablesWhere(db, search)};`,
    db
  )
  return Number(response?.output?.[0]?.records?.rows?.[0]?.[0] || 0)
}

/**
 * One page of metric names, ordered by table name. The Prometheus label endpoint
 * ignores `offset`, so pagination goes through the catalog.
 */
export const getMetricNamesPage = async (options: {
  database?: string
  offset?: number
  limit?: number
  search?: string
}): Promise<string[]> => {
  const db = options.database || useAppStore().database
  if (!db) return []
  const offset = Math.max(0, options.offset ?? 0)
  const limit = Math.max(1, options.limit ?? METRIC_LIST_LIMIT)
  const response: any = await editorAPI.runSQL(
    `select table_name from information_schema.tables where ${metricTablesWhere(
      db,
      options.search
    )} order by table_name limit ${limit} offset ${offset};`,
    db
  )
  return ((response?.output?.[0]?.records?.rows || []) as string[][]).map((row) => row[0]).filter(Boolean)
}

/**
 * Search metric names remotely using a regex-based match
 * @param regex - Regex body for metric name (without leading/trailing /)
 */
export const searchMetricNames = (regex: string, database?: string, limit = METRIC_SEARCH_LIMIT) => {
  const config = addDatabaseParams(database)
  // Prom-compatible: pass match parameter to filter by __name__ regex
  config.params = {
    ...config.params,
    limit,
    match: [`{__name__=~".*${regex}.*"}`],
  }
  return axios.get(`${prometheusBaseURL}/label/__name__/values`, config)
}

export interface LabelQueryOptions {
  match?: string
  start?: string
  end?: string
  /** Override connection DB; defaults to the global app store database. */
  database?: string
}

/**
 * Get all label names (attributes) for metrics
 * @param options - Optional match selector and time range
 * @returns Promise with array of label names
 */
export const getLabelNames = (options?: LabelQueryOptions) => {
  const config = addDatabaseParams(options?.database)
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
  const config = addDatabaseParams(options?.database)
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
 * @param database - Optional DB override
 * @returns Promise with series data
 */
export const getSeries = (match: string | string[], start?: string, end?: string, database?: string) => {
  const config = addDatabaseParams(database)
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
 * @param database - Optional DB override
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
 * @param database - Optional DB override
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
