import { describe, expect, it } from 'vitest'
import {
  absorbTinyCommunities,
  buildServiceMapFocusLayout,
  buildServiceMapOverviewLayout,
  fitLayoutToViewport,
  heapIntrinsicSize,
  packHeapRows,
} from './layout'
import type { ServiceMapEdge, ServiceMapNode } from './types'

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
