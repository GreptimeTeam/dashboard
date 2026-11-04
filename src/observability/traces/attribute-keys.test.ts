import { describe, it, expect } from 'vitest'
import {
  attributeChipKey,
  attributeContainersOf,
  attributeLabelOf,
  attributeScopeOf,
  attributeTypeOf,
  discoverSampledAttributes,
  rememberAttributeTypes,
} from './attribute-keys'

describe('trace attribute keys (JSON2 models)', () => {
  it('maps containers to scopes and labels', () => {
    expect(attributeScopeOf('resource_attributes')).toBe('resource')
    expect(attributeScopeOf('span_attributes')).toBe('span')
    expect(attributeScopeOf('scope_attributes')).toBe('span')
    expect(attributeLabelOf('resource_attributes', 'service.version')).toBe('resource.service.version')
    expect(attributeLabelOf('span_attributes', 'http.request.method')).toBe('span.http.request.method')
    expect(attributeChipKey('span_attributes', 'http.request.method')).toBe('span_attributes.http.request.method')
  })

  it('lists the containers a table actually has', () => {
    expect(attributeContainersOf(['timestamp', 'span_attributes', 'resource_attributes'])).toEqual([
      'span_attributes',
      'resource_attributes',
    ])
    // v1 tables flatten attributes into columns and carry none of the containers.
    expect(attributeContainersOf(['timestamp', 'span_attributes.http.method'])).toEqual([])
  })

  it('dedupes keys across sampled rows and sorts them', () => {
    const attrs = discoverSampledAttributes(
      ['span_attributes', 'resource_attributes'],
      [
        { span_attributes: { 'http.method': 'GET', 'user.id': 1 }, resource_attributes: { 'service.name': 'a' } },
        { span_attributes: { 'user.id': 2, 'db.system': 'postgres' }, resource_attributes: { 'host.name': 'h' } },
      ]
    )

    expect(attrs.map((attr) => attr.column)).toEqual([
      'span_attributes.db.system',
      'span_attributes.http.method',
      'span_attributes.user.id',
      'resource_attributes.host.name',
      'resource_attributes.service.name',
    ])
    expect(attrs.every((attr) => attr.sampled)).toBe(true)
    expect(attrs.find((attr) => attr.column === 'resource_attributes.service.name')).toMatchObject({
      label: 'resource.service.name',
      scope: 'resource',
    })
  })

  it('skips keys whose sampled values are always objects or arrays', () => {
    const attrs = discoverSampledAttributes(
      ['span_attributes'],
      [
        { span_attributes: { 'http.request.header': { accept: 'json' }, 'flags': ['a'], 'http.method': 'GET' } },
        { span_attributes: { 'http.request.header': { accept: 'html' }, 'http.method': 'POST' } },
      ]
    )
    expect(attrs.map((attr) => attr.column)).toEqual(['span_attributes.http.method'])
  })

  it('keeps a key that shows a scalar value in any sampled row', () => {
    const attrs = discoverSampledAttributes(
      ['span_attributes'],
      [{ span_attributes: { payload: { nested: true } } }, { span_attributes: { payload: 'text' } }]
    )
    expect(attrs.map((attr) => attr.column)).toEqual(['span_attributes.payload'])
  })

  it('infers attribute types so numeric keys can offer comparison operators', () => {
    const attrs = discoverSampledAttributes(
      ['span_attributes'],
      [
        { span_attributes: { rows: 1, ratio: 0.5, cached: true, name: 'a', empty: null } },
        { span_attributes: { rows: 2, ratio: 1.25, cached: false, name: 'b', empty: null } },
        { span_attributes: { mixed: 1 } },
        { span_attributes: { mixed: 'one' } },
        // Wire type is inconsistent between instrumentations: "200" and 200 mean the same.
        { span_attributes: { textStatus: '200', textFlag: 'true' } },
        { span_attributes: { textStatus: 503, textFlag: false } },
      ]
    )
    const typeOf = (key: string) => attrs.find((attr) => attr.column === `span_attributes.${key}`)?.dataType
    expect(typeOf('rows')).toBe('BIGINT')
    expect(typeOf('ratio')).toBe('DOUBLE')
    expect(typeOf('cached')).toBe('BOOLEAN')
    expect(typeOf('name')).toBe('STRING')
    // Mixed scalars are not safe to cast.
    expect(typeOf('mixed')).toBe('STRING')
    // Numeric/boolean text casts the same as the native JSON type.
    expect(typeOf('textStatus')).toBe('BIGINT')
    expect(typeOf('textFlag')).toBe('BOOLEAN')
    // Nothing but nulls: no type to offer.
    expect(typeOf('empty')).toBeUndefined()
  })

  it('remembers sampled types per table for the operator menu', () => {
    rememberAttributeTypes('public', 'traces_a', [
      { column: 'span_attributes.response_size', label: 'span.response_size', scope: 'span', dataType: 'BIGINT' },
      { column: 'span_attributes.http.method', label: 'span.http.method', scope: 'span', dataType: 'STRING' },
    ])
    expect(attributeTypeOf('public', 'traces_a', 'span_attributes.response_size')).toBe('BIGINT')
    expect(attributeTypeOf('public', 'traces_a', 'span_attributes.http.method')).toBe('STRING')
    // Other tables and other databases must not see it.
    expect(attributeTypeOf('public', 'traces_b', 'span_attributes.response_size')).toBeUndefined()
    expect(attributeTypeOf('other', 'traces_a', 'span_attributes.response_size')).toBeUndefined()
  })

  it('ignores null containers, arrays and scalar values', () => {
    const attrs = discoverSampledAttributes(
      ['span_attributes'],
      [{ span_attributes: null }, { span_attributes: [] }, { span_attributes: 'not-an-object' }, {}]
    )
    expect(attrs).toEqual([])
  })
})
