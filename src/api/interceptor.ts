import axios from 'axios'
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
      return {
        ...config,
        traceTimeStart: new Date(),
      }
    }
    return config
  },
  (error) => {
    // do something
    return Promise.reject(error)
  }
)
// add response interceptors
axios.interceptors.response.use(
  (response: AxiosResponse<HttpResponse>) => {
    const isV1 = !!response.config.url?.startsWith(`/v1`)
    const { data } = response

    if (isV1) {
      if (data.code && data.code !== 0) {
        // v1 and error
        Message.error({
          content: data.error || 'Error',
          duration: 2 * 1000,
        })
        const error = {
          error: data.error,
          startTime: new Date(response.config.traceTimeStart).toLocaleTimeString(),
        }
        return Promise.reject(error || 'Error')
      }
      // v1 and success
      return {
        ...data,
        networkTime: new Date().valueOf() - response.config.traceTimeStart,
        startTime: new Date(response.config.traceTimeStart).toLocaleTimeString(),
      }
    }
    return data
  },
  (error) => {
    if (error.response.status === 401) {
      const appStore = useAppStore()
      appStore.updateSettings({ globalSettings: true })
    }
    Message.error({
      content: error.message || 'Request Error',
      duration: 2 * 1000,
    })
    return Promise.reject(error)
  }
)
