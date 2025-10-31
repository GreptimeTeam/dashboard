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

const normalizeIana = (value: string): string | null => {
  try {
    dayjs().tz(value)
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: value })
    return formatter.resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

export function normalizeTimezone(raw: string): string {
  const tz = raw.trim()
  if (!tz) return 'UTC'

  if (tz.toLowerCase() === 'utc') return 'UTC'

  const offset = normalizeOffset(tz)
  if (offset) return offset

  const iana = normalizeIana(tz)
  if (iana) return iana

  return 'UTC'
}

export function normalizeLegacyTimezone(tz?: string | null): string {
  if (tz === undefined || tz === null) {
    return dayjs.tz.guess()
  }

  const trimmed = tz.trim()
  if (!trimmed) {
    return 'UTC'
  }

  return normalizeTimezone(trimmed)
}

export function formatTimezoneLabel(tz: string): string {
  if (tz === 'UTC') {
    return 'UTC'
  }

  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const browserOffset = dayjs().format('Z')

  if (tz === browserZone) {
    return ''
  }

  if (OFFSET_CANONICAL_REGEX.test(tz)) {
    if (tz === browserOffset) {
      return ''
    }
    return tz === '+00:00' ? 'UTC' : `${tz.slice(0, 3)}`
  }

  return tz
}

export function getDbTimezone(tz: string): string {
  return normalizeTimezone(tz)
}
