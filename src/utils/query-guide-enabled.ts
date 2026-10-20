/**
 * Query guide is opt-in via URL and persisted in localStorage.
 * Universal build: play links use `?query_guide=1` once; preference sticks.
 * Self-hosted users never open that URL → feature stays off.
 *
 * - `?query_guide=1` (or `true`) → enable + save
 * - `?query_guide=0` (or `false`) → disable + clear
 * - no param → use saved preference (default: off)
 *
 * Works with hash router (`/#/path?query_guide=1`) and normal search.
 */

export const QUERY_GUIDE_STORAGE_KEY = 'greptime-dashboard.query-guide.enabled'
export const QUERY_GUIDE_URL_PARAM = 'query_guide'

function readStoredEnabled(): boolean {
  try {
    return localStorage.getItem(QUERY_GUIDE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeStoredEnabled(enabled: boolean) {
  try {
    if (enabled) {
      localStorage.setItem(QUERY_GUIDE_STORAGE_KEY, '1')
    } else {
      localStorage.removeItem(QUERY_GUIDE_STORAGE_KEY)
    }
  } catch {
    // ignore quota / private mode
  }
}

/** Collect search strings from both `?…` and `/#/…?…` (hash history). */
function candidateSearches(search: string, hash: string): string[] {
  const out: string[] = []
  if (search) out.push(search.startsWith('?') ? search : `?${search}`)
  const qi = hash.indexOf('?')
  if (qi >= 0) out.push(hash.slice(qi))
  return out
}

function readFlagFromSearch(search: string): boolean | null {
  const raw = new URLSearchParams(search).get(QUERY_GUIDE_URL_PARAM)
  if (raw === null) return null
  if (raw === '1' || raw === 'true') return true
  if (raw === '0' || raw === 'false') return false
  return null
}

/** Apply `query_guide` from the current URL into localStorage (idempotent). */
export function syncQueryGuideFlagFromUrl(
  search = typeof window !== 'undefined' ? window.location.search : '',
  hash = typeof window !== 'undefined' ? window.location.hash : ''
): void {
  if (typeof window === 'undefined') return
  const flag = candidateSearches(search, hash)
    .map((candidate) => readFlagFromSearch(candidate))
    .find((value) => value !== null)
  if (flag === undefined) return
  writeStoredEnabled(flag)
}

export function isQueryGuideEnabled(): boolean {
  if (typeof window === 'undefined') return false
  syncQueryGuideFlagFromUrl()
  return readStoredEnabled()
}

export default isQueryGuideEnabled
