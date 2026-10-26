import { beforeEach, describe, expect, it, vi } from 'vitest'
import editorApi from '@/api/editor'
import {
  SERVICE_MAP_EDGE_LIMIT,
  SERVICE_MAP_ENTITY_ROWS_LIMIT,
  SERVICE_MAP_NODE_LIMIT,
  SERVICE_MAP_RELATIONSHIP_ROWS_LIMIT,
} from '../../traces/service-map-queries'
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
/** Post-SQL shape: one row per endpoint pair; RED already confidence-gated. */
const RELATIONSHIP_COLUMNS = [
  'src_type',
  'src_id',
  'dst_type',
  'dst_id',
  'request_count',
  'error_count',
  'unmatched_count',
  'duration_sum',
  'duration_count',
  'duration_max',
  'attributes',
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

  it(`ranks edges by requests then unmatched and caps nodes at ${SERVICE_MAP_NODE_LIMIT}`, () => {
    const hub = service('hub')
    const leaves = Array.from({ length: SERVICE_MAP_NODE_LIMIT + 20 }, (_, index) => service(`leaf-${index}`))
    const nodes = new Map([hub, ...leaves].map((node) => [node.key, node]))
    const edges = leaves.map((leaf, index) => edge(hub, leaf, { requests: index % 2 ? 0 : index, unmatched: index }))
    const result = limitServiceMapGraph(nodes, edges)

    expect(result.nodes).toHaveLength(SERVICE_MAP_NODE_LIMIT)
    expect(result.edges).toHaveLength(SERVICE_MAP_NODE_LIMIT - 1)
    expect(result.edges[0].target).toBe(leaves[SERVICE_MAP_NODE_LIMIT + 18].key)
    expect(result.truncated).toBe(true)
  })

  it(`caps edges at ${SERVICE_MAP_EDGE_LIMIT} and flags truncation`, () => {
    const left = Array.from({ length: 28 }, (_, index) => service(`l-${index}`))
    const right = Array.from({ length: 28 }, (_, index) => service(`r-${index}`))
    const nodes = new Map([...left, ...right].map((node) => [node.key, node]))
    const edges = left.flatMap((source) => right.map((target) => edge(source, target, { requests: 1 })))
    const result = limitServiceMapGraph(nodes, edges)

    expect(edges).toHaveLength(784)
    expect(result.edges).toHaveLength(SERVICE_MAP_EDGE_LIMIT)
    expect(result.nodes).toHaveLength(56)
    expect(result.truncated).toBe(true)
  })
})

describe('fetchServiceMap', () => {
  const runSQL = vi.mocked(editorApi.runSQL)

  beforeEach(() => {
    runSQL.mockReset()
  })

  it('renders entities first, then uses SQL-aggregated RED and folds same-name peers', async () => {
    runSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('semantic_relationships')) {
        // One row per endpoint pair; RED already confidence-gated in SQL.
        // Unmatched from low-confidence service→service stays on that edge; peer edge is separate until fold.
        return sqlResponse(RELATIONSHIP_COLUMNS, [
          ['service', 'frontend', 'service', 'checkout', 40, 2, 5, 4, 40, 0.3, '{}'],
          ['service', 'frontend', 'peer', 'checkout', 0, 0, 7, 0, 0, 0, '{"connection_type":"virtual_node"}'],
          ['service', 'checkout', 'peer', 'redis', 0, 0, 3, 0, 0, 0, '{"connection_type":"database"}'],
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

  it('still gates RED on confidence when legacy unaggregated rows are present', async () => {
    const legacyColumns = [
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
    runSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('semantic_relationships')) {
        return sqlResponse(legacyColumns, [
          ['service', 'a', 'service', 'b', '{}', 1, 10, 1, 0, 2, 10, 0.1],
          ['service', 'a', 'service', 'b', '{}', 0.5, 99, 99, 5, 99, 99, 9],
        ]) as never
      }
      return sqlResponse(ENTITY_COLUMNS, [['service', 'a', '{"service.name":"a"}', null, null, '[]']]) as never
    })

    const result = await fetchServiceMap(ctx)
    expect(result.edges[0]).toMatchObject({ requests: 10, errors: 1, unmatched: 5, durationSum: 2, durationCount: 10 })
  })

  it('flags truncated when SQL returns a full page of entities', async () => {
    const entityRows = Array.from({ length: SERVICE_MAP_ENTITY_ROWS_LIMIT }, (_, index) => [
      'service',
      `svc-${index}`,
      `{"service.name":"svc-${index}"}`,
      null,
      null,
      '[]',
    ])
    runSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('semantic_relationships')) {
        return sqlResponse(RELATIONSHIP_COLUMNS, []) as never
      }
      return sqlResponse(ENTITY_COLUMNS, entityRows) as never
    })

    const result = await fetchServiceMap(ctx)
    expect(result.truncated).toBe(true)
    expect(result.nodes.length).toBeLessThanOrEqual(SERVICE_MAP_NODE_LIMIT)
  })

  it('flags truncated when SQL returns a full page of relationships', async () => {
    const relationshipRows = Array.from({ length: SERVICE_MAP_RELATIONSHIP_ROWS_LIMIT }, (_, index) => [
      'service',
      'hub',
      'service',
      `leaf-${index}`,
      1,
      0,
      0,
      0,
      1,
      0,
      '{}',
    ])
    runSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('semantic_relationships')) {
        return sqlResponse(RELATIONSHIP_COLUMNS, relationshipRows) as never
      }
      return sqlResponse(ENTITY_COLUMNS, [['service', 'hub', '{"service.name":"hub"}', null, null, '[]']]) as never
    })

    const result = await fetchServiceMap(ctx)
    expect(result.truncated).toBe(true)
    expect(result.edges.length).toBeLessThanOrEqual(SERVICE_MAP_EDGE_LIMIT)
  })

  it('skips queries when the time range is unavailable', async () => {
    const result = await fetchServiceMap({ ...(ctx as object), query: { unixTimeRange: () => [] } } as never)
    expect(result).toEqual({ nodes: [], edges: [], truncated: false })
    expect(runSQL).not.toHaveBeenCalled()
  })
})
