import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

import {
  getDbTimezone,
  normalizeLegacyTimezone,
  normalizeTimezone,
  formatTimezoneLabel,
} from '../../src/utils/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

describe('timezone utils', () => {
  const browserOffset = '+05:30'
  const originalFormat = dayjs.prototype.format
  const originalUtcOffset = dayjs.prototype.utcOffset

  beforeEach(() => {
    vi.spyOn(dayjs.prototype, 'format').mockImplementation(function format(this: dayjs.Dayjs, token: string) {
      if (token === 'Z') {
        return browserOffset
      }
      return originalFormat.call(this, token)
    })

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

  it('normalizes browser/utc keywords', () => {
    expect(normalizeTimezone('browser')).toBe('browser')
    expect(normalizeTimezone('Browser')).toBe('browser')
    expect(normalizeTimezone('UTC')).toBe('UTC')
    expect(normalizeTimezone('utc')).toBe('UTC')
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

  it('fallbacks to UTC on invalid inputs', () => {
    expect(normalizeTimezone('not/a-zone')).toBe('UTC')
    expect(normalizeTimezone('+25:00')).toBe('UTC')
    expect(normalizeTimezone('')).toBe('UTC')
  })

  it('normalizes legacy values', () => {
    expect(normalizeLegacyTimezone(undefined)).toBe('UTC')
    expect(normalizeLegacyTimezone(null)).toBe('UTC')
    expect(normalizeLegacyTimezone('  ')).toBe('UTC')
    expect(normalizeLegacyTimezone('+8:00')).toBe('+08:00')
    expect(normalizeLegacyTimezone('asia/shanghai')).toBe('Asia/Shanghai')
  })

  it('formats timezone labels for UI', () => {
    expect(formatTimezoneLabel('browser')).toBe('')
    expect(formatTimezoneLabel('UTC')).toBe('UTC')
    expect(formatTimezoneLabel('+08:00')).toBe('+08')
    expect(formatTimezoneLabel('Asia/Shanghai')).toBe('Asia/Shanghai')
  })

  it('returns db timezone', () => {
    expect(getDbTimezone('browser')).toBe(browserOffset)
    expect(getDbTimezone('UTC')).toBe('UTC')
    expect(getDbTimezone('asia/shanghai')).toBe('Asia/Shanghai')
    expect(getDbTimezone('+8:00')).toBe('+08:00')
  })
})
