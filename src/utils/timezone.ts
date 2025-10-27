// pnpm exec vitest tests/unit/timezone.spec.ts

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const OFFSET_CANONICAL_REGEX = /^[+-]\d{2}:\d{2}$/
const OFFSET_INPUT_REGEX = /^([+-])(\d{1,2})(?::?(\d{2}))?$/

const pad = (value: number) => value.toString().padStart(2, '0')

const normalizeOffset = (value: string): string | null => {
  const match = OFFSET_INPUT_REGEX.exec(value)
  if (!match) return null
  const [, sign, hoursRaw, minutesRaw] = match
  const hours = Number(hoursRaw)
  const minutes = minutesRaw ? Number(minutesRaw) : 0

  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 14 || minutes >= 60 || (hours === 14 && minutes > 0)) {
    return null
  }

  return `${sign}${pad(hours)}:${pad(minutes)}`
}

// const normalizeIana = (value: string): string | null => {
//   const zone = dayjs.tz.zone(value)
//   return zone ? zone.name : null
// }
const normalizeIana = (value: string): string | null => {
  try {
    dayjs().tz(value)
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: value })
    return formatter.resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

// Will only return 'browser', 'UTC', '+08:00', 'Asia/Shanghai'
export function normalizeTimezone(raw: string): string {
  const tz = raw.trim()
  if (!tz) return 'UTC'

  const lower = tz.toLowerCase()
  if (lower === 'browser') return 'browser'
  if (lower === 'utc') return 'UTC'

  const offset = normalizeOffset(tz)
  if (offset) return offset

  const iana = normalizeIana(tz)
  if (iana) return iana

  return 'UTC'
}

export function normalizeLegacyTimezone(tz?: string | null): string {
  if (tz === undefined || tz === null) {
    return 'UTC'
  }

  const trimmed = tz.trim()
  if (!trimmed) {
    return 'UTC'
  }
  return normalizeTimezone(trimmed)
}

export function formatTimezoneLabel(tz: string): string {
  const normalized = normalizeTimezone(tz)

  if (normalized === 'browser') {
    // const offset = dayjs().format('Z')
    // return offset === '+00:00' ? 'Browser (UTC)' : `Browser (UTC${offset})`
    return ''
  }

  if (normalized === 'UTC') {
    return 'UTC'
  }

  if (OFFSET_CANONICAL_REGEX.test(normalized)) {
    return normalized === '+00:00' ? 'UTC' : `${normalized.slice(0, 3)}`
  }

  return normalized
}

export function getDbTimezone(tz: string): string {
  const normalized = normalizeTimezone(tz)
  if (normalized === 'browser') {
    // TODO
    return dayjs().format('Z')
  }
  return normalized
}
