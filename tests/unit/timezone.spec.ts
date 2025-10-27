import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

import {
  formatTimezoneLabel,
  getDbTimezone,
  normalizeLegacyTimezone,
  normalizeTimezone,
} from '../../src/utils/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

describe('timezone utils', () => {
  const guessTimezone = 'Asia/Shanghai'
  const originalUtcOffset = dayjs.prototype.utcOffset

  beforeEach(() => {
    vi.spyOn(dayjs.tz, 'guess').mockReturnValue(guessTimezone)
    vi.spyOn(dayjs.prototype, 'utcOffset').mockImplementation(function utcOffset(
      this: dayjs.Dayjs,
      ...args: Parameters<typeof originalUtcOffset>
    ) {
      if (args.length) {
        return originalUtcOffset.apply(this, args as never)
      }
      return 330
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes keywords and invalid values', () => {
    expect(normalizeTimezone('UTC')).toBe('UTC')
    expect(normalizeTimezone('utc')).toBe('UTC')
    expect(normalizeTimezone('')).toBe('UTC')
    expect(normalizeTimezone('not/a-zone')).toBe('UTC')
  })

  it('normalizes offset strings', () => {
    expect(normalizeTimezone('+8:00')).toBe('+08:00')
    expect(normalizeTimezone('-3:30')).toBe('-03:30')
    expect(normalizeTimezone('+08:00')).toBe('+08:00')
  })

  it('normalizes IANA names with correct casing', () => {
    expect(normalizeTimezone('asia/shanghai')).toBe('Asia/Shanghai')
    expect(normalizeTimezone('America/Los_Angeles')).toBe('America/Los_Angeles')
  })

  it('normalizes legacy values', () => {
    expect(normalizeLegacyTimezone(undefined)).toBe('Asia/Shanghai')
    expect(normalizeLegacyTimezone(null)).toBe('Asia/Shanghai')
    expect(normalizeLegacyTimezone(' ')).toBe('UTC')
    expect(normalizeLegacyTimezone('+8:00')).toBe('+08:00')
    expect(normalizeLegacyTimezone('asia/shanghai')).toBe('Asia/Shanghai')
  })

  it('formats timezone labels for UI', () => {
    expect(formatTimezoneLabel('UTC')).toBe('UTC')
    expect(formatTimezoneLabel('+09:00')).toBe('+09')
    expect(formatTimezoneLabel('Asia/Shanghai')).toBe('')
  })

  it('returns db timezone', () => {
    expect(getDbTimezone('UTC')).toBe('UTC')
    expect(getDbTimezone('asia/shanghai')).toBe('Asia/Shanghai')
    expect(getDbTimezone('+8:00')).toBe('+08:00')
  })
})
