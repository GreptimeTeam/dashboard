/* eslint-disable no-shadow */
import { AxiosRequestConfig } from 'axios'

declare module 'axios' {
  export interface AxiosRequestConfig<D = any> {
    traceTimeStart?: number
  }
}
