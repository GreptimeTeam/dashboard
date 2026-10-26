import { describe, expect, it } from 'vitest'
import {
  aggregateNodeCallStats,
  buildServiceMapNodeSymbolDataUrl,
  escapeHtml,
  formatServiceMapCompactPercent,
  formatServiceMapCompactRate,
  healthFromErrorRate,
  healthFromNodeCallStats,
  mapTrafficToSymbolSize,
  nodeDisplayCallStats,
  nodeFlowSummary,
  nodeUnmatchedCount,
  pairedErrorRatio,
  serviceMapArcDashLengths,
} from './metrics'
import type { ServiceMapEdge, ServiceMapNode } from './types'

function service(id: string): ServiceMapNode {
  return {
    key: `service\0${id}`,
    type: 'service',
    id,
    label: id,
    serviceValue: id,
    sourceTables: [],
    instanceCount: 0,
    groupAttributes: {},
    virtual: false,
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

  it('treats the 5% error-rate threshold as inclusive', () => {
    expect(healthFromErrorRate(10_000, 499)).toBe('ok')
    expect(healthFromErrorRate(100, 5)).toBe('danger')
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

describe('nodeFlowSummary / nodeUnmatchedCount', () => {
  const a = service('a')
  const b = service('b')
  const c = service('c')
  const edges = [
    { ...edge(a, b, 10), errors: 2, unmatched: 1, durationSum: 1, durationCount: 10 },
    { ...edge(c, b, 30), errors: 3, unmatched: 4, durationSum: 6, durationCount: 30 },
    { ...edge(b, c, 5), errors: 0, unmatched: 7, durationSum: 0.5, durationCount: 5 },
  ]

  it('sums raw RED over incoming or outgoing edges only', () => {
    expect(nodeFlowSummary(edges, b.key, 'incoming')).toEqual({
      requests: 40,
      errors: 5,
      unmatched: 5,
      durationSum: 7,
      durationCount: 40,
    })
    expect(nodeFlowSummary(edges, b.key, 'outgoing')).toEqual({
      requests: 5,
      errors: 0,
      unmatched: 7,
      durationSum: 0.5,
      durationCount: 5,
    })
    expect(nodeFlowSummary(edges, 'missing', 'incoming').requests).toBe(0)
  })

  it('counts unmatched calls on every incident edge', () => {
    expect(nodeUnmatchedCount(edges, b.key)).toBe(12)
    expect(nodeUnmatchedCount(edges, a.key)).toBe(1)
  })
})

describe('escapeHtml', () => {
  it('escapes HTML-significant characters including single quotes', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;'
    )
  })
})
