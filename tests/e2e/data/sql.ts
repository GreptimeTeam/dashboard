/** HTTP client for GreptimeDB `/v1/sql` (global setup, seeding and read-back assertions). */
import { assertLocalOrExplicit, assertReadOnly } from '../guard'

export type SqlClientOptions = {
  baseUrl: string
  database?: string
  username?: string
  password?: string
  authHeader?: string
}

/** `E2E_DB_*` wins; the `SMOKE_DB_*` names stay accepted so existing CI / shell setups keep working. */
const env = (name: string): string => process.env[`E2E_DB_${name}`] || process.env[`SMOKE_DB_${name}`] || ''

export function dbHttpBase(): string {
  // Loopback unless the run explicitly opted into a remote instance (the suite seeds and drops data).
  return assertLocalOrExplicit((env('HTTP') || 'http://127.0.0.1:4000').replace(/\/$/, ''))
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

export function authFromEnv(): Pick<SqlClientOptions, 'username' | 'password' | 'authHeader'> {
  return {
    username: env('USER'),
    password: env('PASSWORD'),
    authHeader: env('AUTH_HEADER'),
  }
}

/**
 * Rows of the first statement's result set, or `[]` when it returned none.
 *
 * Used for read-backs against both databases, including the read-only `EXPLORE_DB` — hence the
 * read-only guard: writes must go through `runSql` explicitly, never through this helper.
 */
export async function queryRows(sql: string, database: string): Promise<unknown[][]> {
  assertReadOnly(sql)
  const result: any = await runSql(sql, { baseUrl: dbHttpBase(), database, ...authFromEnv() })
  return result?.output?.[0]?.records?.rows ?? []
}
