import axios from 'axios'
import JSONbigint from 'json-bigint'

import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { Message, Modal } from '@arco-design/web-vue'
import { RecordsType } from '@/store/modules/code-run/types'

const { CancelToken } = axios

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
export const TableNameReg = /(?<=from|FROM)\s+([^\s;]+)/
export function parseTable(sql: string) {
  const result = sql.match(TableNameReg)
  if (result && result.length) {
    const arr = result[1].trim().split('.')
    return arr[arr.length - 1]
  }
  return ''
}

axios.interceptors.request.use(
  (config: AxiosRequestConfig) => {
    const isV1 = !!config.url?.startsWith(`/v1`)
    const appStore = useAppStore()
    const basicAuth = `Basic ${btoa(`${appStore.username}:${appStore.password}`)}`

    if (!config.headers) {
      config.headers = {}
    }
    config.headers.authorization = basicAuth

    if (isV1) {
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
const ignoreList = ['pipelines']

axios.interceptors.response.use(
  (response: AxiosResponse) => {
    const isV1 = !!response.config.url?.startsWith(`/v1`)
    const isInflux = !!response.config.url?.startsWith(`/v1/influxdb`)
    if (isInflux) {
      if (response.status === 204) {
        return {
          networkTime: new Date().valueOf() - response.config.traceTimeStart,
          startTime: new Date(response.config.traceTimeStart).toLocaleTimeString(),
        }
      }
      const errorResponse = {
        error: response.data.error || 'Error',
        startTime: new Date(response.config.traceTimeStart).toLocaleTimeString(),
      }
      return Promise.reject(errorResponse)
    }
    if (isV1) {
      if (response.config.params && response.config.params.format === 'csv') {
        return response.data
      }
      response.data = JSONbigint({ storeAsString: true }).parse(response.data)
      const { data } = response
      if (data.code && data.code !== 0) {
        // v1 and error
        const tableName = parseTable(decodeURIComponent(response.config.data))
        if (ignoreList.indexOf(tableName) === -1) {
          Message.error({
            content: data.error || 'Error',
            duration: 3 * 1000,
            closable: true,
            resetOnHover: true,
          })
        }
        const error = {
          error: data.error || 'Error',
          startTime: new Date(response.config.traceTimeStart).toLocaleTimeString(),
        }
        return Promise.reject(error)
      }
      // v1 and success
      return {
        ...data,
        networkTime: new Date().valueOf() - response.config.traceTimeStart,
        startTime: new Date(response.config.traceTimeStart).toLocaleTimeString(),
      }
    }
    const { data } = response
    return data
  },

  (error) => {
    if (error.response.status === 401) {
      const appStore = useAppStore()
      appStore.updateSettings({ globalSettings: true })
    }
    const data = JSON.parse(error.response.data)
    const isInflux = !!error.config.url?.startsWith(`/v1/influxdb`)
    const tableName = parseTable(decodeURIComponent(error.response.config.data))
    if (!isInflux && ignoreList.indexOf(tableName) === -1) {
      Message.error({
        content: data.error || 'Request Error',
        duration: 3 * 1000,
        closable: true,
        resetOnHover: true,
      })
    }
    const errorResponse = {
      error: data.error || error.message || 'Request Error',
      startTime: new Date(error.response.config.traceTimeStart).toLocaleTimeString(),
    }
    return Promise.reject(errorResponse)
  }
)
