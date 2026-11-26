/**
 * Safety rails for the e2e suite.
 *
 * Everything here is evaluated **before the first SQL statement**, so a typo in an environment
 * variable can never reach a `DROP DATABASE`, a write against the wrong database, or a remote
 * instance that someone forgot they pointed at.
 *
 * Rules:
 *  - the writable database name must be obviously test-owned (it contains an `e2e` segment) and
 *    must not be one of GreptimeDB's reserved databases — `ensureSeed` drops and rebuilds it;
 *  - identifiers coming from the environment are validated before they are interpolated into SQL;
 *  - the read-only database only accepts read statements;
 *  - a non-loopback GreptimeDB requires an explicit `E2E_REMOTE=1`.
 */

/** Never acceptable as the *writable* e2e database, whatever the environment says. */
const RESERVED_DATABASES = new Set([
  'public',
  'information_schema',
  'greptime_private',
  'greptime_public',
  'greptime_catalog',
  'system',
])

/**
 * Validates the database the suite is allowed to drop and rebuild.
 *
 * Deliberately strict: `E2E_DB=public pnpm e2e` must fail before any SQL is sent.
 */
export function writableDatabase(name: string): string {
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(name)) {
    throw new Error(
      `[e2e] Refusing E2E_DB="${name}": expected a lowercase identifier like "dashboard_e2e".\n` +
        '      This database is dropped and re-created on every dataset change.'
    )
  }
  if (RESERVED_DATABASES.has(name)) {
    throw new Error(
      `[e2e] Refusing E2E_DB="${name}": it is a GreptimeDB system database.\n` +
        '      The e2e suite drops and re-creates E2E_DB, so point it at a dedicated database.'
    )
  }
  if (!/(^|_)e2e(_|$)/.test(name)) {
    throw new Error(
      `[e2e] Refusing E2E_DB="${name}": the name must contain an "e2e" segment (e.g. dashboard_e2e).\n` +
        '      This database is dropped and re-created on every dataset change.'
    )
  }
  return name
}

/**
 * Validates a database / table / flow / pipeline name that is interpolated into SQL.
 * Quotes are handled by the callers; this only rejects values that are clearly not identifiers.
 */
export function assertIdentifier(kind: string, value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) {
    throw new Error(`[e2e] Invalid ${kind}="${value}": expected a bare SQL identifier (letters, digits, underscore).`)
  }
  return value
}

const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i

/**
 * Writes and drops are only safe against a local GreptimeDB. A remote host must be opted into
 * explicitly, so `E2E_DB_HTTP` / `SMOKE_DB_HTTP` copied from another setup cannot silently
 * target a shared or production instance.
 */
export function assertLocalOrExplicit(url: string): string {
  if (LOOPBACK.test(url) || process.env.E2E_REMOTE === '1') return url
  throw new Error(
    `[e2e] ${url} is not a loopback GreptimeDB.\n` +
      '      The suite seeds and drops data; set E2E_REMOTE=1 only if you really mean to use a remote instance.'
  )
}

const READ_ONLY_STATEMENT = /^\s*(select|show|describe|desc|explain|with)\b/i

/**
 * Guard for queries against the read-only database (`EXPLORE_DB`, default `public`).
 * A tripwire, not a sandbox: it stops a stray INSERT/DDL from reaching data the suite does not own.
 */
export function assertReadOnly(statement: string): void {
  if (READ_ONLY_STATEMENT.test(statement)) return
  throw new Error(
    `[e2e] Refusing to run a non-read statement against the read-only database:\n      ${statement
      .trim()
      .slice(0, 200)}`
  )
}
