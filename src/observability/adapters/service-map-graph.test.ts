import { describe, expect, it } from 'vitest'
import type { ServiceMapEdge, ServiceMapNode } from './service-map'
import {
  absorbTinyCommunities,
  aggregateNodeCallStats,
  buildServiceMapDisplayGraph,
  buildServiceMapFacets,
  buildServiceMapFocusLayout,
  buildServiceMapHybridLayout,
  buildServiceMapLayeredLayout,
  buildServiceMapOverviewLayout,
  buildServiceMapScopeFacet,
  buildServiceMapNodeSymbolDataUrl,
  fitLayoutToViewport,
  formatServiceMapCompactPercent,
  formatServiceMapCompactRate,
  healthFromErrorRate,
  healthFromNodeCallStats,
  heapIntrinsicSize,
  mapTrafficToSymbolSize,
  nodeDisplayCallStats,
  packHeapRows,
  pairedErrorRatio,
  serviceMapArcDashLengths,
} from './service-map-graph'

function service(id: string, attributes: Record<string, string> = {}, virtual = false): ServiceMapNode {
  return {
    key: `service\0${id}`,
    type: 'service',
    id,
    label: id,
    serviceValue: id,
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
      expandedClusters: new Set([clusterKey!]),
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
})

describe('buildServiceMapLayeredLayout', () => {
  it('places callers left of callees by call depth', () => {
    const frontend = service('frontend')
    const checkout = service('checkout')
    const redis = service('redis', {}, true)
    const layout = buildServiceMapLayeredLayout(
      [frontend, checkout, redis],
      [edge(frontend, checkout, 40), edge(checkout, redis, 20)],
      900,
      600
    )
    const frontendPos = layout.get(frontend.key)
    const checkoutPos = layout.get(checkout.key)
    const redisPos = layout.get(redis.key)
    expect(frontendPos).toBeDefined()
    expect(checkoutPos).toBeDefined()
    expect(redisPos).toBeDefined()
    if (!frontendPos || !checkoutPos || !redisPos) return
    expect(frontendPos.x).toBeLessThan(checkoutPos.x)
    expect(Math.abs(redisPos.x - checkoutPos.x)).toBeLessThan(130)
    // Inferred nodes park below the caller so labels clear the parent.
    expect(redisPos.y).toBeGreaterThan(checkoutPos.y)
    expect(Math.abs(redisPos.y - checkoutPos.y)).toBeLessThan(120)
  })
})

describe('aggregateNodeCallStats / health / symbol size', () => {
  it('aggregates traffic and buckets health from paired error rate', () => {
    const a = service('a')
    const b = service('b')
    const stats = aggregateNodeCallStats([
      { ...edge(a, b, 100), errors: 6, unmatched: 10 },
      { ...edge(b, a, 20), errors: 0, unmatched: 0 },
    ])
    expect(stats.get(a.key)?.traffic).toBe(130)
    expect(stats.get(a.key)?.requests).toBe(120)
    expect(stats.get(a.key)?.errors).toBe(6)
    expect(stats.get(a.key)?.outRequests).toBe(100)
    expect(stats.get(a.key)?.outErrors).toBe(6)
    expect(stats.get(a.key)?.inRequests).toBe(20)
    expect(healthFromErrorRate(100, 0)).toBe('ok')
    expect(healthFromErrorRate(100, 2)).toBe('ok')
    expect(healthFromErrorRate(100, 6)).toBe('danger')
    expect(healthFromErrorRate(0, 0)).toBe('neutral')
    expect(mapTrafficToSymbolSize(0, 0, 100)).toBeLessThan(mapTrafficToSymbolSize(100, 0, 100))
    expect(mapTrafficToSymbolSize(50, 0, 100, { virtual: true })).toBeLessThan(
      mapTrafficToSymbolSize(50, 0, 100, { virtual: false })
    )
  })

  it('uses the worse of inbound vs outbound so a bad hop is not diluted', () => {
    // Heavy healthy inbound + sparse 40% outbound → blended ~2% (warn), worst-of → danger.
    const payment = service('payment')
    const checkout = service('checkout')
    const flagd = service('flagd')
    const stats = aggregateNodeCallStats([
      { ...edge(checkout, payment, 980), errors: 0, unmatched: 0 },
      { ...edge(payment, flagd, 49), errors: 20, unmatched: 0 },
    ])
    const paymentStats = stats.get(payment.key)
    expect(paymentStats).toBeDefined()
    if (!paymentStats) return
    // Blended (~1.9%) stays ok under the 5% floor…
    expect(healthFromErrorRate(paymentStats.requests, paymentStats.errors)).toBe('ok')
    // …but worst-of outbound (40%) still marks the node.
    expect(healthFromNodeCallStats(paymentStats)).toBe('danger')
  })

  it('shows inbound throughput but worst-direction error ratio on the node', () => {
    const payment = service('payment')
    const checkout = service('checkout')
    const flagd = service('flagd')
    const stats = aggregateNodeCallStats([
      { ...edge(checkout, payment, 100), errors: 0, unmatched: 0 },
      { ...edge(payment, flagd, 49), errors: 20, unmatched: 0 },
    ])
    const paymentStats = stats.get(payment.key)
    expect(paymentStats).toBeDefined()
    if (!paymentStats) return
    // Rate still follows inbound (server) volume…
    expect(nodeDisplayCallStats(paymentStats).requests).toBe(100)
    // …but the arc/% must surface the 40% outbound hop.
    expect(nodeDisplayCallStats(paymentStats).errorRatio).toBeCloseTo(20 / 49)
    expect(pairedErrorRatio(0, 0)).toBe(0)
    expect(pairedErrorRatio(50, 5)).toBe(0.1)
  })

  it('builds an SVG data-URL symbol with arc and inner stats', () => {
    const symbol = buildServiceMapNodeSymbolDataUrl({
      size: 48,
      fill: 'rgba(112,47,237,0.11)',
      okColor: '#22c55e',
      dangerColor: '#ef4444',
      trackColor: '#999',
      textColor: '#473460',
      errorRatio: 0.25,
      mainStat: '12/s',
      secondaryStat: '25%',
    })
    expect(symbol.startsWith('image://data:image/svg+xml')).toBe(true)
    const decoded = decodeURIComponent(symbol.replace('image://data:image/svg+xml;charset=utf-8,', ''))
    expect(decoded).toContain('12/s')
    expect(decoded).toContain('25%')
    expect(decoded).toContain('#22c55e')
    expect(decoded).toContain('#ef4444')
  })

  it('compacts large rates so they fit inside small node disks', () => {
    expect(formatServiceMapCompactRate(0)).toBe('0/s')
    expect(formatServiceMapCompactRate(3.2)).toBe('3.2/s')
    expect(formatServiceMapCompactRate(42)).toBe('42/s')
    expect(formatServiceMapCompactRate(1500)).toBe('1.5k')
    expect(formatServiceMapCompactRate(12_500)).toBe('13k')
    expect(formatServiceMapCompactRate(2_400_000)).toBe('2.4M')
    expect(formatServiceMapCompactPercent(0.006)).toBe('0.6%')
    expect(formatServiceMapCompactPercent(0.4082)).toBe('41%')
  })

  it('splits rim dash lengths by error ratio', () => {
    const circumference = 100
    expect(serviceMapArcDashLengths(0, circumference)).toEqual({ okLen: 100, errorLen: 0 })
    expect(serviceMapArcDashLengths(1, circumference)).toEqual({ okLen: 0, errorLen: 100 })
    expect(serviceMapArcDashLengths(0.4, circumference)).toEqual({ okLen: 60, errorLen: 40 })
    expect(serviceMapArcDashLengths(-0.2, circumference)).toEqual({ okLen: 100, errorLen: 0 })
    expect(serviceMapArcDashLengths(1.5, circumference)).toEqual({ okLen: 0, errorLen: 100 })
  })
})

describe('fitLayoutToViewport', () => {
  it('shrinks overflowing layouts and does not enlarge sparse ones', () => {
    const sparse = new Map([
      ['a', { x: 100, y: 80, community: 0 }],
      ['b', { x: 200, y: 120, community: 0 }],
    ])
    fitLayoutToViewport(sparse, 800, 600)
    const sparseA = sparse.get('a')
    const sparseB = sparse.get('b')
    expect(sparseA).toBeDefined()
    expect(sparseB).toBeDefined()
    if (!sparseA || !sparseB) return
    // Scale stays 1: relative span preserved (only rebased to inset).
    expect(sparseB.x - sparseA.x).toBeCloseTo(100, 5)
    expect(sparseB.y - sparseA.y).toBeCloseTo(40, 5)

    const overflow = new Map([
      ['a', { x: 0, y: 0, community: 0 }],
      ['b', { x: 2000, y: 1500, community: 0 }],
    ])
    fitLayoutToViewport(overflow, 800, 600)
    const overflowA = overflow.get('a')
    const overflowB = overflow.get('b')
    expect(overflowA).toBeDefined()
    expect(overflowB).toBeDefined()
    if (!overflowA || !overflowB) return
    expect(overflowB.x - overflowA.x).toBeLessThan(2000)
    expect(overflowB.y - overflowA.y).toBeLessThan(1500)
    expect(overflowB.x).toBeLessThan(800)
    expect(overflowB.y).toBeLessThan(600)
  })
})

describe('absorbTinyCommunities', () => {
  it('merges a singleton community into its strongest neighbor', () => {
    const cart = service('cart')
    const checkout = service('checkout')
    const payment = service('payment')
    const email = service('email')
    const communityByNode = new Map([
      [cart.key, 'tiny'],
      [checkout.key, 'right'],
      [payment.key, 'right'],
      [email.key, 'right'],
    ])
    const merged = absorbTinyCommunities(communityByNode, [
      edge(cart, checkout, 30),
      edge(checkout, payment, 50),
      edge(checkout, email, 40),
      edge(payment, email, 35),
    ])
    expect(merged.get(cart.key)).toBe('right')
    expect(merged.get(checkout.key)).toBe('right')
  })
})

describe('heapIntrinsicSize / packHeapRows', () => {
  it('grows monotonically with member count and reserves extra height for bottom titles', () => {
    const one = heapIntrinsicSize(1)
    const two = heapIntrinsicSize(2)
    const five = heapIntrinsicSize(5)
    expect(one.width).toBeLessThan(two.width)
    expect(two.width).toBeLessThan(five.width)
    expect(one.height).toBeLessThanOrEqual(two.height)
    expect(two.height).toBeLessThanOrEqual(five.height)
    expect(one.height).toBeGreaterThan(one.width)
    expect(five.height).toBeGreaterThanOrEqual(five.width * 0.85)
  })

  it('packs many small heaps on one row and wraps large heaps earlier on a tight canvas', () => {
    const singles = Array.from({ length: 6 }, (_, index) => [`s${index}`])
    const wide = packHeapRows(singles, 2000)
    expect(wide).toHaveLength(2)
    expect(wide[0].heaps).toHaveLength(4)
    expect(wide[1].heaps).toHaveLength(2)

    const large = Array.from({ length: 3 }, (_, index) =>
      Array.from({ length: 8 }, (__, member) => `g${index}-${member}`)
    )
    const tight = packHeapRows(large, 500)
    expect(tight.length).toBeGreaterThanOrEqual(2)
    expect(Math.max(...tight.map((row) => row.heaps.length))).toBeLessThanOrEqual(2)
  })
})

describe('buildServiceMapHybridLayout', () => {
  it('keeps densely linked services in one heap and orders heaps by call depth', () => {
    const loadgen = service('loadgen')
    const proxy = service('proxy')
    const web = service('web')
    const checkout = service('checkout')
    const payment = service('payment')
    const email = service('email')
    const cart = service('cart')
    const redis = service('redis', {}, true)
    // Two size-3 heaps (immune to size≤2 absorb) + singleton cart absorbed into checkout heap.
    const layout = buildServiceMapHybridLayout(
      [loadgen, proxy, web, checkout, payment, email, cart, redis],
      [
        edge(loadgen, proxy, 40),
        edge(proxy, web, 35),
        edge(loadgen, web, 30),
        edge(web, checkout, 4),
        edge(checkout, payment, 50),
        edge(checkout, email, 45),
        edge(payment, email, 40),
        edge(cart, checkout, 25),
        edge(checkout, redis, 20),
      ],
      1000,
      600
    )

    const loadgenPos = layout.get(loadgen.key)
    const proxyPos = layout.get(proxy.key)
    const checkoutPos = layout.get(checkout.key)
    const paymentPos = layout.get(payment.key)
    const emailPos = layout.get(email.key)
    const cartPos = layout.get(cart.key)
    const redisPos = layout.get(redis.key)
    expect(loadgenPos).toBeDefined()
    expect(proxyPos).toBeDefined()
    expect(checkoutPos).toBeDefined()
    expect(paymentPos).toBeDefined()
    expect(emailPos).toBeDefined()
    expect(cartPos).toBeDefined()
    expect(redisPos).toBeDefined()
    if (!loadgenPos || !proxyPos || !checkoutPos || !paymentPos || !emailPos || !cartPos || !redisPos) return

    // Ingress sits left of the checkout-side services.
    expect(Math.max(loadgenPos.x, proxyPos.x)).toBeLessThan(checkoutPos.x)
    expect(Math.max(loadgenPos.x, proxyPos.x)).toBeLessThan(paymentPos.x)
    // Absorbed singleton cart stays near its strongest neighbor.
    expect(Math.hypot(cartPos.x - checkoutPos.x, cartPos.y - checkoutPos.y)).toBeLessThan(200)
    // Inferred redis sits below-right of its caller (clears the bottom title).
    expect(redisPos.x).toBeGreaterThan(checkoutPos.x)
    expect(redisPos.y).toBeGreaterThan(checkoutPos.y)
    expect(Math.hypot(redisPos.x - checkoutPos.x, redisPos.y - checkoutPos.y)).toBeLessThan(220)
    // Multi-node heaps use vertical space instead of collapsing to one point.
    const leftYs = [loadgenPos.y, proxyPos.y]
    expect(Math.abs(leftYs[0] - leftYs[1])).toBeGreaterThan(30)
    // Top-aligned: heaps sit near the top inset, not vertically centered in a tall canvas.
    expect(Math.min(loadgenPos.y, proxyPos.y, checkoutPos.y)).toBeLessThan(160)
  })

  it('parks isolates just under the main connected block', () => {
    const a = service('a')
    const b = service('b')
    const loner = service('loner')
    const layout = buildServiceMapHybridLayout([a, b, loner], [edge(a, b, 10)], 800, 600)
    const aPos = layout.get(a.key)
    const bPos = layout.get(b.key)
    const lonerPos = layout.get(loner.key)
    expect(aPos).toBeDefined()
    expect(bPos).toBeDefined()
    expect(lonerPos).toBeDefined()
    if (!aPos || !bPos || !lonerPos) return
    const mainBottom = Math.max(aPos.y, bPos.y)
    expect(lonerPos.y).toBeGreaterThan(mainBottom)
    // Not parked at the canvas floor — stays close under the heap block.
    expect(lonerPos.y - mainBottom).toBeLessThan(200)
    expect(lonerPos.y).toBeLessThan(400)
  })
})

describe('buildServiceMapOverviewLayout', () => {
  it('delegates to the hybrid vertical-heap layout', () => {
    const left = service('a')
    const right = service('b')
    const nodes = [left, right]
    const edges = [edge(left, right, 5)]
    const hybrid = buildServiceMapHybridLayout(nodes, edges, 800, 600)
    const overview = buildServiceMapOverviewLayout(nodes, edges, 800, 600)
    expect(overview.get(left.key)?.x).toBe(hybrid.get(left.key)?.x)
    expect(overview.get(left.key)?.community).toBe(hybrid.get(left.key)?.community)
  })
})

describe('buildServiceMapFocusLayout', () => {
  it('places upstream callers left and downstream callees right of the focus node', () => {
    const frontend = service('frontend')
    const gateway = service('gateway')
    const checkout = service('checkout')
    const layout = buildServiceMapFocusLayout(
      gateway.key,
      [frontend, gateway, checkout],
      [edge(frontend, gateway, 40), edge(gateway, checkout, 30)],
      800,
      600
    )

    expect(layout.get(gateway.key)).toMatchObject({ x: 400, y: 300, community: 0 })
    const frontendPos = layout.get(frontend.key)
    const checkoutPos = layout.get(checkout.key)
    expect(frontendPos).toBeDefined()
    expect(checkoutPos).toBeDefined()
    if (!frontendPos || !checkoutPos) return
    expect(frontendPos.x).toBeLessThan(400)
    expect(checkoutPos.x).toBeGreaterThan(400)
  })
})
