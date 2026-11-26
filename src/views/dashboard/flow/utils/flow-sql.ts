/**
 * Prefix-only helpers for Flow DDL text.
 *
 * The Flow drawer intentionally does NOT parse DDL back into the form: GreptimeDB has no
 * structured Flow API, and re-parsing the statement in the browser would make the form a
 * second source of truth for the same clauses (editing raw text would silently drop
 * `EXPIRE AFTER` / `EVAL INTERVAL` / `EVAL OFFSET` / `COMMENT` / `WITH`).
 *
 * These helpers only rewrite the statement prologue, whose canonical shape is stable
 * (`CREATE [OR REPLACE] FLOW [IF NOT EXISTS] <name>` as produced by `SHOW CREATE FLOW`).
 * Everything after the flow name is left byte-for-byte untouched.
 */

const FLOW_DDL_PREFIX = /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FLOW\b/i

/** True when the text is a full `CREATE FLOW` statement rather than an `AS` query body. */
export const looksLikeFlowDdl = (sql: string): boolean => FLOW_DDL_PREFIX.test(sql)

/**
 * Turn a `SHOW CREATE FLOW` result into a replacing statement so saving an edit actually
 * updates the flow instead of being a no-op (`IF NOT EXISTS`) or failing.
 */
export const toReplaceFlowSql = (sql: string): string =>
  sql
    .replace(/^\s*CREATE\s+FLOW\s+IF\s+NOT\s+EXISTS\b/i, 'CREATE OR REPLACE FLOW')
    .replace(/^\s*CREATE\s+FLOW\b/i, 'CREATE OR REPLACE FLOW')

/**
 * Quote a Flow name for DDL. Flow names are identifiers, so a name containing `-`, spaces
 * or mixed case must be double-quoted (`DROP FLOW "my-flow"`), and embedded quotes doubled.
 */
export const quoteFlowIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`

/**
 * Default sink name used by the form when the user has not picked one. `SINK TO` is
 * mandatory in `CREATE FLOW`, so the form has to supply a name before the statement can
 * be valid; the server has no default of its own.
 */
export const defaultSinkName = (flowName: string): string => (flowName.trim() ? `${flowName.trim()}_sink` : '')

/**
 * A `CREATE FLOW` statement that is complete enough to belong in the Raw editor: it starts
 * like a Flow DDL and carries the mandatory `SINK TO` clause. Used for live detection while
 * the user pastes into the form, so a half-typed `CREATE FLOW` does not hijack the editor.
 */
export const looksLikeCompleteFlowDdl = (sql: string): boolean => looksLikeFlowDdl(sql) && /\bSINK\s+TO\b/i.test(sql)
