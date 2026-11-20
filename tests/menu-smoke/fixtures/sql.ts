/** HTTP client for GreptimeDB `/v1/sql` (used by global setup/teardown). */

export type SqlClientOptions = {
  baseUrl: string
  database?: string
  username?: string
  password?: string
  authHeader?: string
}

export function dbHttpBase(): string {
  return (process.env.SMOKE_DB_HTTP || 'http://127.0.0.1:4000').replace(/\/$/, '')
}

function authHeaders(opts: SqlClientOptions): Record<string, string> {
  if (opts.authHeader) {
    return { Authorization: opts.authHeader }
  }
  if (opts.username) {
    const token = Buffer.from(`${opts.username}:${opts.password || ''}`).toString('base64')
    return { Authorization: `Basic ${token}` }
  }
  return {}
}

export async function runSql(sql: string, opts: SqlClientOptions = { baseUrl: dbHttpBase() }): Promise<unknown> {
  const url = new URL('/v1/sql', opts.baseUrl)
  if (opts.database) {
    url.searchParams.set('db', opts.database)
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...authHeaders(opts),
    },
    body: new URLSearchParams({ sql }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`SQL ${res.status}: ${text.slice(0, 500)}\n---\n${sql}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function smokeAuthFromEnv(): Pick<SqlClientOptions, 'username' | 'password' | 'authHeader'> {
  return {
    username: process.env.SMOKE_DB_USER || '',
    password: process.env.SMOKE_DB_PASSWORD || '',
    authHeader: process.env.SMOKE_DB_AUTH_HEADER || '',
  }
}
