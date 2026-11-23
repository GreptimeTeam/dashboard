import { describe, expect, it } from 'vitest'
import { isEmptyJsonValue, stripEmptyValues, stringifyJsonForDisplay } from './json-display'

describe('isEmptyJsonValue', () => {
  it('treats nullish, empty string, empty array and empty object as empty', () => {
    expect(isEmptyJsonValue(null)).toBe(true)
    expect(isEmptyJsonValue(undefined)).toBe(true)
    expect(isEmptyJsonValue('')).toBe(true)
    expect(isEmptyJsonValue([])).toBe(true)
    expect(isEmptyJsonValue({})).toBe(true)
    expect(isEmptyJsonValue(0)).toBe(false)
    expect(isEmptyJsonValue(false)).toBe(false)
    expect(isEmptyJsonValue('x')).toBe(false)
    expect(isEmptyJsonValue([1])).toBe(false)
    expect(isEmptyJsonValue({ a: 1 })).toBe(false)
  })
})

describe('stripEmptyValues', () => {
  it('drops null keys and keeps non-empty values', () => {
    expect(stripEmptyValues({ a: null, b: 1 })).toEqual({ b: 1 })
  })

  it('drops empty objects, arrays and strings (including nested)', () => {
    expect(
      stripEmptyValues({
        a: {},
        b: [],
        c: '',
        d: { e: null, f: {} },
        g: { h: 1 },
        i: [null, {}, '', 2],
      })
    ).toEqual({ g: { h: 1 }, i: [2] })
  })

  it('collapses objects that only contained empty children', () => {
    expect(stripEmptyValues({ a: { b: null, c: {} } })).toEqual({})
  })
})

describe('stringifyJsonForDisplay', () => {
  it('hides empty values when hideEmpty is on', () => {
    expect(stringifyJsonForDisplay({ a: null, b: {}, c: 1 }, { hideEmpty: true })).toBe('{"c":1}')
  })

  it('renders blank for whole-cell empty object or array when hideEmpty is on', () => {
    expect(stringifyJsonForDisplay({}, { hideEmpty: true })).toBe('')
    expect(stringifyJsonForDisplay([], { hideEmpty: true })).toBe('')
    expect(stringifyJsonForDisplay({ a: null, b: {} }, { hideEmpty: true })).toBe('')
    expect(stringifyJsonForDisplay('{}', { hideEmpty: true })).toBe('')
  })

  it('keeps empty values when hideEmpty is off', () => {
    expect(stringifyJsonForDisplay({ a: null, b: {} }, { hideEmpty: false })).toBe('{"a":null,"b":{}}')
    expect(stringifyJsonForDisplay({}, { hideEmpty: false })).toBe('{}')
  })
})
