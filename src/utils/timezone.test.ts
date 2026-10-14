import { describe, expect, it } from 'vitest'
import {
  formatOffsetLabel,
  getEffectiveTimezone,
  getOffsetMinutes,
  getTimezoneShortLabel,
  isValidTimezoneSetting,
  resolveTimezone,
  toIanaTimezone,
  toZonedDayjs,
} from './timezone'

describe('timezone', () => {
  it('resolves setting kinds', () => {
    expect(resolveTimezone('').kind).toBe('browser')
    expect(resolveTimezone('utc').kind).toBe('utc')
    expect(resolveTimezone('+05:30')).toMatchObject({ kind: 'offset', offsetMinutes: 330 })
    expect(resolveTimezone('Asia/Shanghai')).toMatchObject({ kind: 'iana', iana: 'Asia/Shanghai' })
    expect(resolveTimezone('Not/AZone').kind).toBe('browser')
  })

  it('validates settings', () => {
    expect(isValidTimezoneSetting('')).toBe(true)
    expect(isValidTimezoneSetting('-09:30')).toBe(true)
    expect(isValidTimezoneSetting('Europe/Berlin')).toBe(true)
    expect(isValidTimezoneSetting('+25:00')).toBe(false)
    expect(isValidTimezoneSetting('Mars/Base')).toBe(false)
  })

  it('applies DST for IANA zones', () => {
    const winter = Date.UTC(2026, 0, 15, 12)
    const summer = Date.UTC(2026, 6, 15, 12)
    expect(getOffsetMinutes('America/New_York', winter)).toBe(-300)
    expect(getOffsetMinutes('America/New_York', summer)).toBe(-240)
    expect(toZonedDayjs(summer, 'America/New_York').format('HH:mm')).toBe('08:00')
    expect(toZonedDayjs(winter, '+05:45').format('HH:mm')).toBe('17:45')
  })

  it('builds labels', () => {
    expect(formatOffsetLabel(0)).toBe('UTC')
    expect(formatOffsetLabel(480)).toBe('UTC+8')
    expect(formatOffsetLabel(-570)).toBe('UTC-9:30')
    expect(getTimezoneShortLabel('Asia/Kolkata')).toBe('UTC+5:30')
  })

  it('maps to header and IANA values', () => {
    expect(getEffectiveTimezone('')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
    expect(getEffectiveTimezone('+08:00')).toBe('+08:00')
    expect(toIanaTimezone('+08:00')).toBe('Etc/GMT-8')
    expect(toIanaTimezone('-05:00')).toBe('Etc/GMT+5')
    expect(toIanaTimezone('+05:30')).toBe('local')
    expect(toIanaTimezone('UTC')).toBe('UTC')
  })
})
