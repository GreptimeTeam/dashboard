import axios from 'axios'

export interface PromqlFormatRequest {
  query: string
}

export interface PromqlFormatResponse {
  status: string
  data: string
}

/**
 * Format PromQL query using the Prometheus API
 * @param query - The PromQL query string to format
 * @returns Promise<PromqlFormatResponse> - The formatted query response
 */

const prometheusBaseURL = 'v1/prometheus/api/v1'
export const formatPromqlQuery = async (query: string): Promise<PromqlFormatResponse> => {
  return axios.post(`${prometheusBaseURL}/format_query`, `query=${encodeURIComponent(query)}`, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })
}
