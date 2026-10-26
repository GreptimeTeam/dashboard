import type { ServiceMapFilters } from '@/observability/adapters/service-map/types'

/** Legacy env/scope facet keys promoted into the first-class environment control. */
const LEGACY_SCOPE_FILTER_KEYS = ['scope', 'env', 'environment', 'deployment.environment']

export interface ServiceMapUrlQuery {
  serviceMapSearch: string | undefined
  serviceMapScope: string | undefined
  serviceMapFilters: string | undefined
}

/** Try the URI-decoded value first, then the raw value; return the first candidate `parse` accepts. */
function decodeQueryParam<T>(raw: string, parse: (candidate: string) => T | null): T | null {
  const candidates = [raw]
  try {
    candidates.unshift(decodeURIComponent(raw))
  } catch {
    // Keep the raw string when it is not URI-encoded.
  }
  return candidates.map(parse).find((value) => value !== null) ?? null
}

/** Encoded JSON string array, plain JSON array, or a legacy plain label. */
export function parseServiceMapSearch(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return []
  const matched = decodeQueryParam(raw, (candidate) => {
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')) {
        return parsed.filter(Boolean)
      }
    } catch {
      // Try the next candidate / legacy plain label.
    }
    return null
  })
  return matched ?? [raw]
}

export function parseServiceMapFilters(raw: unknown): ServiceMapFilters {
  if (typeof raw !== 'string' || !raw) return {}
  const matched = decodeQueryParam(raw, (candidate) => {
    try {
      const parsed = JSON.parse(candidate)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(
          ([, values]) => Array.isArray(values) && values.every((value) => typeof value === 'string')
        ) as Array<[string, string[]]>
      )
    } catch {
      // Try the next candidate.
    }
    return null
  })
  return matched ?? {}
}

/** Move legacy env/scope facet filters into the scope selection. */
export function promoteLegacyScopeFilters(
  scopes: string[],
  filters: ServiceMapFilters
): { scopes: string[]; filters: ServiceMapFilters } {
  let nextScopes = scopes
  const nextFilters = { ...filters }
  LEGACY_SCOPE_FILTER_KEYS.forEach((key) => {
    const legacy = nextFilters[key]
    if (!legacy?.length) return
    nextScopes = [...new Set([...nextScopes, ...legacy])]
    delete nextFilters[key]
  })
  return { scopes: nextScopes, filters: nextFilters }
}

export function parseServiceMapUrlQuery(query: { [Key in keyof ServiceMapUrlQuery]?: unknown }): {
  services: string[]
  scopes: string[]
  filters: ServiceMapFilters
} {
  const promoted = promoteLegacyScopeFilters(
    parseServiceMapSearch(query.serviceMapScope),
    parseServiceMapFilters(query.serviceMapFilters)
  )
  return { services: parseServiceMapSearch(query.serviceMapSearch), ...promoted }
}

export function serializeServiceMapUrlQuery(state: {
  services: string[]
  scopes: string[]
  filters: ServiceMapFilters
}): ServiceMapUrlQuery {
  return {
    serviceMapSearch: state.services.length ? encodeURIComponent(JSON.stringify(state.services)) : undefined,
    serviceMapScope: state.scopes.length ? encodeURIComponent(JSON.stringify(state.scopes)) : undefined,
    serviceMapFilters: Object.values(state.filters).some((values) => values.length)
      ? encodeURIComponent(JSON.stringify(state.filters))
      : undefined,
  }
}
