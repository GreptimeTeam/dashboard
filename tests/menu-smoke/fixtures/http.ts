import { dbHttpBase, smokeAuthFromEnv } from './sql'

type HttpOpts = {
  baseUrl?: string
  database?: string
}

function authHeaders(): Record<string, string> {
  const { authHeader, username, password } = smokeAuthFromEnv()
  if (authHeader) return { Authorization: authHeader }
  if (username) {
    const token = Buffer.from(`${username}:${password || ''}`).toString('base64')
    return { Authorization: `Basic ${token}` }
  }
  return {}
}

export const SMOKE_PIPELINE_YAML = `processors: []
transform:
  - fields:
      - message
    type: string
  - fields:
      - greptime_timestamp
    type: timestamp
    index: timestamp
`

export async function createPipeline(name: string, yaml: string, opts: HttpOpts = {}): Promise<void> {
  const base = opts.baseUrl || dbHttpBase()
  const db = opts.database || 'public'
  const form = new FormData()
  form.append('file', new Blob([yaml], { type: 'application/yaml' }), `${name}.yaml`)
  const res = await fetch(`${base}/v1/events/pipelines/${encodeURIComponent(name)}?db=${encodeURIComponent(db)}`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) {
    throw new Error(`createPipeline ${name}: ${res.status} ${await res.text()}`)
  }
}

export async function deletePipeline(name: string, version: string, opts: HttpOpts = {}): Promise<void> {
  const base = opts.baseUrl || dbHttpBase()
  const db = opts.database || 'public'
  const url = new URL(`${base}/v1/events/pipelines/${encodeURIComponent(name)}`)
  url.searchParams.set('db', db)
  url.searchParams.set('version', version)
  const res = await fetch(url, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok && res.status !== 404) {
    throw new Error(`deletePipeline ${name}: ${res.status} ${await res.text()}`)
  }
}

export async function dryrunPipeline(
  name: string,
  data: Record<string, unknown>,
  opts: HttpOpts = {}
): Promise<Response> {
  const base = opts.baseUrl || dbHttpBase()
  const db = opts.database || 'public'
  return fetch(
    `${base}/v1/events/pipelines/dryrun?pipeline_name=${encodeURIComponent(name)}&db=${encodeURIComponent(db)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    }
  )
}

export async function writeInfluxLine(line: string, opts: HttpOpts & { precision?: string } = {}): Promise<Response> {
  const base = opts.baseUrl || dbHttpBase()
  const db = opts.database || 'public'
  const precision = opts.precision || 'ns'
  const url = `${base}/v1/influxdb/write?db=${encodeURIComponent(db)}&precision=${precision}`
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', ...authHeaders() },
    body: line,
  })
}

export type DashboardListItem = { name: string; content?: string }

export async function listDashboards(opts: HttpOpts = {}): Promise<DashboardListItem[]> {
  const base = opts.baseUrl || dbHttpBase()
  const res = await fetch(`${base}/v1/dashboards`, { headers: authHeaders() })
  if (!res.ok) {
    throw new Error(`listDashboards: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.dashboards)) return data.dashboards
  if (Array.isArray(data?.data)) return data.data
  return []
}

export function emptyDashboardContent(name: string): string {
  return JSON.stringify({
    kind: 'Dashboard',
    metadata: { name, project: 'default', version: 0 },
    spec: {
      display: { name },
      duration: '1h',
      refreshInterval: '30s',
      variables: [],
      layouts: [],
      panels: {},
    },
  })
}

export async function createDashboard(name: string, opts: HttpOpts = {}): Promise<void> {
  const base = opts.baseUrl || dbHttpBase()
  const res = await fetch(`${base}/v1/dashboards/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ content: emptyDashboardContent(name) }),
  })
  if (!res.ok) {
    throw new Error(`createDashboard ${name}: ${res.status} ${await res.text()}`)
  }
}

export async function deleteDashboard(name: string, opts: HttpOpts = {}): Promise<void> {
  const base = opts.baseUrl || dbHttpBase()
  const res = await fetch(`${base}/v1/dashboards/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`deleteDashboard ${name}: ${res.status} ${await res.text()}`)
  }
}
