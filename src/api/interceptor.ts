import axios from 'axios'
import JSONbigint from 'json-bigint'

import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { Message } from '@arco-design/web-vue'
import { RecordsType } from '@/store/modules/code-run/types'

export interface OutputType {
  affectedrows: number
  records: RecordsType
}
export interface HttpResponse<T = unknown> {
  error?: string
  code: number
  output: Array<OutputType>
  execution_time_ms?: number
}
export interface Auth {
  username: string
  password: string
}

// todo: can we use env and proxy at the same time?
export const TableNameReg = /(?<=from|FROM)\s+([^\s;]+)/i
const V1_PREFIX = '/v1'
const V1_INFLUX_PREFIX = '/v1/influxdb'
/**
 * Parse table reference from SQL after FROM. Returns the raw table reference as-is (e.g. "temp_data"."cpu_metrics"), no conversion.
 */
function parseTableFromSql(sql: string): string {
  try {
    sql = decodeURIComponent(sql)
    const result = sql.match(TableNameReg)
    if (!result?.[1]) return ''
    return result[1].trim()
  } catch {
    return ''
  }
}
export function parseTable(sql: string) {
  return parseTableFromSql(sql)
}

const isV1Request = (url?: string) => !!url?.startsWith(V1_PREFIX)
const isInfluxRequest = (url?: string) => !!url?.startsWith(V1_INFLUX_PREFIX)

const getStartTimestamp = (value?: Date | number) => {
  if (!value) return undefined
  const start = new Date(value).valueOf()
  return Number.isNaN(start) ? undefined : start
}

const formatStartTime = (value?: Date | number) => {
  const start = getStartTimestamp(value)
  return start ? new Date(start).toLocaleTimeString() : new Date().toLocaleTimeString()
}

const getTraceTiming = (value?: Date | number) => {
  const start = getStartTimestamp(value)
  const now = Date.now()
  return {
    networkTime: start ? now - start : 0,
    startTime: formatStartTime(value),
  }
}

const shouldNotifyError = (config?: AxiosRequestConfig) => {
  if (isInfluxRequest(config?.url)) return false
  return !config?.suppressErrorToast
}

const showErrorMessage = (content: string) => {
  Message.error({
    content,
    duration: 3 * 1000,
    closable: true,
    resetOnHover: true,
  })
}

const parseV1Data = (payload: unknown) => {
  if (typeof payload !== 'string') return payload
  return JSONbigint({ storeAsString: true }).parse(payload)
}

const buildErrorPayload = (errorMessage: string, traceTimeStart?: Date | number) => {
  return {
    error: errorMessage,
    startTime: formatStartTime(traceTimeStart),
  }
}

const handleV1Response = (response: AxiosResponse) => {
  const isInflux = isInfluxRequest(response.config.url)

  if (isInflux) {
    if (response.status === 204) {
      return getTraceTiming(response.config.traceTimeStart)
    }
    const message = response.data?.error || 'Error'
    return Promise.reject(buildErrorPayload(message, response.config.traceTimeStart))
  }

  if (response.config.params?.format?.includes('csv')) {
    return response.data || []
  }

  const data = parseV1Data(response.data) as HttpResponse
  if (data.code && data.code !== 0) {
    const message = data.error || 'Error'
    if (shouldNotifyError(response.config)) {
      showErrorMessage(message)
    }
    return Promise.reject(buildErrorPayload(message, response.config.traceTimeStart))
  }

  return {
    ...data,
    ...getTraceTiming(response.config.traceTimeStart),
  }
}

const parseV1ErrorData = (rawData: unknown) => {
  if (typeof rawData !== 'string') return rawData
  try {
    return JSON.parse(rawData)
  } catch {
    return rawData
  }
}

axios.interceptors.request.use(
  (config: AxiosRequestConfig) => {
    const isV1 = isV1Request(config.url)
    const appStore = useAppStore()

    if (!config.headers) {
      config.headers = {}
    }

    if (appStore.username || appStore.password) {
      const basicAuth = `Basic ${btoa(`${appStore.username}:${appStore.password}`)}`
      const authHeader = appStore.authHeader || 'Authorization'
      config.headers[authHeader] = basicAuth
    }

    if (isV1) {
      // Use userTimezone directly (or empty string, which GreptimeDB will interpret appropriately)
      if (appStore.userTimezone) {
        config.headers['x-greptime-timezone'] = appStore.userTimezone
      }
      config.transformResponse = [(data) => data]
      return {
        ...config,
        traceTimeStart: new Date(),
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

axios.interceptors.response.use(
  (response: AxiosResponse) => {
    if (isV1Request(response.config.url)) return handleV1Response(response)
    return response.data
  },

  (error) => {
    const response = error?.response
    const config = error?.config

    if (response?.status === 401) {
      const appStore = useAppStore()
      appStore.openGlobalSettings()
    }

    if (!response) {
      const message = error?.message || 'Request Error'
      if (shouldNotifyError(config)) showErrorMessage(message)
      return Promise.reject(buildErrorPayload(message, config?.traceTimeStart))
    }

    if (isV1Request(config?.url)) {
      response.data = parseV1ErrorData(response.data)
    }

    const data = response.data || {}
    const message = data.error || error.message || 'Request Error'

    if (shouldNotifyError(config)) {
      showErrorMessage(message)
    }

    return Promise.reject(buildErrorPayload(message, response.config?.traceTimeStart))
  }
)
