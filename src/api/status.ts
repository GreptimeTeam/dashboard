import axios from 'axios'

const statusUrl = `/status`

/* eslint-disable import/prefer-default-export */
export const getStatus = () => {
    return axios.get(statusUrl)
}
