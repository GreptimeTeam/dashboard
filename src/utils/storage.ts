/**
 * Small, failure-tolerant storage helpers.
 *
 * localStorage/sessionStorage can throw (private mode, disabled cookies, quota).
 * Persistence is never worth breaking a view, so every access is guarded here.
 */

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function localStore(): KeyValueStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function sessionStore(): KeyValueStorage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } catch {
    return null
  }
}

export function readRaw(key: string, storage: KeyValueStorage | null = localStore()): string | null {
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function writeRaw(key: string, value: string, storage: KeyValueStorage | null = localStore()): void {
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {
    // ignore quota / private mode
  }
}

export function removeKey(key: string, storage: KeyValueStorage | null = localStore()): void {
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // ignore
  }
}

export function readJSON<T>(key: string, storage: KeyValueStorage | null = localStore()): T | null {
  const raw = readRaw(key, storage)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeJSON(key: string, value: unknown, storage: KeyValueStorage | null = localStore()): void {
  writeRaw(key, JSON.stringify(value), storage)
}

/**
 * Whether a stored host stamp belongs to the current connection.
 *
 * An empty stamp (legacy data, or saved before the host was inferred) is treated as
 * a wildcard so the first boot after an upgrade does not discard the preference.
 * Once both sides are known, they must match exactly.
 */
export function hostMatches(stampHost: unknown, currentHost: string): boolean {
  if (typeof stampHost !== 'string' || !stampHost) return true
  if (!currentHost) return true
  return stampHost === currentHost
}
