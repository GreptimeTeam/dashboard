import { importDeclaration } from '@babel/types'
import axios, { AxiosRequestConfig } from 'axios'
import qs from 'qs'

const BASE_URL = import.meta.env.VITE_API_BASE_URL
const PLAYGROUND_URL = `${BASE_URL}/playground/db`

export const getPlaygroundInfo = (token: string, dbId: string) => {
  return axios.get(PLAYGROUND_URL, {
    params: {
      token,
      db_id: dbId,
    },
  } as AxiosRequestConfig)
}

export const createPlayground = (token: string) => {
  return axios.post(PLAYGROUND_URL, {}, {
    params: {
      token,
    },
  } as AxiosRequestConfig)
}
