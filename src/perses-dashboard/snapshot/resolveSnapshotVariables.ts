import type { DashboardResource } from '@perses-dev/core'

const VARIABLE_QUERY_PREFIX = 'var-'

function decodeVariableParam(value: string): string | string[] {
  if (!value.includes(',')) {
    return value
  }
  return value.split(',').filter(Boolean)
}

/**
 * Capture variable values at export time from iframe URL (`var-<name>=...`)
 * and fall back to each variable's saved default in dashboard JSON.
 */
export default function resolveSnapshotVariables(
  dashboard: DashboardResource,
  search = typeof window !== 'undefined' ? window.location.search : ''
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  const params = new URLSearchParams(search)

  params.forEach((value, key) => {
    if (!key.startsWith(VARIABLE_QUERY_PREFIX)) {
      return
    }
    const name = key.slice(VARIABLE_QUERY_PREFIX.length)
    if (!name) {
      return
    }
    result[name] = decodeVariableParam(value)
  })

  const variables = dashboard.spec?.variables ?? []
  variables.forEach((def) => {
    const { name } = def.spec
    if (result[name] !== undefined) {
      return
    }
    if (def.kind === 'TextVariable') {
      result[name] = def.spec.value
    } else if (def.kind === 'ListVariable' && def.spec.defaultValue != null) {
      result[name] = def.spec.defaultValue as string | string[]
    }
  })

  return result
}
