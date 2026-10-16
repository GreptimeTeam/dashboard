import type { DrilldownContext } from '../context'
import { canonicalEntityKey } from '../semantics/model'
import type { DrilldownFilter, DrilldownFilterOp } from '../types'
import type { LogsBodyOp } from './body-search'
import resolveLogsRoles from './resolved-roles'

export type OwnedLogsFilterRole = 'body' | 'severity' | 'service'

export interface OwnedLogsFilterOptions {
  /** Saved settings merged with the runtime logs field map (`resolveLogsRoles`). */
  roles: Record<string, string>
  entityServiceKey?: string
}

export interface EffectiveLogsFilterOptions extends OwnedLogsFilterOptions {
  /** When false, return the input filters unchanged. Defaults to true. */
  enabled?: boolean
}

interface DirectLogsDetailContextShape {
  connection: { signal: { value: string } }
  ui: { logsView: { value: string }; logsTraceId?: { value?: string } }
}

function normalizedRole(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Options bag shared by topbar visibility, owned commits, and detail controls. */
export function ownedLogsFilterOptions(ctx: DrilldownContext): OwnedLogsFilterOptions {
  return {
    roles: resolveLogsRoles(ctx),
    entityServiceKey: ctx.semantics.logs.entityFilterKeys.value?.service,
  }
}

/** Semantic role owned by a direct Logs detail control; undefined for the generic topbar pool. */
export function ownedLogsDetailFilterRole(
  key: string,
  options: OwnedLogsFilterOptions
): OwnedLogsFilterRole | undefined {
  const trimmed = key.trim()
  if (!trimmed) {
    return undefined
  }

  const body = normalizedRole(options.roles.body)
  if (body && (trimmed === 'body' || trimmed === body)) {
    return 'body'
  }

  const severity = normalizedRole(options.roles.severity)
  if (severity && (trimmed === 'severity' || trimmed === severity)) {
    return 'severity'
  }

  const service = normalizedRole(options.roles.service)
  const entityServiceKey = normalizedRole(options.entityServiceKey)
  if (
    (service || entityServiceKey) &&
    (trimmed === 'service' ||
      trimmed === service ||
      trimmed === entityServiceKey ||
      canonicalEntityKey(trimmed) === 'service')
  ) {
    return 'service'
  }

  return undefined
}

/** Direct Logs detail only. A Trace→Logs overlay has no dedicated filter toolbar. */
export function isDirectLogsDetail(ctx: DirectLogsDetailContextShape): boolean {
  return (
    ctx.connection.signal.value === 'logs' && ctx.ui.logsView.value === 'detail' && !ctx.ui.logsTraceId?.value?.trim()
  )
}

function roleVariantKeys(role: OwnedLogsFilterRole, options: OwnedLogsFilterOptions): string[] {
  const target = normalizedRole(options.roles[role])
  const keys = role === 'service' ? [target, normalizedRole(options.entityServiceKey), 'service'] : [target, role]
  return [...new Set(keys.filter((key): key is string => Boolean(key)))]
}

/** Remove every shared-filter spelling of one Logs detail-owned role. */
export function removeOwnedLogsFilterVariants(
  filters: DrilldownFilter[],
  role: OwnedLogsFilterRole,
  options: OwnedLogsFilterOptions
): DrilldownFilter[] {
  return filters.filter((filter) => ownedLogsDetailFilterRole(filter.key, options) !== role)
}

/**
 * Preferred chip for an owned role (physical / entity key before semantic alias).
 * LevelFilter only represents include ops (`=` / `=~`).
 */
export function findOwnedLogsDetailFilter(
  filters: DrilldownFilter[],
  role: OwnedLogsFilterRole,
  options: OwnedLogsFilterOptions,
  isRepresentable?: (filter: DrilldownFilter) => boolean
): DrilldownFilter | undefined {
  const candidates = filters.filter(
    (filter) => ownedLogsDetailFilterRole(filter.key, options) === role && (!isRepresentable || isRepresentable(filter))
  )
  if (!candidates.length) {
    return undefined
  }

  const preferred = roleVariantKeys(role, options)
    .map((key) => candidates.find((filter) => filter.key.trim() === key))
    .find(Boolean)
  return preferred ?? candidates[0]
}

/**
 * Shared filters for a direct Logs detail query.
 *
 * Body always belongs to the detail body box. LevelFilter represents include filters on the
 * resolved severity role. The service select represents all supported filter operations.
 * Suppressed spellings remain in `ctx.query.filters` and become active again outside detail.
 */
export function effectiveLogsDetailFilters(
  filters: DrilldownFilter[],
  options: EffectiveLogsFilterOptions
): DrilldownFilter[] {
  if (options.enabled === false) {
    return [...filters]
  }

  const severity = findOwnedLogsDetailFilter(
    filters,
    'severity',
    options,
    (filter) => filter.op === '=' || filter.op === '=~'
  )
  const service = findOwnedLogsDetailFilter(filters, 'service', options)

  return filters.filter((filter) => {
    const role = ownedLogsDetailFilterRole(filter.key, options)
    if (!role) {
      return true
    }
    if (role === 'severity') {
      return filter === severity
    }
    if (role === 'service') {
      return filter === service
    }
    return false
  })
}

/** Preserve the SQL semantics shared body chips currently use for contains matching. */
export function drilldownOpToLogsBodyOp(op: DrilldownFilterOp): LogsBodyOp | undefined {
  if (op === '=~') return 'LIKE'
  if (op === '!~') return 'NOT LIKE'
  if (op === '=') return '='
  if (op === '!=') return '!='
  return undefined
}
