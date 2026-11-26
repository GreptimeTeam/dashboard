import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Dashboard timezone setting values:
 * - `''` → browser timezone
 * - `'UTC'`
 * - fixed offset `'+08:00'` / `'-05:30'`
 * - IANA name `'Asia/Shanghai'`
 */
export type TimezoneKind = 'browser' | 'utc' | 'offset' | 'iana'

export interface ResolvedTimezone {
  kind: TimezoneKind
  /** Original setting value (trimmed). */
  value: string
  /** IANA name for `browser` / `iana`. */
  iana?: string
  /** Fixed offset minutes for `utc` / `offset`. */
  offsetMinutes?: number
}

const OFFSET_REGEX = /^([+-])(\d{2}):(\d{2})$/

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function isValidIanaTimezone(tz: string): boolean {
  if (!tz) return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function parseOffsetMinutes(offset: string): number | null {
  const match = OFFSET_REGEX.exec(offset)
  if (!match) return null
  const [, sign, hh, mm] = match
  const hours = Number(hh)
  const minutes = Number(mm)
  if (hours > 14 || minutes > 59) return null
  return (sign === '-' ? -1 : 1) * (hours * 60 + minutes)
}

export function isValidTimezoneSetting(tz: string): boolean {
  const value = tz.trim()
  if (!value || value.toUpperCase() === 'UTC') return true
  if (parseOffsetMinutes(value) !== null) return true
  return isValidIanaTimezone(value)
}

export function resolveTimezone(tz: string | null | undefined): ResolvedTimezone {
  const value = (tz ?? '').trim()
  if (!value) return { kind: 'browser', value, iana: getBrowserTimezone() }
  if (value.toUpperCase() === 'UTC') return { kind: 'utc', value, offsetMinutes: 0 }
  const offsetMinutes = parseOffsetMinutes(value)
  if (offsetMinutes !== null) return { kind: 'offset', value, offsetMinutes }
  if (isValidIanaTimezone(value)) return { kind: 'iana', value, iana: value }
  return { kind: 'browser', value: '', iana: getBrowserTimezone() }
}

/** Offset in minutes from UTC at the given instant (DST-aware for IANA zones). */
export function getOffsetMinutes(tz: string | null | undefined, atMs: number = Date.now()): number {
  const resolved = resolveTimezone(tz)
  if (resolved.offsetMinutes !== undefined) return resolved.offsetMinutes
  if (resolved.kind === 'browser') return dayjs(atMs).utcOffset()
  return dayjs(atMs).tz(resolved.iana).utcOffset()
}

/** Dayjs instance whose wall-clock fields reflect the dashboard timezone. */
export function toZonedDayjs(ms: number, tz: string | null | undefined): dayjs.Dayjs {
  const resolved = resolveTimezone(tz)
  if (resolved.kind === 'browser') return dayjs(ms)
  if (resolved.offsetMinutes !== undefined) return dayjs(ms).utcOffset(resolved.offsetMinutes)
  return dayjs(ms).tz(resolved.iana)
}

/** `480` → `UTC+8`, `330` → `UTC+5:30`, `0` → `UTC`. */
export function formatOffsetLabel(offsetMinutes: number): string {
  if (offsetMinutes === 0) return 'UTC'
  const sign = offsetMinutes > 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hours = Math.floor(abs / 60)
  const minutes = abs % 60
  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`
}

/** Short label for compact UI: `UTC`, `UTC+8`, `UTC+5:30`. */
export function getTimezoneShortLabel(tz: string | null | undefined, atMs: number = Date.now()): string {
  return formatOffsetLabel(getOffsetMinutes(tz, atMs))
}

/** Descriptive label: `Asia/Shanghai (UTC+8)`, or for empty setting `Browser · Asia/Shanghai (UTC+8)`. */
export function getTimezoneFullLabel(tz: string | null | undefined, browserText = 'Browser'): string {
  const resolved = resolveTimezone(tz)
  const offset = getTimezoneShortLabel(tz)
  if (resolved.kind === 'browser') return `${browserText} · ${resolved.iana} (${offset})`
  if (resolved.kind === 'iana') return `${resolved.iana} (${offset})`
  return offset
}

/** Value for the `x-greptime-timezone` header: browser IANA name when the setting is empty. */
export function getEffectiveTimezone(tz: string | null | undefined): string {
  const resolved = resolveTimezone(tz)
  if (resolved.kind === 'browser' || resolved.kind === 'iana') return resolved.iana as string
  return resolved.value
}

/**
 * IANA name accepted by libraries that only take named zones (e.g. Perses).
 * Whole-hour offsets map to `Etc/GMT∓N` (POSIX sign is inverted); others fall back to `local`.
 */
export function toIanaTimezone(tz: string | null | undefined): string {
  const resolved = resolveTimezone(tz)
  if (resolved.kind === 'utc') return 'UTC'
  if (resolved.kind === 'iana') return resolved.iana as string
  if (resolved.kind === 'offset') {
    const minutes = resolved.offsetMinutes as number
    if (minutes % 60 !== 0) return 'local'
    const hours = minutes / 60
    if (hours === 0) return 'UTC'
    return `Etc/GMT${hours > 0 ? '-' : '+'}${Math.abs(hours)}`
  }
  return 'local'
}

let dashboardTimezone = ''

/** Kept in sync with `appStore.userTimezone` so non-component code can format times. */
export function setDashboardTimezone(tz: string | null | undefined) {
  dashboardTimezone = (tz ?? '').trim()
}

export function getDashboardTimezone(): string {
  return dashboardTimezone
}

export function formatInDashboardTz(ms: number, format = 'YYYY-MM-DD HH:mm:ss'): string {
  return toZonedDayjs(ms, dashboardTimezone).format(format)
}
