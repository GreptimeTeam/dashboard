import type { ServiceMapEdge, ServiceMapNodeCallStats, ServiceMapNodeHealth } from './types'

/** Paired error ratio at or above this lights a node / edge as unhealthy. */
export const SERVICE_MAP_ERROR_RATE_THRESHOLD = 0.05

export function escapeHtml(value: string): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return value.replace(/[&<>"']/g, (char) => entities[char])
}

export function edgeTraffic(edge: ServiceMapEdge): number {
  return Math.max(0, edge.requests) + Math.max(0, edge.unmatched)
}

/** Aggregate per-node traffic / paired RED from `calls` edges. */
export function aggregateNodeCallStats(edges: ServiceMapEdge[]): Map<string, ServiceMapNodeCallStats> {
  const stats = new Map<string, ServiceMapNodeCallStats>()
  const touch = (key: string) => {
    const existing = stats.get(key)
    if (existing) return existing
    const created = {
      traffic: 0,
      requests: 0,
      errors: 0,
      inRequests: 0,
      inErrors: 0,
      outRequests: 0,
      outErrors: 0,
    }
    stats.set(key, created)
    return created
  }
  edges.forEach((edge) => {
    const traffic = edgeTraffic(edge)
    const requests = Math.max(0, edge.requests)
    const errors = Math.max(0, edge.errors)
    const source = touch(edge.source)
    source.traffic += traffic
    source.requests += requests
    source.errors += errors
    source.outRequests += requests
    source.outErrors += errors
    const target = touch(edge.target)
    target.traffic += traffic
    target.requests += requests
    target.errors += errors
    target.inRequests += requests
    target.inErrors += errors
  })
  return stats
}

export interface ServiceMapFlowSummary {
  requests: number
  errors: number
  unmatched: number
  durationSum: number
  durationCount: number
}

/** Raw (unclamped) RED sum over a node's incoming or outgoing edges, for tooltips. */
export function nodeFlowSummary(
  edges: ServiceMapEdge[],
  nodeKey: string,
  direction: 'incoming' | 'outgoing'
): ServiceMapFlowSummary {
  const connected = edges.filter((edge) =>
    direction === 'incoming' ? edge.target === nodeKey : edge.source === nodeKey
  )
  return connected.reduce(
    (value, edge) => ({
      requests: value.requests + edge.requests,
      errors: value.errors + edge.errors,
      unmatched: value.unmatched + edge.unmatched,
      durationSum: value.durationSum + edge.durationSum,
      durationCount: value.durationCount + edge.durationCount,
    }),
    { requests: 0, errors: 0, unmatched: 0, durationSum: 0, durationCount: 0 }
  )
}

export function nodeUnmatchedCount(edges: ServiceMapEdge[], nodeKey: string): number {
  return edges.reduce((sum, edge) => {
    if (edge.source !== nodeKey && edge.target !== nodeKey) return sum
    return sum + edge.unmatched
  }, 0)
}

/**
 * Binary health with a noise floor: only ≥5% paired errors light up.
 * (No public multi-tier standard; Datadog node rings use monitors, not % buckets.)
 */
export function healthFromErrorRate(requests: number, errors: number): ServiceMapNodeHealth {
  if (requests <= 0) return 'neutral'
  return errors / requests >= SERVICE_MAP_ERROR_RATE_THRESHOLD ? 'danger' : 'ok'
}

const HEALTH_RANK: Record<ServiceMapNodeHealth, number> = {
  danger: 2,
  ok: 1,
  neutral: 0,
}

/** Worst of inbound vs outbound — blending directions hides a bad hop behind healthy traffic. */
export function healthFromNodeCallStats(stats: ServiceMapNodeCallStats): ServiceMapNodeHealth {
  const inbound = healthFromErrorRate(stats.inRequests, stats.inErrors)
  const outbound = healthFromErrorRate(stats.outRequests, stats.outErrors)
  return HEALTH_RANK[inbound] >= HEALTH_RANK[outbound] ? inbound : outbound
}

export function pairedErrorRatio(requests: number, errors: number): number {
  if (requests <= 0) return 0
  return Math.min(1, Math.max(0, errors / requests))
}

/**
 * On-node stats: throughput prefers inbound (server view), falling back to outbound.
 * errorRatio uses the worse of inbound vs outbound so a bad client hop is not hidden
 * behind healthy server traffic (same rule as healthFromNodeCallStats).
 */
export function nodeDisplayCallStats(stats: ServiceMapNodeCallStats): {
  requests: number
  errors: number
  errorRatio: number
} {
  const useInbound = stats.inRequests > 0
  const requests = useInbound ? stats.inRequests : stats.outRequests
  const errors = useInbound ? stats.inErrors : stats.outErrors
  const inboundRatio = pairedErrorRatio(stats.inRequests, stats.inErrors)
  const outboundRatio = pairedErrorRatio(stats.outRequests, stats.outErrors)
  return {
    requests,
    errors,
    errorRatio: Math.max(inboundRatio, outboundRatio),
  }
}

export interface ServiceMapNodeSymbolOptions {
  size: number
  fill: string
  okColor: string
  dangerColor: string
  trackColor: string
  textColor: string
  errorRatio: number
  mainStat: string
  secondaryStat: string
  emphasized?: boolean
}

/** Short rate for inside-node glyphs — keep ≤~4–5 glyphs so small disks still fit. */
export function formatServiceMapCompactRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return '0/s'
  const trim = (value: number, digits: number) => {
    const fixed = value.toFixed(digits)
    return fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
  }
  if (rate >= 1_000_000) return `${trim(rate / 1_000_000, 1)}M`
  if (rate >= 1000) return `${trim(rate / 1000, rate >= 10_000 ? 0 : 1)}k`
  if (rate >= 100) return `${Math.round(rate)}/s`
  if (rate >= 10) return `${trim(rate, 0)}/s`
  return `${trim(rate, 1)}/s`
}

/** Compact error % for inside-node glyphs. */
export function formatServiceMapCompactPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '0%'
  if (ratio >= 0.995) return '100%'
  if (ratio >= 0.1) return `${Math.round(ratio * 100)}%`
  return `${(ratio * 100).toFixed(1).replace(/\.0$/, '')}%`
}

function fitNodeStatFontSize(size: number, diskR: number, text: string, baseRatio: number, minPx: number): number {
  const base = Math.max(minPx, size * baseRatio)
  // Approximate glyph width ≈ 0.62em; leave padding inside the fill disk.
  const maxWidth = diskR * 1.7
  const estimated = text.length * base * 0.62
  if (estimated <= maxWidth) return Math.round(base)
  return Math.max(minPx, Math.round(base * (maxWidth / estimated)))
}

/** Success/error dash lengths for the rim arc (exported for proportion tests). */
export function serviceMapArcDashLengths(
  errorRatio: number,
  circumference: number
): {
  okLen: number
  errorLen: number
} {
  const ratio = Math.min(1, Math.max(0, errorRatio))
  const errorLen = circumference * ratio
  return { okLen: circumference - errorLen, errorLen }
}

/** SVG data-URL symbol: fill disk + success/error arc on the rim (Grafana-like, minimal gutter). */
export function buildServiceMapNodeSymbolDataUrl(options: ServiceMapNodeSymbolOptions): string {
  const size = Math.max(28, Math.round(options.size))
  const cx = size / 2
  const cy = size / 2
  // Arc sits on the outer rim; fill butts up against it so there is no white moat.
  const stroke = Math.max(2.5, size * (options.emphasized ? 0.09 : 0.075))
  const ringR = size * 0.5 - stroke * 0.5
  const diskR = Math.max(stroke, ringR - stroke * 0.5)
  const circumference = 2 * Math.PI * ringR
  const { okLen, errorLen } = serviceMapArcDashLengths(options.errorRatio, circumference)
  const fontMain = fitNodeStatFontSize(size, diskR, options.mainStat, 0.22, 7)
  const fontSec = fitNodeStatFontSize(size, diskR, options.secondaryStat, 0.165, 6)
  const mainY = cy - fontSec * 0.15
  const secY = cy + fontMain * 0.7
  const esc = escapeHtml
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${cx}" cy="${cy}" r="${diskR}" fill="${esc(options.fill)}"/>
  <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="${esc(options.okColor)}" stroke-width="${stroke}"
    stroke-dasharray="${okLen} ${errorLen}" stroke-dashoffset="${circumference * 0.25}" stroke-linecap="butt"/>
  <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="${esc(options.dangerColor)}" stroke-width="${stroke}"
    stroke-dasharray="${errorLen} ${okLen}" stroke-dashoffset="${circumference * 0.25 - okLen}" stroke-linecap="butt"/>
  <text x="${cx}" y="${mainY}" text-anchor="middle" dominant-baseline="middle"
    fill="${esc(options.textColor)}" font-size="${fontMain}" font-weight="600" font-family="system-ui,sans-serif">${esc(
    options.mainStat
  )}</text>
  <text x="${cx}" y="${secY}" text-anchor="middle" dominant-baseline="middle"
    fill="${esc(
      options.textColor
    )}" font-size="${fontSec}" font-weight="500" font-family="system-ui,sans-serif" opacity="0.85">${esc(
    options.secondaryStat
  )}</text>
</svg>`
  return `image://data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Map traffic onto symbol diameter; inferred nodes stay one step smaller. */
export function mapTrafficToSymbolSize(
  traffic: number,
  minTraffic: number,
  maxTraffic: number,
  options: { virtual?: boolean; cluster?: boolean } = {}
): number {
  if (options.cluster) return 40
  // Real services need room for inner req/s + error% (Grafana-like node contents).
  const minSize = options.virtual ? 14 : 40
  const maxSize = options.virtual ? 36 : 68
  if (maxTraffic <= minTraffic) return Math.round((minSize + maxSize) / 2)
  const t = Math.log1p(Math.max(0, traffic))
  const lo = Math.log1p(Math.max(0, minTraffic))
  const hi = Math.log1p(Math.max(0, maxTraffic))
  const ratio = hi <= lo ? 0.5 : (t - lo) / (hi - lo)
  return Math.round(minSize + Math.min(1, Math.max(0, ratio)) * (maxSize - minSize))
}
