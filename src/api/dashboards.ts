import axios from 'axios'

export interface DashboardItem {
  name: string
  content?: string
  updatedAt?: string
  /** Category is stored inside dashboard JSON (`metadata.annotations`), not as a separate API field. */
  category?: 'dashboard' | 'snapshot'
}

export function listDashboards() {
  return axios.get('/v1/dashboards').then((res: any) => res?.data ?? res)
}

export function saveDashboard(name: string, payload: { content: string }) {
  return axios.post(`/v1/dashboards/${encodeURIComponent(name)}`, payload)
}

export function deleteDashboard(name: string) {
  return axios.delete(`/v1/dashboards/${encodeURIComponent(name)}`)
}
