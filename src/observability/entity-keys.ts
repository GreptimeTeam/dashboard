import type { DrilldownFilter } from './types'

/** Signals that share the drilldown filter state. */
export type EntitySignal = 'metrics' | 'logs' | 'traces'

/**
 * Canonical entity key → every name that means it. Used only to *recognize* that two
 * filters are the same entity (dedupe, cross-signal re-key); the physical mapping comes
 * from the table's declaration, this vocabulary does not decide it.
 */
const ENTITY_ALIASES: Record<string, string[]> = {
  service: ['service', 'job', 'service_name', 'resource_attributes.service.name'],
}

/**
 * Convention fallback: the physical keys an ingestion source writes for an entity, per
 * signal, ordered by preference. Only consulted when the table declares nothing —
 * declarations always win (see `entities.ts`).
 *
 * Taken from the open conventions, not from one deployment:
 * - OTLP metrics keep the bare `service_name`; `job` carries the namespace-qualified
 *   form (`namespace/service`), so it is the *fallback*, not the join key (measured:
 *   joining `job` against traces' `service_name` matches 0 rows);
 * - OTLP traces keep `service_name` (the greptime_trace_v1 model);
 * - OTLP logs promote flat labels when present, otherwise identity stays inside the
 *   `resource_attributes` JSON container (the chip form).
 */
const SOURCE_ENTITY_KEYS: Record<string, Partial<Record<EntitySignal, Record<string, string[]>>>> = {
  opentelemetry: {
    metrics: { service: ['service_name', 'job'] },
    traces: { service: ['service_name'] },
    logs: { service: ['service_name', 'resource_attributes.service.name'] },
  },
  prometheus: {
    metrics: { service: ['job'] },
  },
}

/**
 * With no bound table there is nothing to declare or inspect (the metrics catalog has no
 * single table). Traces/logs fall back to the entity role their field map owns; metrics
 * fall back to the widest metric convention.
 */
const UNBOUND_ENTITY_KEYS: Record<EntitySignal, Record<string, string>> = {
  // No table to inspect: `service_name` holds the bare service (same value the other
  // signals use). `job` is namespace-qualified, so it would match nothing.
  metrics: { service: 'service_name' },
  traces: { service: 'service' },
  logs: { service: 'service' },
}

export const ENTITY_FILTER_KEYS = Object.keys(ENTITY_ALIASES)

function normalizeKey(key: string): string {
  return key.trim().toLowerCase()
}

/** Canonical entity a filter key stands for, or undefined. */
export function canonicalEntityKey(key: string): string | undefined {
  const trimmed = normalizeKey(key)
  if (!trimmed) {
    return undefined
  }
  return ENTITY_FILTER_KEYS.find((entity) => ENTITY_ALIASES[entity].includes(trimmed))
}

/**
 * Convention candidates for an entity. Without `source` every known source's keys are
 * returned in source order, so callers can pick by column presence.
 */
export function conventionEntityKeys(signal: EntitySignal, entityKey: string, source?: string): string[] {
  const entity = normalizeKey(entityKey)
  const sources = source ? [normalizeKey(source)] : Object.keys(SOURCE_ENTITY_KEYS)
  const keys = sources.flatMap((name) => SOURCE_ENTITY_KEYS[name]?.[signal]?.[entity] ?? [])
  return [...new Set(keys)]
}

/** Key to use when no table is bound (metrics catalog, signal switch). */
export function unboundEntityFilterKey(signal: EntitySignal, entityKey: string): string | undefined {
  return UNBOUND_ENTITY_KEYS[signal]?.[normalizeKey(entityKey)]
}

/**
 * Rewrite entity filters into `signal`'s vocabulary so one shared filter works on all
 * three signals.
 *
 * `resolveKey` lets the caller supply a table-derived key (declaration → source
 * convention); without it the signal's unbound default is used. A physical key the
 * signal natively owns stays untouched (a metric table may carry `service_name` without
 * `job`), and alias duplicates of the same entity collapse onto one key so two labels
 * are never ANDed.
 */
export function normalizeEntityFilters(
  filters: DrilldownFilter[],
  signal: EntitySignal,
  resolveKey?: (entityKey: string) => string | undefined
): DrilldownFilter[] {
  const seen = new Map<string, number>()
  const result: DrilldownFilter[] = []

  filters.forEach((filter) => {
    const entity = canonicalEntityKey(filter.key)
    if (!entity) {
      result.push(filter)
      return
    }

    const resolved = resolveKey?.(entity)
    const preferred = resolved ?? unboundEntityFilterKey(signal, entity)
    const isCanonicalKey = normalizeKey(filter.key) === normalizeKey(entity)
    // With no table-derived answer, metrics keeps a key it already owns (a metric table
    // may carry `service_name` without `job`); traces/logs prefer their role/chip key.
    const keepNativeAlias =
      !resolved &&
      !isCanonicalKey &&
      signal === 'metrics' &&
      conventionEntityKeys(signal, entity).includes(normalizeKey(filter.key))
    const key = preferred && !keepNativeAlias ? preferred : filter.key

    // Same entity + op + value: keep one occurrence, preferring the resolved key.
    const dedupeKey = `${entity}\0${filter.op}\0${filter.value}`
    const existing = seen.get(dedupeKey)
    if (existing !== undefined) {
      if (preferred && normalizeKey(result[existing].key) !== normalizeKey(preferred)) {
        result[existing] = { ...result[existing], key: preferred }
      }
      return
    }

    seen.set(dedupeKey, result.length)
    result.push({ ...filter, key })
  })

  return result
}
