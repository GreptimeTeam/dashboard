import { describe, it, expect } from 'vitest'
import {
  attributeChipKey,
  attributeContainersOf,
  attributeLabelOf,
  attributeScopeOf,
  discoverSampledAttributes,
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

  it('ignores null containers, arrays and scalar values', () => {
    const attrs = discoverSampledAttributes(
      ['span_attributes'],
      [{ span_attributes: null }, { span_attributes: [] }, { span_attributes: 'not-an-object' }, {}]
    )
    expect(attrs).toEqual([])
  })
})
