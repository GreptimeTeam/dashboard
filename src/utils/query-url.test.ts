import { describe, expect, it } from 'vitest'
import { decodeMaybeEncoded } from './query-url'

describe('decodeMaybeEncoded', () => {
  it('decodes single-encoded payloads', () => {
    expect(decodeMaybeEncoded(encodeURIComponent('SELECT 1\nFROM t'))).toBe('SELECT 1\nFROM t')
  })

  it('returns plain payloads untouched', () => {
    expect(decodeMaybeEncoded('SELECT 1')).toBe('SELECT 1')
  })

  it('does not throw on broken encodings', () => {
    expect(decodeMaybeEncoded('100%')).toBe('100%')
  })
})
