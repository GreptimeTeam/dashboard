import { beforeEach, describe, expect, it, vi } from 'vitest'
import editorApi from '@/api/editor'
import { fetchServiceMap, foldVirtualPeersIntoServices, limitServiceMapGraph } from './fetch'
import type { ServiceMapEdge, ServiceMapNode } from './types'

vi.mock('@/api/editor', () => ({ default: { runSQL: vi.fn() } }))

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

function sqlResponse(columns: string[], rows: unknown[][]) {
  return { output: [{ records: { schema: { column_schemas: columns.map((name) => ({ name })) }, rows } }] }
}

const ENTITY_COLUMNS = ['entity_type', 'entity_id', 'entity_id_attrs', 'scope', 'descriptive', 'source_tables']
const RELATIONSHIP_COLUMNS = [
  'src_type',
  'src_id',
  'dst_type',
  'dst_id',
  'attributes',
  'confidence',
  'request_count',
  'error_count',
  'unmatched_count',
  'duration_sum',
  'duration_count',
  'duration_max',
]

const ctx = {
  query: { unixTimeRange: () => [1000, 4600] },
  connection: { databaseFor: () => 'public' },
} as never

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

describe('limitServiceMapGraph', () => {
  it('keeps every edge and node under the limits', () => {
    const a = service('a')
    const b = service('b')
    const loner = service('loner')
    const nodes = new Map([a, b, loner].map((node) => [node.key, node]))
    const result = limitServiceMapGraph(nodes, [edge(a, b, { requests: 3 })])
    expect(result.nodes.map((node) => node.key)).toEqual([a.key, b.key, loner.key])
    expect(result.edges).toHaveLength(1)
    expect(result.truncated).toBe(false)
  })

  it('ranks edges by requests then unmatched and caps nodes at 100', () => {
    const hub = service('hub')
    const leaves = Array.from({ length: 120 }, (_, index) => service(`leaf-${index}`))
    const nodes = new Map([hub, ...leaves].map((node) => [node.key, node]))
    const edges = leaves.map((leaf, index) => edge(hub, leaf, { requests: index % 2 ? 0 : index, unmatched: index }))
    const result = limitServiceMapGraph(nodes, edges)

    expect(result.nodes).toHaveLength(100)
    expect(result.edges).toHaveLength(99)
    expect(result.edges[0].target).toBe(leaves[118].key)
    expect(result.truncated).toBe(true)
  })

  it('caps edges at 250 and flags truncation', () => {
    const left = Array.from({ length: 16 }, (_, index) => service(`l-${index}`))
    const right = Array.from({ length: 16 }, (_, index) => service(`r-${index}`))
    const nodes = new Map([...left, ...right].map((node) => [node.key, node]))
    const edges = left.flatMap((source) => right.map((target) => edge(source, target, { requests: 1 })))
    const result = limitServiceMapGraph(nodes, edges)

    expect(edges).toHaveLength(256)
    expect(result.edges).toHaveLength(250)
    expect(result.nodes).toHaveLength(32)
    expect(result.truncated).toBe(true)
  })
})

describe('fetchServiceMap', () => {
  const runSQL = vi.mocked(editorApi.runSQL)

  beforeEach(() => {
    runSQL.mockReset()
  })

  it('renders entities first, then pairs RED only at confidence 1 and folds same-name peers', async () => {
    runSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('semantic_relationships')) {
        return sqlResponse(RELATIONSHIP_COLUMNS, [
          ['service', 'frontend', 'service', 'checkout', '{}', 1, 40, 2, 0, 4, 40, 0.3],
          ['service', 'frontend', 'service', 'checkout', '{}', 0.5, 99, 99, 5, 99, 99, 9],
          ['service', 'frontend', 'peer', 'checkout', '{"connection_type":"virtual_node"}', 0, 0, 0, 7, 0, 0, 0],
          ['service', 'checkout', 'peer', 'redis', '{"connection_type":"database"}', 0, 0, 0, 3, 0, 0, 0],
        ]) as never
      }
      return sqlResponse(ENTITY_COLUMNS, [
        ['service', 'frontend', '{"service.name":"frontend"}', 'prod', null, '["traces"]'],
        ['service', 'checkout', '{"service.name":"checkout"}', 'prod', null, '["traces"]'],
      ]) as never
    })
    const partial = vi.fn()

    const result = await fetchServiceMap(ctx, partial)

    expect(runSQL).toHaveBeenCalledTimes(2)
    expect(partial).toHaveBeenCalledTimes(1)
    expect(partial.mock.calls[0][0].nodes.map((node: ServiceMapNode) => node.id)).toEqual(['frontend', 'checkout'])
    expect(partial.mock.calls[0][0].edges).toEqual([])

    expect(result.truncated).toBe(false)
    expect(result.nodes.map((node) => node.key).sort()).toEqual(
      ['peer\0redis', 'service\0checkout', 'service\0frontend'].sort()
    )
    const toCheckout = result.edges.find((item) => item.target === 'service\0checkout')
    expect(toCheckout).toMatchObject({
      requests: 40,
      errors: 2,
      unmatched: 12,
      durationSum: 4,
      durationCount: 40,
      durationMax: 0.3,
    })
    const redis = result.nodes.find((node) => node.key === 'peer\0redis')
    expect(redis).toMatchObject({ virtual: true, connectionType: 'database' })
  })

  it('skips queries when the time range is unavailable', async () => {
    const result = await fetchServiceMap({ ...(ctx as object), query: { unixTimeRange: () => [] } } as never)
    expect(result).toEqual({ nodes: [], edges: [], truncated: false })
    expect(runSQL).not.toHaveBeenCalled()
  })
})
