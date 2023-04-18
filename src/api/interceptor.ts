import axios from 'axios'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { Message, Modal } from '@arco-design/web-vue'

const { CancelToken } = axios
export interface HttpResponse<T = unknown> {
  error?: string
  code: number
  output?: Array<T>
  execution_time_ms?: number
}
export interface Auth {
  username: string
  password: string
}

// todo: can we use env and proxy at the same time?

axios.interceptors.request.use(
  (config: AxiosRequestConfig) => {
    const appStore = useAppStore()
    const basicAuth = `Basic ${btoa(`${appStore.username}:${appStore.password}`)}`

    if (!config.headers) {
      config.headers = {}
    }
    config.headers.authorization = basicAuth

    return {
      ...config,
      traceTimeStart: new Date(),
    }
  },
  (error) => {
    // do something
    return Promise.reject(error)
  }
)
// add response interceptors
axios.interceptors.response.use(
  (response: AxiosResponse<HttpResponse>) => {
    const res = response.data

    // if the custom code is not 0, it is judged as an error.
    if (res.code && res.code !== 0) {
      Message.error({
        content: res.error || 'Error',
        duration: 2 * 1000,
      })
      const error = {
        error: res.error,
        startTime: new Date(response.config.traceTimeStart).toLocaleTimeString(),
      }
      // todo: delete logout related code?
      // 50008: Illegal token; 50012: Other clients logged in; 50014: Token expired;
      return Promise.reject(error || 'Error')
    }
    return {
      ...res,
      networkTime: new Date().valueOf() - response.config.traceTimeStart,
      startTime: new Date(response.config.traceTimeStart).toLocaleTimeString(),
    }
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
