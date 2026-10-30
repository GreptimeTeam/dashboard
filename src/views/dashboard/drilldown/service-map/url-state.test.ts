import { describe, expect, it } from 'vitest'
import {
  parseServiceMapFilters,
  parseServiceMapSearch,
  parseServiceMapUrlQuery,
  promoteLegacyScopeFilters,
  serializeServiceMapUrlQuery,
} from './url-state'

describe('parseServiceMapSearch', () => {
  it('accepts encoded JSON, plain JSON and a legacy plain label', () => {
    expect(parseServiceMapSearch(encodeURIComponent(JSON.stringify(['checkout', 'cart'])))).toEqual([
      'checkout',
      'cart',
    ])
    expect(parseServiceMapSearch(JSON.stringify(['checkout', '']))).toEqual(['checkout'])
    expect(parseServiceMapSearch('checkout')).toEqual(['checkout'])
    expect(parseServiceMapSearch('%E0%A4%A')).toEqual(['%E0%A4%A'])
  })

  it('ignores non-string and empty values', () => {
    expect(parseServiceMapSearch(undefined)).toEqual([])
    expect(parseServiceMapSearch('')).toEqual([])
    expect(parseServiceMapSearch(['a'])).toEqual([])
  })
})

describe('parseServiceMapFilters', () => {
  it('keeps only string-array entries from encoded or plain JSON objects', () => {
    const filters = { team: ['payments'], bad: [1], also: 'x' }
    expect(parseServiceMapFilters(encodeURIComponent(JSON.stringify(filters)))).toEqual({ team: ['payments'] })
    expect(parseServiceMapFilters(JSON.stringify(filters))).toEqual({ team: ['payments'] })
  })

  it('falls back to no filters for invalid input', () => {
    expect(parseServiceMapFilters('not-json')).toEqual({})
    expect(parseServiceMapFilters(JSON.stringify(['a']))).toEqual({})
    expect(parseServiceMapFilters(undefined)).toEqual({})
  })
})

describe('promoteLegacyScopeFilters', () => {
  it('moves legacy env/scope facet filters into scopes without duplicates', () => {
    const filters = { env: ['prod'], scope: ['staging', 'prod'], team: ['edge'] }
    expect(promoteLegacyScopeFilters(['prod'], filters)).toEqual({
      scopes: ['prod', 'staging'],
      filters: { team: ['edge'] },
    })
    expect(filters).toHaveProperty('env')
  })
})

describe('service map URL round trip', () => {
  it('serializes state and parses it back', () => {
    const state = { scopes: ['prod'], filters: { team: ['payments'] } }
    const query = serializeServiceMapUrlQuery(state)
    expect(parseServiceMapUrlQuery(query)).toEqual(state)
  })

  it('omits empty selections and always clears the legacy service filter', () => {
    expect(serializeServiceMapUrlQuery({ scopes: [], filters: { team: [] } })).toEqual({
      serviceMapSearch: undefined,
      serviceMapScope: undefined,
      serviceMapFilters: undefined,
    })
  })

  it('promotes legacy env filters from the URL into scopes', () => {
    expect(
      parseServiceMapUrlQuery({
        serviceMapScope: JSON.stringify(['staging']),
        serviceMapFilters: JSON.stringify({ env: ['prod'] }),
      })
    ).toEqual({ scopes: ['staging', 'prod'], filters: {} })
  })

  it('ignores legacy serviceMapSearch on parse', () => {
    expect(
      parseServiceMapUrlQuery({
        serviceMapSearch: JSON.stringify(['checkout']),
        serviceMapScope: JSON.stringify(['prod']),
      })
    ).toEqual({ scopes: ['prod'], filters: {} })
  })
})
