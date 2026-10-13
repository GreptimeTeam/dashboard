import { describe, expect, it } from 'vitest'
import isTraceErrorStatus from './status'

describe('isTraceErrorStatus', () => {
  it('matches known OTel / greptime error literals case-insensitively', () => {
    expect(isTraceErrorStatus('STATUS_CODE_ERROR')).toBe(true)
    expect(isTraceErrorStatus('status_code_error')).toBe(true)
    expect(isTraceErrorStatus('ERROR')).toBe(true)
    expect(isTraceErrorStatus('error')).toBe(true)
  })

  it('rejects unset / ok / unrelated values', () => {
    expect(isTraceErrorStatus(undefined)).toBe(false)
    expect(isTraceErrorStatus(null)).toBe(false)
    expect(isTraceErrorStatus('')).toBe(false)
    expect(isTraceErrorStatus('STATUS_CODE_OK')).toBe(false)
    expect(isTraceErrorStatus('STATUS_CODE_UNSET')).toBe(false)
    expect(isTraceErrorStatus('ok')).toBe(false)
  })
})
