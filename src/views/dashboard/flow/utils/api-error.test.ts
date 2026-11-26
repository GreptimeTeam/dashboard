import { describe, expect, it } from 'vitest'
import apiErrorMessage from './api-error'

describe('apiErrorMessage', () => {
  it('reads the interceptor payload', () => {
    expect(apiErrorMessage({ error: 'Flow already exists: greptime.my_flow' }, 'fallback')).toBe(
      'Flow already exists: greptime.my_flow'
    )
  })

  it('reads a real Error', () => {
    expect(apiErrorMessage(new Error('network down'), 'fallback')).toBe('network down')
  })

  it('falls back for empty or unknown shapes', () => {
    expect(apiErrorMessage({ error: '' }, 'fallback')).toBe('fallback')
    expect(apiErrorMessage(null, 'fallback')).toBe('fallback')
    expect(apiErrorMessage({ code: 1004 }, 'fallback')).toBe('fallback')
  })
})
