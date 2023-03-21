import { importDeclaration } from '@babel/types'
import axios, { AxiosRequestConfig } from 'axios'
import qs from 'qs'

export const getPlayground = (dbId: string) => {
  const url = 'https://api-preview.greptime.cloud/playground/db'
  return axios.get(url, {
    params: {
      db_id: dbId,
    },
  } as AxiosRequestConfig)
}

export const postPlayground = (token: string) => {
  const url = 'https://api-preview.greptime.cloud/playground/db'
  return axios.post(url, {}, {
    params: {
      token,
    },
  } as AxiosRequestConfig)
}
