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
  principal: string
  credential: string
}

// todo: can we use env and proxy at the same time?

axios.interceptors.request.use(
  (config: AxiosRequestConfig) => {
    const appStore = useAppStore()
    const basicAuth = `Basic ${btoa(`${appStore.principal}:${appStore.credential}`)}`
    if (!appStore.principal || !appStore.credential) {
      return {
        ...config,
        cancelToken: new CancelToken((cancel) => cancel('has no principal or credential')),
      }
    }

    if (!config.headers) {
      config.headers = {}
    }
    config.headers.authorization = basicAuth

    return {
      ...config,
      traceTimeStart: new Date().valueOf(),
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
    if (res.code !== 0) {
      Message.error({
        content: res.error || 'Error',
        duration: 1 * 1000,
      })
      // todo: delete logout related code?
      // 50008: Illegal token; 50012: Other clients logged in; 50014: Token expired;
      return Promise.reject(res || 'Error')
    }
    return {
      ...res,
      networkTime: new Date().valueOf() - response.config.traceTimeStart,
    }
  },
  (error) => {
    if (error.response.status === 401) {
      const appStore = useAppStore()
      appStore.updateSettings({ globalSettings: true })
    }
    Message.error({
      content: error.msg || 'Request Error',
      duration: 5 * 1000,
    })
    return Promise.reject(error)
  }
)
