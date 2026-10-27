import { describe, expect, it } from 'vitest'
import {
  absorbTinyCommunities,
  buildServiceMapOverviewLayout,
  fitLayoutToViewport,
  heapIntrinsicSize,
  packHeapRows,
  placeStructuralAnchors,
} from './layout'
import type { ServiceMapDisplayNode, ServiceMapEdge, ServiceMapNode, ServiceMapNodeLayout } from './types'

function service(id: string, virtual = false): ServiceMapNode {
  return {
    key: `service\0${id}`,
    type: 'service',
    id,
    label: id,
    serviceValue: id,
    sourceTables: [],
    instanceCount: 0,
    groupAttributes: {},
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

describe('buildServiceMapOverviewLayout', () => {
  it('keeps densely linked services in one heap and orders heaps by call depth', () => {
    const loadgen = service('loadgen')
    const proxy = service('proxy')
    const web = service('web')
    const checkout = service('checkout')
    const payment = service('payment')
    const email = service('email')
    const cart = service('cart')
    const redis = service('redis', true)
    // Two size-3 heaps (immune to size≤2 absorb) + singleton cart absorbed into checkout heap.
    const layout = buildServiceMapOverviewLayout(
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
    const layout = buildServiceMapOverviewLayout([a, b, loner], [edge(a, b, 10)], 800, 600)
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

describe('placeStructuralAnchors', () => {
  it('places satellites close on the outer rim and hangs containers further out', () => {
    const left: ServiceMapDisplayNode = {
      key: 'service\0left',
      label: 'left',
      type: 'service',
      virtual: false,
    }
    const right: ServiceMapDisplayNode = {
      key: 'service\0right',
      label: 'right',
      type: 'service',
      virtual: false,
    }
    const instance: ServiceMapDisplayNode = {
      key: 'service.instance\0i-1',
      label: 'i-1',
      type: 'service.instance',
      virtual: false,
    }
    const container: ServiceMapDisplayNode = {
      key: 'container\0c-1',
      label: 'c-1',
      type: 'container',
      virtual: false,
    }
    // Centroid ~ (300, 100); left service is on the outer-left rim.
    const layout = new Map<string, ServiceMapNodeLayout>([
      [left.key, { x: 100, y: 100, community: 0 }],
      [right.key, { x: 500, y: 100, community: 0 }],
    ])
    placeStructuralAnchors(
      layout,
      [left, right, instance, container],
      [
        {
          key: 'part',
          source: instance.key,
          target: left.key,
          relType: 'part_of',
          requests: 0,
          errors: 0,
          unmatched: 0,
          durationSum: 0,
          durationCount: 0,
          durationMax: 0,
        },
        {
          key: 'runs',
          source: instance.key,
          target: container.key,
          relType: 'runs_on',
          requests: 0,
          errors: 0,
          unmatched: 0,
          durationSum: 0,
          durationCount: 0,
          durationMax: 0,
        },
      ]
    )
    const instancePos = layout.get(instance.key)
    const containerPos = layout.get(container.key)
    expect(instancePos).toBeDefined()
    expect(containerPos).toBeDefined()
    if (!instancePos || !containerPos) return
    // Outer-left service → satellites further left, not far across the graph.
    expect(instancePos.x).toBeLessThan(100)
    expect(Math.hypot(instancePos.x - 100, instancePos.y - 100)).toBeLessThan(140)
    expect(containerPos.x).toBeLessThan(instancePos.x)
  })

  it('places top-edge service satellites above the service', () => {
    const top: ServiceMapDisplayNode = {
      key: 'service\0top',
      label: 'top',
      type: 'service',
      virtual: false,
    }
    const bottom: ServiceMapDisplayNode = {
      key: 'service\0bottom',
      label: 'bottom',
      type: 'service',
      virtual: false,
    }
    const instance: ServiceMapDisplayNode = {
      key: 'service.instance\0i-1',
      label: 'i-1',
      type: 'service.instance',
      virtual: false,
    }
    const layout = new Map<string, ServiceMapNodeLayout>([
      [top.key, { x: 200, y: 80, community: 0 }],
      [bottom.key, { x: 200, y: 320, community: 0 }],
    ])
    placeStructuralAnchors(
      layout,
      [top, bottom, instance],
      [
        {
          key: 'part',
          source: instance.key,
          target: top.key,
          relType: 'part_of',
          requests: 0,
          errors: 0,
          unmatched: 0,
          durationSum: 0,
          durationCount: 0,
          durationMax: 0,
        },
      ]
    )
    const instancePos = layout.get(instance.key)
    expect(instancePos).toBeDefined()
    if (!instancePos) return
    expect(instancePos.y).toBeLessThan(80)
    expect(Math.hypot(instancePos.x - 200, instancePos.y - 80)).toBeLessThan(140)
  })

  it('keeps structural nodes out of Louvain backbone placement', () => {
    const a = service('a')
    const b = service('b')
    const instance: ServiceMapNode = {
      key: 'service.instance\0i-1',
      type: 'service.instance',
      id: 'i-1',
      label: 'i-1',
      sourceTables: [],
      instanceCount: 0,
      groupAttributes: {},
      virtual: false,
    }
    const layout = buildServiceMapOverviewLayout(
      [a, b, instance],
      [
        edge(a, b, 20),
        {
          key: 'part',
          source: instance.key,
          target: a.key,
          relType: 'part_of',
          requests: 0,
          errors: 0,
          unmatched: 0,
          durationSum: 0,
          durationCount: 0,
          durationMax: 0,
        },
      ],
      800,
      600
    )
    const aPos = layout.get(a.key)
    const instancePos = layout.get(instance.key)
    expect(aPos).toBeDefined()
    expect(instancePos).toBeDefined()
    if (!aPos || !instancePos) return
    expect(Math.hypot(instancePos.x - aPos.x, instancePos.y - aPos.y)).toBeGreaterThanOrEqual(60)
  })
})

describe('inspect neighborhood uses overview layout rules', () => {
  it('orders heaps left→right by call depth on an inspect-sized subgraph', () => {
    // Inspect only changes which nodes are shown; layout is the overview algorithm.
    // Two size-3 heaps (immune to tiny absorb) linked by a weak hop → depth left→right.
    const loadgen = service('loadgen')
    const proxy = service('proxy')
    const web = service('web')
    const checkout = service('checkout')
    const payment = service('payment')
    const email = service('email')
    const layout = buildServiceMapOverviewLayout(
      [loadgen, proxy, web, checkout, payment, email],
      [
        edge(loadgen, proxy, 40),
        edge(proxy, web, 35),
        edge(loadgen, web, 30),
        edge(web, checkout, 4),
        edge(checkout, payment, 50),
        edge(checkout, email, 45),
        edge(payment, email, 40),
      ],
      1000,
      600
    )
    const leftX = Math.max(layout.get(loadgen.key)?.x ?? 0, layout.get(proxy.key)?.x ?? 0, layout.get(web.key)?.x ?? 0)
    const rightX = Math.min(
      layout.get(checkout.key)?.x ?? Infinity,
      layout.get(payment.key)?.x ?? Infinity,
      layout.get(email.key)?.x ?? Infinity
    )
    expect(leftX).toBeLessThan(rightX)
  })
})
