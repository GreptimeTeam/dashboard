import { normalizeLogTimeBoundToMs } from './log-time-cursor'

/** Absolute unix-seconds window frozen at Search / Run. */
export type FrozenUnixRange = readonly [startSec: number, endSec: number]

/** Matches `replaceTimePlaceholders` defaults for anytime (no toolbar bound). */
export const ANYTIME_SQL_START = `'1970-01-01 00:00:00'`
export const ANYTIME_SQL_END = `now()`

/**
 * Snapshot the toolbar time selection into absolute unix seconds.
 * Relative `time` (minutes) is evaluated once against `nowSec`.
 * Returns null for “any time” (no bound) — loadMore still keysets on the cursor only.
 */
export function freezeUnixTimeRange(input: {
  time: number
  rangeTime: readonly (string | number)[]
  nowSec?: number
}): FrozenUnixRange | null {
  if (input.rangeTime.length === 2) {
    const start = Number(input.rangeTime[0])
    const end = Number(input.rangeTime[1])
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      return [start, end]
    }
    return null
  }
  if (input.time > 0) {
    const now = input.nowSec ?? Math.floor(Date.now() / 1000)
    return [now - input.time * 60, now]
  }
  return null
}

/** ISO SQL literals matching `useTimeRange` absolute `timeRangeValues`. */
export function unixRangeToIsoSqlLiterals(range: FrozenUnixRange): [string, string] {
  return [`'${new Date(range[0] * 1000).toISOString()}'`, `'${new Date(range[1] * 1000).toISOString()}'`]
}

/**
 * Opaque same-unit column bounds (ns digit strings, numeric ms, …).
 * Prefer digit-string compare so TIMESTAMP(9) stays exact.
 */
export function compareColumnTime(a: number | string, b: number | string): number {
  const as = String(a).trim()
  const bs = String(b).trim()
  if (/^\d+$/.test(as) && /^\d+$/.test(bs)) {
    if (as.length !== bs.length) return as.length - bs.length
    if (as === bs) return 0
    return as < bs ? -1 : 1
  }
  const ams = Number(a)
  const bms = Number(b)
  if (!Number.isFinite(ams) || !Number.isFinite(bms)) return NaN
  return ams - bms
}

/** Whether the keyset cursor still has room inside the frozen unix window. */
export function isCursorInsideFrozenWindow(
  cursor: unknown,
  range: FrozenUnixRange,
  direction: 'older' | 'newer'
): boolean {
  const cursorMs = normalizeLogTimeBoundToMs(cursor)
  if (!Number.isFinite(cursorMs)) return false
  const startMs = range[0] * 1000
  const endMs = range[1] * 1000
  return direction === 'older' ? cursorMs > startMs : cursorMs < endMs
}

/**
 * `$timestart` / `$timeend` pair for one keyset page.
 * - With a frozen window: stop at the edge (returns null).
 * - Anytime (`range` null): only move the cursor bound; other side uses
 *   the same defaults as `replaceTimePlaceholders` (1970 / now()).
 */
export function buildKeysetIsoSqlRange(
  range: FrozenUnixRange | null | undefined,
  cursor: unknown,
  direction: 'older' | 'newer',
  cursorLiteral: string
): [string, string] | null {
  if (range) {
    if (!isCursorInsideFrozenWindow(cursor, range, direction)) {
      return null
    }
    const [startLit, endLit] = unixRangeToIsoSqlLiterals(range)
    return direction === 'older' ? [startLit, cursorLiteral] : [cursorLiteral, endLit]
  }
  // Anytime: no lower/upper freeze — keyset against the cursor only.
  return direction === 'older' ? [ANYTIME_SQL_START, cursorLiteral] : [cursorLiteral, ANYTIME_SQL_END]
}
