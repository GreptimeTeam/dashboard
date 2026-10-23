import { describe, expect, it } from 'vitest'
import { foldVirtualPeersIntoServices, type ServiceMapEdge, type ServiceMapNode } from './service-map'

function service(id: string, options: { virtual?: boolean; connectionType?: string } = {}): ServiceMapNode {
  return {
    key: `service\0${id}`,
    type: 'service',
    id,
    label: id,
    serviceValue: id,
    sourceTables: [],
    instanceCount: 0,
    groupAttributes: {},
    virtual: Boolean(options.virtual),
    connectionType: options.connectionType,
  }
}

function edge(source: ServiceMapNode, target: ServiceMapNode, values: Partial<ServiceMapEdge> = {}): ServiceMapEdge {
  return {
    key: `${source.key}\0${target.key}`,
    source: source.key,
    target: target.key,
    requests: 0,
    errors: 0,
    unmatched: 0,
    durationSum: 0,
    durationCount: 0,
    durationMax: 0,
    ...values,
  }
}

describe('foldVirtualPeersIntoServices', () => {
  it('merges same-name virtual peers into the real service and keeps unmatched on the edge', () => {
    const frontend = service('frontend')
    // Real entity id ≠ peer name, but display label matches — the duplicate-node case.
    const checkout: ServiceMapNode = {
      ...service('checkout-entity'),
      label: 'checkout',
      serviceValue: 'checkout',
    }
    const checkoutVirtual = service('checkout', { virtual: true, connectionType: 'virtual_node' })
    const redis = service('redis', { virtual: true, connectionType: 'database' })

    const result = foldVirtualPeersIntoServices(
      [frontend, checkout, checkoutVirtual, redis],
      [
        edge(frontend, checkout, { requests: 40, errors: 1, durationSum: 4, durationCount: 40, durationMax: 0.2 }),
        edge(frontend, checkoutVirtual, { unmatched: 12 }),
        edge(frontend, redis, { unmatched: 8, connectionType: 'database' }),
      ]
    )

    expect(result.nodes.map((node) => node.key).sort()).toEqual([frontend.key, checkout.key, redis.key].sort())
    expect(result.nodes.some((node) => node.key === checkoutVirtual.key)).toBe(false)

    const toCheckout = result.edges.find((item) => item.target === checkout.key)
    expect(toCheckout).toMatchObject({ requests: 40, unmatched: 12, errors: 1 })
    expect(result.edges.find((item) => item.target === redis.key)?.unmatched).toBe(8)
  })
})
