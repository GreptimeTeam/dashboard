import axios from 'axios'

/* eslint-disable import/prefer-default-export */
export const getGist = (gistId: string) => {
  return axios.get(`https://api.github.com/gists/${gistId}`)
}
