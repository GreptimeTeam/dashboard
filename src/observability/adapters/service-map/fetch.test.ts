import { beforeEach, describe, expect, it, vi } from 'vitest'
import editorApi from '@/api/editor'
import {
  SERVICE_MAP_EDGE_LIMIT,
  SERVICE_MAP_ENTITY_ROWS_LIMIT,
  SERVICE_MAP_NODE_LIMIT,
  SERVICE_MAP_RELATIONSHIP_ROWS_LIMIT,
} from '../../traces/service-map-queries'
import {
  capInstanceSatellites,
  fetchServiceMap,
  foldVirtualPeersIntoServices,
  isMissingSemanticGraph,
  limitServiceMapGraph,
  limitTopologyNodes,
  nodesFromEntities,
  serviceMapSqlErrorMessage,
} from './fetch'
import type { ServiceMapEdge, ServiceMapNode } from './types'

vi.mock('@/api/editor', () => ({ default: { runSQL: vi.fn() } }))

function service(id: string, options: { virtual?: boolean; connectionType?: string } = {}): ServiceMapNode {
  return {
    key: `service\0${id}`,
    type: 'service',
    id,
    label: id,
    serviceValue: id,
    scopes: [],
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
    provenance: 'trace',
    declared: false,
    hasTelemetry: true,
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

describe('nodesFromEntities', () => {
  it('merges multi-scope rows into one node with scopes[]', () => {
    const nodes = nodesFromEntities([
      {
        entity_type: 'service',
        entity_id: 'api',
        entity_id_attrs: '{"service.name":"api"}',
        scope: 'prod',
        descriptive: null,
        source_tables: '["traces"]',
      },
      {
        entity_type: 'service',
        entity_id: 'api',
        entity_id_attrs: '{"service.name":"api"}',
        scope: 'staging',
        descriptive: null,
        source_tables: '["traces"]',
      },
    ])
    const api = nodes.get('service\0api')
    expect(api?.scopes.sort()).toEqual(['prod', 'staging'])
    expect(api?.scope).toBe('prod')
  })
})

describe('limitTopologyNodes', () => {
  it('keeps call-graph nodes and caps satellites under the node limit', () => {
    const call = service('frontend')
    const satellites = Array.from({ length: 5 }, (_, index) => {
      const id = `i-${index}`
      return {
        ...service(id),
        key: `service.instance\0${id}`,
        type: 'service.instance',
        id,
      }
    })
    const capped = limitTopologyNodes([call], satellites, [], [], 3)
    expect(capped.nodes).toHaveLength(3)
    expect(capped.nodes[0].key).toBe(call.key)
    expect(capped.truncated).toBe(true)
  })
})

describe('capInstanceSatellites', () => {
  it('keeps at most N part_of instances per service and drops orphan runs_on', () => {
    const serviceKey = 'service\0frontend'
    const instances = Array.from({ length: 5 }, (_, index) => `service.instance\0i-${index}`)
    const partOf = instances.map((source) =>
      edge(service('frontend'), service('frontend'), {
        key: `${source}\0${serviceKey}\0part_of`,
        source,
        target: serviceKey,
        relType: 'part_of',
      })
    )
    const runsOn = [
      edge(service('frontend'), service('frontend'), {
        key: `${instances[0]}\0container\0c0\0runs_on`,
        source: instances[0],
        target: 'container\0c0',
        relType: 'runs_on',
      }),
      edge(service('frontend'), service('frontend'), {
        key: `${instances[4]}\0container\0c4\0runs_on`,
        source: instances[4],
        target: 'container\0c4',
        relType: 'runs_on',
      }),
    ]
    const capped = capInstanceSatellites([...partOf, ...runsOn], 3)
    expect(capped.filter((item) => item.relType === 'part_of')).toHaveLength(3)
    expect(capped.filter((item) => item.relType === 'runs_on').map((item) => item.source)).toEqual([instances[0]])
  })
})

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

  it('uses SQL-aggregated RED and folds same-name peers after both queries settle', async () => {
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

    const result = await fetchServiceMap(ctx)

    expect(runSQL).toHaveBeenCalledTimes(2)

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

  it('loads capped part_of / runs_on satellites for all real services when showTopology is on', async () => {
    const structuralColumns = ['src_type', 'src_id', 'dst_type', 'dst_id', 'rel_type']
    runSQL.mockImplementation(async (sql: string) => {
      if (sql.includes("entity_type = 'service'")) {
        return sqlResponse(ENTITY_COLUMNS, [
          ['service', 'frontend', '{"service.name":"frontend"}', null, null, '[]'],
        ]) as never
      }
      if (sql.includes("rel_type = 'calls'")) {
        return sqlResponse(RELATIONSHIP_COLUMNS, []) as never
      }
      if (sql.includes("rel_type = 'part_of'")) {
        expect(sql).toContain("dst_id IN ('frontend')")
        return sqlResponse(structuralColumns, [
          ['service.instance', 'i-1', 'service', 'frontend', 'part_of'],
          ['service.instance', 'i-2', 'service', 'frontend', 'part_of'],
          ['service.instance', 'i-3', 'service', 'frontend', 'part_of'],
          ['service.instance', 'i-4', 'service', 'frontend', 'part_of'],
        ]) as never
      }
      if (sql.includes("rel_type = 'runs_on'")) {
        expect(sql).toContain("src_id IN ('i-1', 'i-2', 'i-3')")
        return sqlResponse(structuralColumns, [['service.instance', 'i-1', 'container', 'c-1', 'runs_on']]) as never
      }
      throw new Error(`unexpected sql: ${sql}`)
    })

    const withoutTopology = await fetchServiceMap(ctx, { showTopology: false })
    expect(withoutTopology.nodes.every((node) => node.type === 'service')).toBe(true)
    expect(runSQL).toHaveBeenCalledTimes(2)

    runSQL.mockClear()
    const result = await fetchServiceMap(ctx, { showTopology: true })
    expect(runSQL).toHaveBeenCalledTimes(4)
    expect(result.nodes.some((node) => node.type === 'service.instance')).toBe(true)
    expect(result.nodes.filter((node) => node.type === 'service.instance')).toHaveLength(3)
    expect(result.nodes.some((node) => node.type === 'container')).toBe(true)
    expect(result.edges.filter((item) => item.relType === 'part_of')).toHaveLength(3)
    expect(result.edges.filter((item) => item.relType === 'runs_on')).toHaveLength(1)
  })
})

describe('isMissingSemanticGraph', () => {
  it('detects Table not found for semantic graph tables', () => {
    expect(
      isMissingSemanticGraph({
        error: 'Failed to plan SQL: Table not found: greptime_private.semantic_entities',
      })
    ).toBe(true)
    expect(
      isMissingSemanticGraph({
        error: 'Failed to plan SQL: Table not found: greptime_private.semantic_relationships',
      })
    ).toBe(true)
  })

  it('ignores other SQL failures', () => {
    expect(isMissingSemanticGraph({ error: 'Failed to plan SQL: Table not found: public.foo' })).toBe(false)
    expect(isMissingSemanticGraph({ error: 'timeout' })).toBe(false)
    expect(isMissingSemanticGraph(new Error('boom'))).toBe(false)
  })
})

describe('serviceMapSqlErrorMessage', () => {
  it('reads interceptor reject payload', () => {
    expect(serviceMapSqlErrorMessage({ error: 'table gone', startTime: '1' })).toBe('table gone')
    expect(serviceMapSqlErrorMessage(new Error('boom'))).toBe('boom')
    expect(serviceMapSqlErrorMessage({ startTime: '1' })).toBe('')
  })
})
