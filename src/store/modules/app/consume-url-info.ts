function readParam(query: string, key: string): string | null {
  return new URLSearchParams(query).get(key)
}

/** Remove a single query param without re-encoding the rest of the string. */
function stripParam(query: string, key: string): string {
  if (!query) return ''
  return query
    .split('&')
    .filter((pair) => {
      if (!pair) return false
      const name = pair.split('=')[0] ?? ''
      try {
        return decodeURIComponent(name.replace(/\+/g, ' ')) !== key
      } catch {
        return name !== key
      }
    })
    .join('&')
}

/**
 * Read and strip the `info` query param used to inject connection config.
 * Supports both pre-hash search (`/?info=...#/route`) and hash query
 * (`#/route?info=...`), matching vue-router hash history usage.
 */
export function consumeUrlInfo(
  pathname: string,
  search: string,
  hash: string
): { info: string | null; nextUrl: string } {
  const searchRaw = search.startsWith('?') ? search.slice(1) : search
  const hashQueryIndex = hash.indexOf('?')
  const hashPath = hashQueryIndex >= 0 ? hash.slice(0, hashQueryIndex) : hash
  const hashRaw = hashQueryIndex >= 0 ? hash.slice(hashQueryIndex + 1) : ''

  const info = readParam(searchRaw, 'info') ?? readParam(hashRaw, 'info')
  if (!info) {
    return { info: null, nextUrl: `${pathname}${search}${hash}` }
  }

  const nextSearchRaw = stripParam(searchRaw, 'info')
  const nextHashRaw = stripParam(hashRaw, 'info')
  const nextHash = nextHashRaw ? `${hashPath}?${nextHashRaw}` : hashPath

  return {
    info,
    nextUrl: `${pathname}${nextSearchRaw ? `?${nextSearchRaw}` : ''}${nextHash}`,
  }
}

/** Auth fields that live-demo runtime inject owns; strip from URL `info` when present. */
export const URL_INFO_AUTH_KEYS = ['username', 'password', 'authHeader'] as const

export function omitAuthFromConfig<T extends Record<string, unknown>>(config: T): T {
  const next = { ...config }
  URL_INFO_AUTH_KEYS.forEach((key) => {
    delete next[key]
  })
  return next
}

export function applyUrlInfoToConfig<T extends Record<string, unknown>>(
  config: T,
  info: string,
  options?: { omitAuth?: boolean }
): T {
  try {
    const urlConfig = JSON.parse(atob(info))
    if (!urlConfig || typeof urlConfig !== 'object' || Array.isArray(urlConfig)) {
      return config
    }
    const merged = options?.omitAuth ? omitAuthFromConfig(urlConfig as Record<string, unknown>) : urlConfig
    return { ...config, ...merged }
  } catch {
    return config
  }
}
