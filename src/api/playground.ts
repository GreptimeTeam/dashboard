import { importDeclaration } from '@babel/types'
import axios, { AxiosRequestConfig } from 'axios'
import qs from 'qs'

const BASE_URL = import.meta.env.VITE_API_BASE_URL
const PLAYGROUND_URL = `${BASE_URL}/playground/db`

export const getPlaygroundInfo = (dbId: string) => {
  return axios.get(PLAYGROUND_URL, {
    params: {
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

export const importPresets = (db: string, table: string, from: string) => {
  return axios.post('/v1/import-presets', {}, {
    params: {
      db,
      from,
      table,
    },
  } as AxiosRequestConfig)
}
