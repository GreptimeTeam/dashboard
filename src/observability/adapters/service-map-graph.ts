import type { ServiceMapEdge, ServiceMapNode } from './service-map'

export interface ServiceMapFacet {
  key: string
  label: string
  values: string[]
}

export interface ServiceMapFilters {
  [key: string]: string[]
}

export interface ServiceMapDisplayNode {
  key: string
  label: string
  type: string
  virtual: boolean
  connectionType?: string
  service?: ServiceMapNode
  members?: ServiceMapNode[]
  cluster?: boolean
}

function toDisplayNode(service: ServiceMapNode): ServiceMapDisplayNode {
  return {
    key: service.key,
    label: service.label,
    type: service.type,
    virtual: service.virtual,
    connectionType: service.connectionType,
    service,
  }
}

export interface ServiceMapDisplayGraph {
  nodes: ServiceMapDisplayNode[]
  edges: ServiceMapEdge[]
}

const SERVICE_IDENTITY_ATTRIBUTES = new Set(['name', 'service', 'service.name', 'service_name'])
/** Env / deployment scope attrs — promoted to a first-class toolbar control, not generic facets. */
const SCOPE_ATTRIBUTE_KEYS = new Set([
  'scope',
  'env',
  'environment',
  'deployment.environment',
  'deployment_environment',
  'resource_attributes.deployment.environment',
  'resource_attributes.deployment_environment',
])

function attributeLeaf(key: string): string {
  const normalized = key.toLocaleLowerCase()
  const parts = normalized.split('.')
  return parts[parts.length - 1] ?? normalized
}

function isServiceIdentityAttribute(key: string): boolean {
  const normalized = key.toLocaleLowerCase()
  return SERVICE_IDENTITY_ATTRIBUTES.has(normalized) || SERVICE_IDENTITY_ATTRIBUTES.has(attributeLeaf(key))
}

function isScopeAttribute(key: string): boolean {
  const normalized = key.toLocaleLowerCase()
  return SCOPE_ATTRIBUTE_KEYS.has(normalized) || SCOPE_ATTRIBUTE_KEYS.has(attributeLeaf(key))
}

function serviceIdentity(node: ServiceMapNode): boolean {
  return node.type === 'service' && !node.virtual
}

/** Distinct env/scope values for the dedicated Environment control. */
export function nodeScopeValues(node: ServiceMapNode): string[] {
  const values = new Set<string>()
  if (node.scope?.trim()) values.add(node.scope.trim())
  Object.entries(node.groupAttributes).forEach(([key, rawValue]) => {
    const value = rawValue.trim()
    if (value && isScopeAttribute(key)) values.add(value)
  })
  return [...values]
}

export function buildServiceMapScopeFacet(nodes: ServiceMapNode[]): ServiceMapFacet | null {
  const values = new Set<string>()
  nodes.filter(serviceIdentity).forEach((node) => {
    nodeScopeValues(node).forEach((value) => values.add(value))
  })
  if (!values.size) return null
  return {
    key: 'scope',
    label: 'scope',
    values: [...values].sort((left, right) => left.localeCompare(right)),
  }
}

export function buildServiceMapFacets(nodes: ServiceMapNode[]): ServiceMapFacet[] {
  const valuesByKey = new Map<string, Set<string>>()
  nodes.filter(serviceIdentity).forEach((node) => {
    Object.entries(node.groupAttributes).forEach(([key, rawValue]) => {
      const value = rawValue.trim()
      if (!value || isServiceIdentityAttribute(key) || isScopeAttribute(key)) return
      const values = valuesByKey.get(key) ?? new Set<string>()
      values.add(value)
      valuesByKey.set(key, values)
    })
  })

  return [...valuesByKey.entries()]
    .filter(([, values]) => values.size >= 2)
    .map(([key, values]) => ({
      key,
      label: key.replace(/^(resource|scope)_attributes\./, '').replace(/[._]/g, ' '),
      values: [...values].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

function nodeMatchesFilters(
  node: ServiceMapNode,
  selectedServices: string[],
  filters: ServiceMapFilters,
  selectedScopes: string[]
): boolean {
  if (
    selectedServices.length &&
    !selectedServices.includes(node.label) &&
    !selectedServices.includes(node.id) &&
    !(node.serviceValue && selectedServices.includes(node.serviceValue))
  ) {
    return false
  }
  if (selectedScopes.length) {
    const scopes = nodeScopeValues(node)
    if (!scopes.some((value) => selectedScopes.includes(value))) return false
  }
  return Object.entries(filters).every(([key, selectedValues]) => {
    if (!selectedValues.length) return true
    return selectedValues.includes(node.groupAttributes[key] ?? '')
  })
}

function reachableFrom(start: string, adjacency: Map<string, string[]>): Set<string> {
  const visited = new Set<string>([start])
  const pending = [start]
  while (pending.length) {
    const current = pending.shift()!
    ;(adjacency.get(current) ?? []).forEach((next) => {
      if (visited.has(next)) return
      visited.add(next)
      pending.push(next)
    })
  }
  return visited
}

function hiddenPathServices(nodes: ServiceMapNode[], edges: ServiceMapEdge[], matched: ServiceMapNode[]): Set<string> {
  if (matched.length < 2) return new Set()
  const forward = new Map<string, string[]>()
  const reverse = new Map<string, string[]>()
  edges.forEach((edge) => {
    forward.set(edge.source, [...(forward.get(edge.source) ?? []), edge.target])
    reverse.set(edge.target, [...(reverse.get(edge.target) ?? []), edge.source])
  })

  const fromMatches = new Map(matched.map((node) => [node.key, reachableFrom(node.key, forward)]))
  const toMatches = new Map(matched.map((node) => [node.key, reachableFrom(node.key, reverse)]))
  const hidden = new Set<string>()
  nodes
    .filter((node) => serviceIdentity(node) && !matched.some((match) => match.key === node.key))
    .forEach((node) => {
      const bridgesMatches = matched.some((source) =>
        matched.some(
          (target) =>
            source.key !== target.key &&
            fromMatches.get(source.key)?.has(node.key) &&
            toMatches.get(target.key)?.has(node.key)
        )
      )
      if (bridgesMatches) hidden.add(node.key)
    })
  return hidden
}

function hiddenComponents(hiddenKeys: Set<string>, edges: ServiceMapEdge[]): string[][] {
  const adjacency = new Map<string, Set<string>>()
  edges.forEach(({ source, target }) => {
    if (!hiddenKeys.has(source) || !hiddenKeys.has(target)) return
    adjacency.set(source, (adjacency.get(source) ?? new Set()).add(target))
    adjacency.set(target, (adjacency.get(target) ?? new Set()).add(source))
  })

  const visited = new Set<string>()
  const components: string[][] = []
  hiddenKeys.forEach((key) => {
    if (visited.has(key)) return
    const component = reachableFrom(key, new Map([...adjacency].map(([node, neighbours]) => [node, [...neighbours]])))
    component.forEach((member) => visited.add(member))
    components.push([...component].sort())
  })
  return components
}

function aggregateEdges(edges: ServiceMapEdge[], nodeMap: Map<string, ServiceMapDisplayNode>): ServiceMapEdge[] {
  const aggregates = new Map<string, ServiceMapEdge>()
  edges.forEach((edge) => {
    const source = nodeMap.get(edge.source)?.key
    const target = nodeMap.get(edge.target)?.key
    if (!source || !target || source === target) return
    const key = `${source}\0${target}`
    const aggregate = aggregates.get(key) ?? {
      key,
      source,
      target,
      requests: 0,
      errors: 0,
      unmatched: 0,
      durationSum: 0,
      durationCount: 0,
      durationMax: 0,
    }
    aggregate.requests += edge.requests
    aggregate.errors += edge.errors
    aggregate.unmatched += edge.unmatched
    aggregate.durationSum += edge.durationSum
    aggregate.durationCount += edge.durationCount
    aggregate.durationMax = Math.max(aggregate.durationMax, edge.durationMax)
    aggregates.set(key, aggregate)
  })
  return [...aggregates.values()]
}

export interface ServiceMapNodeLayout {
  x: number
  y: number
  /** Community / heap index. Used for same-group edge styling. */
  community: number
}

/** Soft max heaps per row (Datadog-like); width fit can wrap earlier. */
const HYBRID_HEAP_WRAP_AFTER = 4
/** Size ≤2 communities merge into their strongest neighbor (fewer lone heaps per band). */
const TINY_HEAP_MAX_SIZE = 2
/** Gap between heaps in a row / between stacked rows. */
const HEAP_ROW_GAP_X = 48
const HEAP_ROW_GAP_Y = 56
/** Minimum center-to-center gap so side labels do not collide inside a heap. */
const HEAP_NODE_GAP = 100
/** Extra margin around pack geometry for truncated side labels (~120px). */
const HEAP_LABEL_PAD = 60

/** Binary ring: no public error-rate tiers; Datadog uses monitors instead of % buckets. */
export type ServiceMapNodeHealth = 'ok' | 'danger' | 'neutral'

export interface ServiceMapNodeCallStats {
  /** request_count + unmatched_count across incident edges. */
  traffic: number
  /** Paired request_count on all incident edges (size / legacy). */
  requests: number
  errors: number
  /** Inbound (this node is target) paired RED. */
  inRequests: number
  inErrors: number
  /** Outbound (this node is source) paired RED. */
  outRequests: number
  outErrors: number
}

function edgeTraffic(edge: ServiceMapEdge): number {
  return Math.max(0, edge.requests) + Math.max(0, edge.unmatched)
}

function edgeWeight(edge: ServiceMapEdge): number {
  return Math.log1p(edgeTraffic(edge))
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

/**
 * Binary health with a noise floor: only ≥5% paired errors light up.
 * (No public multi-tier standard; Datadog node rings use monitors, not % buckets.)
 */
export function healthFromErrorRate(requests: number, errors: number): ServiceMapNodeHealth {
  if (requests <= 0) return 'neutral'
  return errors / requests >= 0.05 ? 'danger' : 'ok'
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
  const errorRatio = Math.min(1, Math.max(0, options.errorRatio))
  const errorLen = circumference * errorRatio
  const okLen = circumference - errorLen
  const fontMain = fitNodeStatFontSize(size, diskR, options.mainStat, 0.22, 7)
  const fontSec = fitNodeStatFontSize(size, diskR, options.secondaryStat, 0.165, 6)
  const mainY = cy - fontSec * 0.2
  const secY = cy + fontMain * 0.75
  const esc = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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

/**
 * Merge communities of size ≤ TINY_HEAP_MAX_SIZE into the neighbor community
 * with the strongest total call weight. Isolates (no edges) stay alone.
 */
export function absorbTinyCommunities(
  communityByNode: Map<string, string>,
  edges: ServiceMapEdge[],
  maxTinySize = TINY_HEAP_MAX_SIZE
): Map<string, string> {
  const result = new Map(communityByNode)

  for (let pass = 0; pass < 8; pass += 1) {
    const groups = new Map<string, string[]>()
    result.forEach((community, key) => {
      groups.set(community, [...(groups.get(community) ?? []), key])
    })
    const tiny = [...groups.entries()].find(([, members]) => members.length > 0 && members.length <= maxTinySize)
    if (!tiny) break
    const [, members] = tiny
    const memberSet = new Set(members)
    const weightByCommunity = new Map<string, number>()
    edges.forEach((edge) => {
      const weight = edgeWeight(edge)
      if (!weight) return
      const sourceCommunity = result.get(edge.source)
      const targetCommunity = result.get(edge.target)
      if (!sourceCommunity || !targetCommunity || sourceCommunity === targetCommunity) return
      if (memberSet.has(edge.source) && !memberSet.has(edge.target)) {
        weightByCommunity.set(targetCommunity, (weightByCommunity.get(targetCommunity) ?? 0) + weight)
      } else if (memberSet.has(edge.target) && !memberSet.has(edge.source)) {
        weightByCommunity.set(sourceCommunity, (weightByCommunity.get(sourceCommunity) ?? 0) + weight)
      }
    })
    let best: string | undefined
    let bestWeight = 0
    weightByCommunity.forEach((weight, other) => {
      if (weight > bestWeight) {
        best = other
        bestWeight = weight
      }
    })
    if (!best) break
    const targetCommunity = best
    members.forEach((key) => result.set(key, targetCommunity))
  }
  return result
}

/** Directed call depth from `calls` (src→dst). Isolates get maxDepth+1. */
function assignCallDepths(keys: string[], edges: ServiceMapEdge[]): Map<string, number> {
  const keySet = new Set(keys)
  const successors = new Map(keys.map((key) => [key, [] as string[]]))
  const predecessors = new Map(keys.map((key) => [key, [] as string[]]))
  edges.forEach((edge) => {
    if (edge.source === edge.target || !keySet.has(edge.source) || !keySet.has(edge.target)) return
    if (!edgeWeight(edge)) return
    const outs = successors.get(edge.source)
    const ins = predecessors.get(edge.target)
    if (outs) outs.push(edge.target)
    if (ins) ins.push(edge.source)
  })

  const connected = keys.filter(
    (key) => (predecessors.get(key)?.length ?? 0) > 0 || (successors.get(key)?.length ?? 0) > 0
  )
  const connectedSet = new Set(connected)
  const isolates = keys.filter((key) => !connectedSet.has(key))

  const remaining = new Set(connected)
  const inDegree = new Map(
    connected.map((key) => [key, (predecessors.get(key) ?? []).filter((pred) => remaining.has(pred)).length])
  )
  const order: string[] = []
  while (remaining.size) {
    const roots = [...remaining].filter((key) => (inDegree.get(key) ?? 0) <= 0).sort()
    const batch = roots.length ? roots : [[...remaining].sort()[0]]
    batch.forEach((key) => {
      remaining.delete(key)
      order.push(key)
      ;(successors.get(key) ?? []).forEach((target) => {
        if (!remaining.has(target)) return
        inDegree.set(target, Math.max(0, (inDegree.get(target) ?? 0) - 1))
      })
    })
  }

  const depth = new Map<string, number>()
  order.forEach((key) => {
    const incoming = (predecessors.get(key) ?? [])
      .map((pred) => depth.get(pred))
      .filter((value): value is number => value !== undefined)
    depth.set(key, incoming.length ? Math.max(...incoming) + 1 : 0)
  })
  const maxDepth = order.length ? Math.max(0, ...depth.values()) : 0
  isolates.forEach((key) => depth.set(key, maxDepth + (order.length ? 1 : 0)))
  keys.forEach((key) => {
    if (!depth.has(key)) depth.set(key, 0)
  })
  return depth
}

/** Louvain-style communities + undirected weighted degree (calls edge weight). */
function detectLouvainCommunities(
  keys: string[],
  edges: ServiceMapEdge[]
): { communityByNode: Map<string, string>; degree: Map<string, number> } {
  const adjacency = new Map(keys.map((key) => [key, new Map<string, number>()]))
  edges.forEach((edge) => {
    if (edge.source === edge.target || !adjacency.has(edge.source) || !adjacency.has(edge.target)) return
    const weight = edgeWeight(edge)
    if (!weight) return
    const forward = adjacency.get(edge.source)
    const backward = adjacency.get(edge.target)
    if (!forward || !backward) return
    forward.set(edge.target, (forward.get(edge.target) ?? 0) + weight)
    backward.set(edge.source, (backward.get(edge.source) ?? 0) + weight)
  })

  const degree = new Map(
    keys.map((key) => {
      const neighbours = adjacency.get(key)
      const sum = neighbours ? [...neighbours.values()].reduce((acc, value) => acc + value, 0) : 0
      return [key, sum]
    })
  )
  const totalWeight = [...degree.values()].reduce((sum, value) => sum + value, 0) / 2
  const communityByNode = new Map(keys.map((key) => [key, key]))
  const communityDegree = new Map(keys.map((key) => [key, degree.get(key) ?? 0]))

  if (totalWeight > 0) {
    for (let pass = 0; pass < 30; pass += 1) {
      let moved = false
      keys.forEach((key) => {
        const current = communityByNode.get(key) ?? key
        const nodeDegree = degree.get(key) ?? 0
        communityDegree.set(current, (communityDegree.get(current) ?? 0) - nodeDegree)
        const weightsByCommunity = new Map<string, number>()
        ;(adjacency.get(key) ?? new Map()).forEach((weight, neighbour) => {
          const community = communityByNode.get(neighbour) ?? neighbour
          weightsByCommunity.set(community, (weightsByCommunity.get(community) ?? 0) + weight)
        })
        let best = current
        let bestGain = Number.NEGATIVE_INFINITY
        new Set([...weightsByCommunity.keys(), current]).forEach((community) => {
          const gain =
            (weightsByCommunity.get(community) ?? 0) -
            (nodeDegree * (communityDegree.get(community) ?? 0)) / (2 * totalWeight)
          if (gain > bestGain + 1e-9 || (Math.abs(gain - bestGain) <= 1e-9 && community === current)) {
            best = community
            bestGain = gain
          }
        })
        communityByNode.set(key, best)
        communityDegree.set(best, (communityDegree.get(best) ?? 0) + nodeDegree)
        if (best !== current) moved = true
      })
      if (!moved) break
    }
  }

  return { communityByNode, degree }
}

/** Heaviest neighbor for inferred/virtual nodes (prefer caller when this node is the callee). */
function primaryNeighbor(
  key: string,
  edges: ServiceMapEdge[],
  allowed: Set<string>
): { neighbour: string; asTarget: boolean } | undefined {
  let best: { neighbour: string; asTarget: boolean; weight: number } | undefined
  edges.forEach((edge) => {
    const weight = edgeTraffic(edge)
    if (!weight) return
    if (edge.target === key && allowed.has(edge.source)) {
      if (!best || weight > best.weight || (weight === best.weight && !best.asTarget)) {
        best = { neighbour: edge.source, asTarget: true, weight }
      }
      return
    }
    if (edge.source === key && allowed.has(edge.target)) {
      if (!best || weight > best.weight) {
        best = { neighbour: edge.target, asTarget: false, weight }
      }
    }
  })
  return best ? { neighbour: best.neighbour, asTarget: best.asTarget } : undefined
}

/** Pull inferred endpoints below/aside their heaviest real caller (clears parent labels). */
function anchorInferredNearCallers(
  layout: Map<string, ServiceMapNodeLayout>,
  nodes: ServiceMapDisplayNode[],
  edges: ServiceMapEdge[],
  offsetX = 72,
  offsetY = 56
): void {
  const realKeys = new Set(nodes.filter((node) => !node.virtual).map((node) => node.key))
  const byCaller = new Map<string, string[]>()
  nodes
    .filter((node) => node.virtual)
    .sort((left, right) => left.key.localeCompare(right.key))
    .forEach((node) => {
      const link = primaryNeighbor(node.key, edges, realKeys)
      if (!link) return
      byCaller.set(link.neighbour, [...(byCaller.get(link.neighbour) ?? []), node.key])
    })
  byCaller.forEach((inferredKeys, callerKey) => {
    const neighbour = layout.get(callerKey)
    if (!neighbour) return
    inferredKeys.forEach((key, slot) => {
      const self = layout.get(key)
      const link = primaryNeighbor(key, edges, realKeys)
      if (!self || !link) return
      const fan = (slot - (inferredKeys.length - 1) / 2) * 52
      // Prefer below the caller so side labels on the parent stay readable.
      self.x = neighbour.x + (link.asTarget ? offsetX : -offsetX * 0.35) + fan * 0.35
      self.y = neighbour.y + offsetY + fan
      self.community = neighbour.community
    })
  })
}

/** Content radius for hub+satellites (shared by sizing and placement). */
function heapContentRadius(satelliteCount: number): number {
  return Math.min(170, Math.max(HEAP_NODE_GAP, 60 + satelliteCount * 12))
}

/**
 * Intrinsic bounding box for a heap from member count (content + label pad).
 * Canvas-independent — used to decide how many heaps fit per row.
 */
export function heapIntrinsicSize(memberCount: number): { width: number; height: number } {
  const n = Math.max(1, memberCount)
  if (n === 1) {
    const side = 48 + HEAP_LABEL_PAD * 2
    return { width: side, height: side }
  }
  if (n === 2) {
    const half = HEAP_NODE_GAP * 0.58
    const span = half * 2 + HEAP_LABEL_PAD * 2
    return { width: span, height: span }
  }
  const box = 2 * (heapContentRadius(n - 1) * 1.02 + HEAP_LABEL_PAD)
  return { width: box, height: box }
}

interface PackedHeap {
  members: string[]
  width: number
  height: number
}

interface PackedHeapRow {
  heaps: PackedHeap[]
  width: number
  height: number
}

/**
 * First-fit rows by canvas width; soft-cap at HYBRID_HEAP_WRAP_AFTER.
 * Oversized single heaps scale down to fit the canvas (aspect kept).
 */
export function packHeapRows(
  groups: string[][],
  canvasWidth: number,
  maxPerRow = HYBRID_HEAP_WRAP_AFTER
): PackedHeapRow[] {
  const rows: PackedHeapRow[] = []
  let current: PackedHeap[] = []
  let currentWidth = 0

  const flush = () => {
    if (!current.length) return
    rows.push({
      heaps: current,
      width: currentWidth,
      height: Math.max(...current.map((heap) => heap.height)),
    })
    current = []
    currentWidth = 0
  }

  groups.forEach((members) => {
    const intrinsic = heapIntrinsicSize(members.length)
    let { width } = intrinsic
    let { height } = intrinsic
    if (width > canvasWidth) {
      const scale = canvasWidth / width
      width = canvasWidth
      height *= scale
    }
    const gap = current.length ? HEAP_ROW_GAP_X : 0
    const needsWrap = current.length > 0 && (current.length >= maxPerRow || currentWidth + gap + width > canvasWidth)
    if (needsWrap) flush()
    const nextGap = current.length ? HEAP_ROW_GAP_X : 0
    current.push({ members, width, height })
    currentWidth += nextGap + width
  })
  flush()
  return rows
}

/**
 * Pack a heap as hub + satellites inside an already-sized cell (no stretch).
 */
function placeCompactHeap(
  result: Map<string, ServiceMapNodeLayout>,
  members: string[],
  centerX: number,
  top: number,
  cellWidth: number,
  cellHeight: number,
  community: number,
  degree: Map<string, number>
): void {
  const centerY = top + cellHeight / 2
  const ordered = [...members].sort(
    (left, right) => (degree.get(right) ?? 0) - (degree.get(left) ?? 0) || left.localeCompare(right)
  )
  if (ordered.length === 1) {
    result.set(ordered[0], { x: centerX, y: centerY, community })
    return
  }
  if (ordered.length === 2) {
    const half = Math.min(HEAP_NODE_GAP * 0.58, cellWidth * 0.3, cellHeight * 0.3)
    result.set(ordered[0], { x: centerX - half, y: centerY - half * 0.9, community })
    result.set(ordered[1], { x: centerX + half, y: centerY + half * 0.9, community })
    return
  }

  const [hub, ...satellites] = ordered
  result.set(hub, { x: centerX, y: centerY, community })
  const radius = Math.min(heapContentRadius(satellites.length), cellWidth * 0.38, cellHeight * 0.34)
  satellites.forEach((key, index) => {
    const angle = (2 * Math.PI * index) / satellites.length - Math.PI / 2
    const rScale = 0.92 + (index % 2) * 0.1
    result.set(key, {
      x: centerX + Math.cos(angle) * radius * rScale,
      y: centerY + Math.sin(angle) * radius * rScale,
      community,
    })
  })
}

/**
 * Hybrid overview: Louvain heaps as compact clusters, ordered left→right by mean call depth.
 * Tiny heaps absorb into neighbors; isolates park in the bottom-right.
 */
export function buildServiceMapHybridLayout(
  nodes: ServiceMapDisplayNode[],
  edges: ServiceMapEdge[],
  width: number,
  height: number
): Map<string, ServiceMapNodeLayout> {
  if (!nodes.length) return new Map()
  const keys = nodes.map((node) => node.key).sort()
  const depth = assignCallDepths(keys, edges)
  const { communityByNode, degree } = detectLouvainCommunities(keys, edges)
  const absorbed = absorbTinyCommunities(communityByNode, edges)

  const connectedKeys = new Set<string>()
  edges.forEach((edge) => {
    if (!edgeWeight(edge)) return
    connectedKeys.add(edge.source)
    connectedKeys.add(edge.target)
  })
  const isolates = keys.filter((key) => !connectedKeys.has(key))
  const placedKeys = keys.filter((key) => connectedKeys.has(key))

  const groups = new Map<string, string[]>()
  placedKeys.forEach((key) => {
    const community = absorbed.get(key) ?? key
    groups.set(community, [...(groups.get(community) ?? []), key])
  })

  const meanDepth = (members: string[]) =>
    members.reduce((sum, key) => sum + (depth.get(key) ?? 0), 0) / Math.max(1, members.length)

  const groupList = [...groups.values()].sort((left, right) => {
    const depthDiff = meanDepth(left) - meanDepth(right)
    if (Math.abs(depthDiff) > 1e-9) return depthDiff
    const degreeDiff =
      right.reduce((sum, key) => sum + (degree.get(key) ?? 0), 0) -
      left.reduce((sum, key) => sum + (degree.get(key) ?? 0), 0)
    return degreeDiff || left[0].localeCompare(right[0])
  })

  const horizontalInset = 72
  const verticalInset = 48
  const bottomReserve = isolates.length ? 72 : 28
  const canvasWidth = Math.max(500, width - horizontalInset * 2)
  const canvasHeight = Math.max(420, height - verticalInset * 2 - bottomReserve)
  const packedRows = packHeapRows(groupList, canvasWidth)
  const blockHeight =
    packedRows.reduce((sum, row) => sum + row.height, 0) + HEAP_ROW_GAP_Y * Math.max(0, packedRows.length - 1)
  const blockTop = verticalInset + Math.max(0, (canvasHeight - blockHeight) / 2)
  const result = new Map<string, ServiceMapNodeLayout>()
  let community = 0
  let rowTop = blockTop

  packedRows.forEach((row) => {
    // Center the row; leftover width becomes empty margin, not inflated packs.
    let cursor = horizontalInset + Math.max(0, (canvasWidth - row.width) / 2)
    row.heaps.forEach((heap) => {
      const centerX = cursor + heap.width * 0.5
      const packTop = rowTop + Math.max(0, (row.height - heap.height) / 2)
      placeCompactHeap(result, heap.members, centerX, packTop, heap.width, heap.height, community, degree)
      community += 1
      cursor += heap.width + HEAP_ROW_GAP_X
    })
    rowTop += row.height + HEAP_ROW_GAP_Y
  })

  // Park isolates just under the main graph footprint (not the far canvas corner).
  isolates.forEach((key, index) => {
    const count = isolates.length
    result.set(key, {
      x: horizontalInset + canvasWidth * 0.5 + (index - (count - 1) / 2) * 100,
      y: Math.max(blockTop + blockHeight, verticalInset + canvasHeight) + 36,
      community: 10_000 + index,
    })
  })

  const avgHeapWidth =
    packedRows.reduce((sum, row) => sum + row.width / Math.max(1, row.heaps.length), 0) / Math.max(1, packedRows.length)
  anchorInferredNearCallers(
    result,
    nodes,
    edges,
    Math.min(96, Math.max(72, avgHeapWidth * 0.28)),
    Math.min(72, Math.max(52, (packedRows[0]?.height ?? 160) * 0.18))
  )
  return result
}

/**
 * Left→right columns by directed call depth only (no Louvain heaps). Kept for tests / experiments.
 */
export function buildServiceMapLayeredLayout(
  nodes: ServiceMapDisplayNode[],
  edges: ServiceMapEdge[],
  width: number,
  height: number
): Map<string, ServiceMapNodeLayout> {
  if (!nodes.length) return new Map()
  const keys = nodes.map((node) => node.key).sort()
  const depth = assignCallDepths(keys, edges)
  const { degree } = detectLouvainCommunities(keys, edges)
  const virtualKeys = new Set(nodes.filter((node) => node.virtual).map((node) => node.key))

  const layers = new Map<number, string[]>()
  keys.forEach((key) => {
    const layer = depth.get(key) ?? 0
    layers.set(layer, [...(layers.get(layer) ?? []), key])
  })
  const layerIndexes = [...layers.keys()].sort((a, b) => a - b)
  const horizontalInset = 72
  const verticalInset = 48
  const canvasWidth = Math.max(480, width - horizontalInset * 2)
  const canvasHeight = Math.max(320, height - verticalInset * 2)
  const colWidth = canvasWidth / Math.max(1, layerIndexes.length)
  const result = new Map<string, ServiceMapNodeLayout>()

  layerIndexes.forEach((layer, column) => {
    const members = [...(layers.get(layer) ?? [])].sort((left, right) => {
      const virtualDiff = Number(virtualKeys.has(left)) - Number(virtualKeys.has(right))
      return virtualDiff || (degree.get(right) ?? 0) - (degree.get(left) ?? 0) || left.localeCompare(right)
    })
    placeCompactHeap(
      result,
      members,
      horizontalInset + (column + 0.5) * colWidth,
      verticalInset,
      colWidth,
      canvasHeight,
      layer,
      degree
    )
  })

  anchorInferredNearCallers(result, nodes, edges, Math.min(56, colWidth * 0.28))
  return result
}

/** @deprecated Prefer buildServiceMapHybridLayout — ring packing replaced by vertical heaps. */
export function buildServiceMapCommunityLayout(
  nodes: ServiceMapDisplayNode[],
  edges: ServiceMapEdge[],
  width: number,
  height: number
): Map<string, ServiceMapNodeLayout> {
  return buildServiceMapHybridLayout(nodes, edges, width, height)
}

/** Overview: community heaps as vertical columns ordered by mean call depth. */
export function buildServiceMapOverviewLayout(
  nodes: ServiceMapDisplayNode[],
  edges: ServiceMapEdge[],
  width: number,
  height: number
): Map<string, ServiceMapNodeLayout> {
  return buildServiceMapHybridLayout(nodes, edges, width, height)
}

/** Inspect view: center node, upstream callers on the left, downstream callees on the right. */
export function buildServiceMapFocusLayout(
  centerKey: string,
  nodes: ServiceMapDisplayNode[],
  edges: ServiceMapEdge[],
  width: number,
  height: number
): Map<string, ServiceMapNodeLayout> {
  if (!nodes.length) return new Map()
  const hasCenter = nodes.some((node) => node.key === centerKey)
  if (!hasCenter) return buildServiceMapOverviewLayout(nodes, edges, width, height)

  const upstreamWeight = new Map<string, number>()
  const downstreamWeight = new Map<string, number>()
  edges.forEach((edge) => {
    const weight = edgeTraffic(edge)
    if (edge.target === centerKey && edge.source !== centerKey) {
      upstreamWeight.set(edge.source, (upstreamWeight.get(edge.source) ?? 0) + weight)
    } else if (edge.source === centerKey && edge.target !== centerKey) {
      downstreamWeight.set(edge.target, (downstreamWeight.get(edge.target) ?? 0) + weight)
    }
  })

  const upstream = nodes
    .filter((node) => node.key !== centerKey && upstreamWeight.has(node.key))
    .sort(
      (left, right) =>
        (upstreamWeight.get(right.key) ?? 0) - (upstreamWeight.get(left.key) ?? 0) ||
        left.label.localeCompare(right.label)
    )
  const downstream = nodes
    .filter((node) => node.key !== centerKey && downstreamWeight.has(node.key) && !upstreamWeight.has(node.key))
    .sort(
      (left, right) =>
        (downstreamWeight.get(right.key) ?? 0) - (downstreamWeight.get(left.key) ?? 0) ||
        left.label.localeCompare(right.label)
    )
  // Bidirectional leftovers already in upstream; orphans (no edge to center) go bottom.
  const orphans = nodes
    .filter((node) => node.key !== centerKey && !upstreamWeight.has(node.key) && !downstreamWeight.has(node.key))
    .sort((left, right) => left.label.localeCompare(right.label))

  const centerX = width / 2
  const centerY = height / 2
  const result = new Map<string, ServiceMapNodeLayout>([[centerKey, { x: centerX, y: centerY, community: 0 }]])

  const placeColumn = (columnNodes: ServiceMapDisplayNode[], x: number, community: number) => {
    const count = Math.max(1, columnNodes.length)
    columnNodes.forEach((node, index) => {
      const y = 48 + ((index + 0.5) / count) * Math.max(240, height - 96)
      result.set(node.key, { x, y, community })
    })
  }

  const sideGap = Math.min(220, Math.max(120, width * 0.28))
  placeColumn(upstream, centerX - sideGap, 1)
  placeColumn(downstream, centerX + sideGap, 2)
  orphans.forEach((node, index) => {
    const count = orphans.length
    result.set(node.key, {
      x: centerX + (index - (count - 1) / 2) * 100,
      y: height - 48,
      community: 3,
    })
  })

  anchorInferredNearCallers(result, nodes, edges, 36)
  return result
}

export function buildServiceMapDisplayGraph(args: {
  nodes: ServiceMapNode[]
  edges: ServiceMapEdge[]
  /** Selected real-service labels (or ids). Empty = no service filter. */
  selectedServices?: string[]
  /** First-class env/scope values. Empty = all environments. */
  selectedScopes?: string[]
  filters?: ServiceMapFilters
  inspectNodeKey?: string
  expandedClusters?: Set<string>
  clusterLabel?: (count: number) => string
}): ServiceMapDisplayGraph {
  const {
    nodes,
    edges,
    selectedServices = [],
    selectedScopes = [],
    filters = {},
    inspectNodeKey,
    expandedClusters = new Set(),
  } = args
  const rawNodes = new Map(nodes.map((node) => [node.key, node]))
  const activeFilters = Object.values(filters).some((values) => values.length > 0)
  const filtering = activeFilters || selectedServices.length > 0 || selectedScopes.length > 0

  if (inspectNodeKey) {
    const adjacent = new Set<string>([inspectNodeKey])
    edges.forEach((edge) => {
      if (edge.source === inspectNodeKey) adjacent.add(edge.target)
      if (edge.target === inspectNodeKey) adjacent.add(edge.source)
    })
    const displayNodes = nodes.filter((node) => adjacent.has(node.key)).map(toDisplayNode)
    const displayMap = new Map(displayNodes.map((node) => [node.key, node]))
    return { nodes: displayNodes, edges: aggregateEdges(edges, displayMap) }
  }

  if (!filtering) {
    const displayNodes = nodes.map(toDisplayNode)
    const displayMap = new Map(displayNodes.map((node) => [node.key, node]))
    return { nodes: displayNodes, edges: aggregateEdges(edges, displayMap) }
  }

  const matchedServices = nodes.filter(
    (node) => serviceIdentity(node) && nodeMatchesFilters(node, selectedServices, filters, selectedScopes)
  )
  if (!matchedServices.length) return { nodes: [], edges: [] }

  const hiddenKeys = hiddenPathServices(nodes, edges, matchedServices)
  const componentKeys = hiddenComponents(hiddenKeys, edges)
  const hiddenNodeMap = new Map<string, string>()
  const displayNodes: ServiceMapDisplayNode[] = matchedServices.map(toDisplayNode)

  componentKeys.forEach((members) => {
    const clusterKey = `cluster:${members.join('\0')}`
    const expanded = expandedClusters.has(clusterKey)
    const hiddenServices = members
      .map((key) => rawNodes.get(key))
      .filter((node): node is ServiceMapNode => Boolean(node))
    if (expanded) {
      hiddenServices.forEach((service) => {
        displayNodes.push(toDisplayNode(service))
      })
    } else {
      displayNodes.push({
        key: clusterKey,
        label: args.clusterLabel?.(members.length) ?? `${members.length} hidden services`,
        type: 'cluster',
        virtual: false,
        members: hiddenServices,
        cluster: true,
      })
    }
    members.forEach((key) => hiddenNodeMap.set(key, expanded ? key : clusterKey))
  })

  const matchedKeys = new Set(matchedServices.map((node) => node.key))
  const displayMap = new Map(displayNodes.map((node) => [node.key, node]))
  hiddenNodeMap.forEach((displayKey) => {
    if (displayMap.has(displayKey)) return
    const cluster = componentKeys.find((members) => members.some((key) => hiddenNodeMap.get(key) === displayKey))
    if (!cluster) return
    const members = cluster.map((key) => rawNodes.get(key)).filter((node): node is ServiceMapNode => Boolean(node))
    displayMap.set(displayKey, {
      key: displayKey,
      label: args.clusterLabel?.(members.length) ?? `${members.length} hidden services`,
      type: 'cluster',
      virtual: false,
      members,
      cluster: true,
    })
  })

  if (matchedServices.length === 1) {
    const onlyMatch = matchedServices[0]
    edges.forEach((edge) => {
      let neighbourKey = ''
      if (edge.source === onlyMatch.key) neighbourKey = edge.target
      else if (edge.target === onlyMatch.key) neighbourKey = edge.source
      const neighbour = rawNodes.get(neighbourKey)
      if (!neighbour || hiddenKeys.has(neighbour.key) || displayMap.has(neighbour.key)) return
      if (neighbour.virtual || serviceIdentity(neighbour)) {
        const displayNode = toDisplayNode(neighbour)
        displayNodes.push(displayNode)
        displayMap.set(neighbour.key, displayNode)
      }
    })
  } else {
    edges.forEach((edge) => {
      let endpointKey = ''
      if (matchedKeys.has(edge.source)) endpointKey = edge.target
      else if (matchedKeys.has(edge.target)) endpointKey = edge.source
      const endpoint = rawNodes.get(endpointKey)
      if (!endpoint?.virtual || displayMap.has(endpoint.key)) return
      const displayNode = toDisplayNode(endpoint)
      displayNodes.push(displayNode)
      displayMap.set(endpoint.key, displayNode)
    })
  }

  const remappedEdges = edges
    .filter(
      (edge) =>
        matchedKeys.has(edge.source) ||
        matchedKeys.has(edge.target) ||
        hiddenKeys.has(edge.source) ||
        hiddenKeys.has(edge.target)
    )
    .map((edge) => ({
      ...edge,
      source: hiddenNodeMap.get(edge.source) ?? edge.source,
      target: hiddenNodeMap.get(edge.target) ?? edge.target,
    }))
  return { nodes: displayNodes, edges: aggregateEdges(remappedEdges, displayMap) }
}
