import { describe, expect, it } from 'vitest'
import { buildServiceMapDisplayGraph, buildServiceMapFacets, buildServiceMapScopeFacet, mergeEdges } from './graph'
import type { ServiceMapEdge, ServiceMapNode } from './types'

function service(id: string, attributes: Record<string, string> = {}, virtual = false): ServiceMapNode {
  return {
    key: `service\0${id}`,
    type: 'service',
    id,
    label: id,
    serviceValue: id,
    scopes: [],
    sourceTables: [],
    instanceCount: 0,
    groupAttributes: attributes,
    virtual,
  }
}

function edge(source: ServiceMapNode, target: ServiceMapNode, requests = 10): ServiceMapEdge {
  return {
    key: `${source.key}\0${target.key}`,
    source: source.key,
    target: target.key,
    provenance: 'trace',
    declared: false,
    hasTelemetry: true,
    requests,
    errors: 1,
    unmatched: 2,
    durationSum: requests * 0.1,
    durationCount: requests,
    durationMax: 0.2,
  }
}

describe('buildServiceMapFacets', () => {
  it('offers only attributes with at least two non-empty values and omits service identity', () => {
    const nodes = [
      service('frontend', {
        'service_name': 'frontend',
        'resource_attributes.service.namespace': 'demo',
        'team': 'edge',
      }),
      service('checkout', {
        'service_name': 'checkout',
        'resource_attributes.service.namespace': '',
        'team': 'payments',
      }),
      service('cart', { 'service_name': 'cart', 'resource_attributes.service.namespace': '', 'team': '' }),
    ]

    expect(buildServiceMapFacets(nodes)).toEqual([{ key: 'team', label: 'team', values: ['edge', 'payments'] }])
  })

  it('does not create facets from virtual endpoints', () => {
    expect(buildServiceMapFacets([service('external-a', { team: 'a' }, true)])).toEqual([])
  })

  it('keeps env and scope out of generic facets', () => {
    const nodes = [
      service('frontend', { env: 'prod', team: 'edge' }),
      service('checkout', { env: 'staging', team: 'payments' }),
    ]
    expect(buildServiceMapFacets(nodes).map((facet) => facet.key)).toEqual(['team'])
  })
})

describe('buildServiceMapScopeFacet', () => {
  it('collects entity scope and env attributes into one environment control', () => {
    const frontend = service('frontend', { env: 'prod' })
    const checkout: ServiceMapNode = { ...service('checkout'), scope: 'staging' }
    const cart = service('cart', { 'deployment.environment': 'prod' })

    expect(buildServiceMapScopeFacet([frontend, checkout, cart])).toEqual({
      key: 'scope',
      label: 'scope',
      values: ['prod', 'staging'],
    })
  })
})

describe('mergeEdges', () => {
  it('sums RED per resolved pair and drops unresolved endpoints and self-loops', () => {
    const a = service('a')
    const b = service('b')
    const c = service('c')
    const merged = mergeEdges(
      [
        { ...edge(a, b, 10), durationMax: 0.5, connectionType: undefined },
        { ...edge(c, b, 5), durationMax: 0.9, connectionType: 'database' },
        edge(a, c, 7),
      ],
      (key) => (key === c.key ? a.key : key)
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      key: `${a.key}\0${b.key}\0calls\0trace`,
      relType: 'calls',
      provenance: 'trace',
      requests: 15,
      errors: 2,
      unmatched: 4,
      durationMax: 0.9,
      connectionType: 'database',
    })
    expect(mergeEdges([edge(a, b)], (key) => (key === a.key ? undefined : key))).toEqual([])
  })
})

describe('buildServiceMapDisplayGraph', () => {
  const frontend = service('frontend', { env: 'prod' })
  const gateway = service('gateway', { env: 'internal' })
  const checkout = service('checkout', { env: 'prod' })
  const inventory = service('inventory', { env: 'staging' })
  const nodes = [frontend, gateway, checkout, inventory]
  const edges = [edge(frontend, gateway, 40), edge(gateway, checkout, 30), edge(checkout, inventory, 20)]

  it('shows the full graph without filters', () => {
    const result = buildServiceMapDisplayGraph({ nodes, edges })
    expect(result.nodes.map((node) => node.key)).toEqual(nodes.map((node) => node.key))
    expect(result.edges).toHaveLength(3)
  })

  it('collapses hidden service paths between matching services and preserves boundary RED', () => {
    const result = buildServiceMapDisplayGraph({
      nodes,
      edges,
      filters: { env: ['prod'] },
      clusterLabel: (count) => `${count} hidden services`,
    })
    const cluster = result.nodes.find((node) => node.cluster)

    expect(result.nodes.map((node) => node.key)).toContain(frontend.key)
    expect(result.nodes.map((node) => node.key)).toContain(checkout.key)
    expect(cluster?.members?.map((node) => node.key)).toEqual([gateway.key])
    expect(result.edges.map(({ requests }) => requests)).toEqual([40, 30])
    expect(result.edges.every((item) => item.errors === 1 && item.durationCount > 0)).toBe(true)
    expect(result.nodes.map((node) => node.key)).not.toContain(inventory.key)
  })

  it('expands a collapsed path cluster into its original service nodes and edges', () => {
    const collapsed = buildServiceMapDisplayGraph({ nodes, edges, filters: { env: ['prod'] } })
    const clusterKey = collapsed.nodes.find((node) => node.cluster)?.key
    expect(clusterKey).toBeDefined()
    const expanded = buildServiceMapDisplayGraph({
      nodes,
      edges,
      filters: { env: ['prod'] },
      expandedClusters: new Set([clusterKey ?? '']),
    })
    expect(expanded.nodes.map((node) => node.key)).toContain(gateway.key)
    expect(expanded.nodes.some((node) => node.cluster)).toBe(false)
    expect(expanded.edges.map((item) => item.requests)).toEqual([40, 30])
  })

  it('shows one matching service with direct dependencies and does not fabricate a cluster', () => {
    const result = buildServiceMapDisplayGraph({ nodes, edges, selectedServices: ['frontend'] })
    expect(result.nodes.map((node) => node.key)).toEqual([frontend.key, gateway.key])
    expect(result.nodes.some((node) => node.cluster)).toBe(false)
  })

  it('inspects one service and its direct dependencies for node-by-node pivots', () => {
    const result = buildServiceMapDisplayGraph({ nodes, edges, inspectNodeKey: gateway.key })
    expect(new Set(result.nodes.map((node) => node.key))).toEqual(new Set([frontend.key, gateway.key, checkout.key]))
    expect(result.edges).toHaveLength(2)
    expect(result.nodes.some((node) => node.cluster)).toBe(false)
  })

  it('filters the graph by first-class environment scope values', () => {
    const result = buildServiceMapDisplayGraph({ nodes, edges, selectedScopes: ['prod'] })
    expect(result.nodes.map((node) => node.key)).toContain(frontend.key)
    expect(result.nodes.map((node) => node.key)).toContain(checkout.key)
    expect(result.nodes.map((node) => node.key)).not.toContain(inventory.key)
    // gateway bridges prod services and collapses into a path cluster
    expect(result.nodes.some((node) => node.cluster)).toBe(true)
    expect(result.edges.map((item) => item.requests).sort((a, b) => b - a)).toEqual([40, 30])
  })

  it('keeps expanded instance/container satellites with a filtered service', () => {
    const instance: ServiceMapNode = {
      key: 'service.instance\0frontend-1',
      type: 'service.instance',
      id: 'frontend-1',
      label: 'frontend-1',
      sourceTables: [],
      scopes: [],
      instanceCount: 0,
      groupAttributes: {},
      virtual: false,
    }
    const container: ServiceMapNode = {
      key: 'container\0c1',
      type: 'container',
      id: 'c1',
      label: 'c1',
      sourceTables: [],
      scopes: [],
      instanceCount: 0,
      groupAttributes: {},
      virtual: false,
    }
    const structuralEdges: ServiceMapEdge[] = [
      {
        key: `${instance.key}\0${frontend.key}\0part_of`,
        source: instance.key,
        target: frontend.key,
        provenance: 'trace',
        declared: false,
        hasTelemetry: true,
        relType: 'part_of',
        requests: 0,
        errors: 0,
        unmatched: 0,
        durationSum: 0,
        durationCount: 0,
        durationMax: 0,
      },
      {
        key: `${instance.key}\0${container.key}\0runs_on`,
        source: instance.key,
        target: container.key,
        provenance: 'trace',
        declared: false,
        hasTelemetry: true,
        relType: 'runs_on',
        requests: 0,
        errors: 0,
        unmatched: 0,
        durationSum: 0,
        durationCount: 0,
        durationMax: 0,
      },
    ]
    const result = buildServiceMapDisplayGraph({
      nodes: [...nodes, instance, container],
      edges: [...edges, ...structuralEdges],
      selectedServices: ['frontend'],
    })
    expect(new Set(result.nodes.map((node) => node.key))).toEqual(
      new Set([frontend.key, gateway.key, instance.key, container.key])
    )
    expect(result.edges.some((item) => item.relType === 'part_of')).toBe(true)
    expect(result.edges.some((item) => item.relType === 'runs_on')).toBe(true)
  })
})
