import { isStructuralEntityType } from '../../traces/service-map-queries'
import { edgeTraffic, isCallEdge } from './metrics'
import type { ServiceMapDisplayNode, ServiceMapEdge, ServiceMapNodeLayout } from './types'

/** Center distance from a service to its instance satellites. */
const STRUCTURAL_INSTANCE_RADIUS = 72
/** Extra offset from an instance to its container along the same outward axis. */
const STRUCTURAL_CONTAINER_OFFSET = 52
/** Soft min distance to other backbone nodes; at most a couple of push steps. */
const STRUCTURAL_CLEARANCE = 72
const STRUCTURAL_PUSH_STEP = 20
const STRUCTURAL_PUSH_MAX = 2
const STRUCTURAL_FAN_GAP = 48

type Cardinal = { dx: number; dy: number }

/** Soft max heaps per row (Datadog-like); width fit can wrap earlier. */
const HYBRID_HEAP_WRAP_AFTER = 4
/** Size ≤2 communities merge into their strongest neighbor (fewer lone heaps per band). */
const TINY_HEAP_MAX_SIZE = 2
/** Gap between heaps in a row / between stacked rows. */
const HEAP_ROW_GAP_X = 24
const HEAP_ROW_GAP_Y = 20
/** Minimum center-to-center gap inside a heap (titles sit below, so vertical needs more room). */
const HEAP_NODE_GAP = 78
/** Side margin around pack geometry (edges + truncated titles). */
const HEAP_LABEL_PAD_X = 28
/** Extra height under each heap for bottom titles (~11px + padding + distance). */
const HEAP_LABEL_PAD_Y = 36
/** Gap between the lowest real node and the isolate row. */
const ISOLATE_ROW_GAP = 64
const ISOLATE_NODE_GAP = 96

function edgeWeight(edge: ServiceMapEdge): number {
  return Math.log1p(edgeTraffic(edge))
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
  offsetX = 96,
  offsetY = 92
): void {
  const realKeys = new Set(
    nodes.filter((node) => !node.virtual && !isStructuralEntityType(node.type)).map((node) => node.key)
  )
  const callEdges = edges.filter(isCallEdge)
  const byCaller = new Map<string, string[]>()
  nodes
    .filter((node) => node.virtual)
    .sort((left, right) => left.key.localeCompare(right.key))
    .forEach((node) => {
      const link = primaryNeighbor(node.key, callEdges, realKeys)
      if (!link) return
      byCaller.set(link.neighbour, [...(byCaller.get(link.neighbour) ?? []), node.key])
    })
  byCaller.forEach((inferredKeys, callerKey) => {
    const neighbour = layout.get(callerKey)
    if (!neighbour) return
    inferredKeys.forEach((key, slot) => {
      const self = layout.get(key)
      const link = primaryNeighbor(key, callEdges, realKeys)
      if (!self || !link) return
      const fan = (slot - (inferredKeys.length - 1) / 2) * 70
      // Sit below-right of the caller so the parent's bottom title stays clear.
      self.x = neighbour.x + (link.asTarget ? offsetX : offsetX * 0.55) + fan
      self.y = neighbour.y + offsetY + Math.abs(fan) * 0.25
      self.community = neighbour.community
    })
  })
}

function isBackboneDisplayNode(node: ServiceMapDisplayNode): boolean {
  if (node.cluster || node.members) return true
  if (node.virtual) return true
  return !isStructuralEntityType(node.type)
}

type Point = { key: string; x: number; y: number }

function minObstacleDistance(x: number, y: number, obstacles: Point[], ignoreKey?: string): number {
  let best = Infinity
  obstacles.forEach((obstacle) => {
    if (obstacle.key === ignoreKey) return
    best = Math.min(best, Math.hypot(x - obstacle.x, y - obstacle.y))
  })
  return best
}

/** At most STRUCTURAL_PUSH_MAX steps outward if overlapping another backbone node. */
function nudgeOutward(x: number, y: number, dir: Cardinal, obstacles: Point[], ignoreKey?: string): Point {
  let nextX = x
  let nextY = y
  for (let step = 0; step < STRUCTURAL_PUSH_MAX; step += 1) {
    if (minObstacleDistance(nextX, nextY, obstacles, ignoreKey) >= STRUCTURAL_CLEARANCE) break
    nextX += dir.dx * STRUCTURAL_PUSH_STEP
    nextY += dir.dy * STRUCTURAL_PUSH_STEP
  }
  return { key: '', x: nextX, y: nextY }
}

/** Cardinal away from the call-graph centroid (top services → up, left → left, …). */
function outwardCardinal(anchor: { x: number; y: number }, centroid: { x: number; y: number }): Cardinal {
  const vx = anchor.x - centroid.x
  const vy = anchor.y - centroid.y
  return Math.abs(vx) >= Math.abs(vy) ? { dx: vx >= 0 ? 1 : -1, dy: 0 } : { dx: 0, dy: vy >= 0 ? 1 : -1 }
}

function fanOffset(dir: Cardinal, index: number, count: number): { x: number; y: number } {
  const along = (index - (count - 1) / 2) * STRUCTURAL_FAN_GAP
  return dir.dx !== 0 ? { x: 0, y: along } : { x: along, y: 0 }
}

/**
 * Hang satellites just outside their owning service on the outer rim (away from
 * the call-graph centroid). Call after the backbone has been fit to the viewport.
 */
export function placeStructuralAnchors(
  layout: Map<string, ServiceMapNodeLayout>,
  nodes: ServiceMapDisplayNode[],
  edges: ServiceMapEdge[]
): void {
  const nodeByKey = new Map(nodes.map((node) => [node.key, node]))
  const instanceDir = new Map<string, Cardinal>()

  const backbone: Point[] = []
  let sumX = 0
  let sumY = 0
  layout.forEach((point, key) => {
    const node = nodeByKey.get(key)
    if (node && isStructuralEntityType(node.type)) return
    backbone.push({ key, x: point.x, y: point.y })
    sumX += point.x
    sumY += point.y
  })
  const obstacles = [...backbone]
  const centroid = backbone.length ? { x: sumX / backbone.length, y: sumY / backbone.length } : { x: 0, y: 0 }

  const instancesByService = new Map<string, string[]>()
  edges.forEach((edge) => {
    if ((edge.relType || '') !== 'part_of') return
    if (!nodeByKey.has(edge.source) || !layout.has(edge.target)) return
    instancesByService.set(edge.target, [...(instancesByService.get(edge.target) ?? []), edge.source])
  })

  instancesByService.forEach((instanceKeys, serviceKey) => {
    const anchor = layout.get(serviceKey)
    if (!anchor) return
    const unique = [...new Set(instanceKeys)].sort()
    const dir = outwardCardinal(anchor, centroid)
    unique.forEach((key, index) => {
      const fan = fanOffset(dir, index, unique.length)
      const placed = nudgeOutward(
        anchor.x + dir.dx * STRUCTURAL_INSTANCE_RADIUS + fan.x,
        anchor.y + dir.dy * STRUCTURAL_INSTANCE_RADIUS + fan.y,
        dir,
        obstacles,
        serviceKey
      )
      instanceDir.set(key, dir)
      layout.set(key, { x: placed.x, y: placed.y, community: anchor.community })
      obstacles.push({ key, x: placed.x, y: placed.y })
    })
  })

  const containersByInstance = new Map<string, string[]>()
  edges.forEach((edge) => {
    if ((edge.relType || '') !== 'runs_on') return
    if (!layout.has(edge.source) || !nodeByKey.has(edge.target)) return
    containersByInstance.set(edge.source, [...(containersByInstance.get(edge.source) ?? []), edge.target])
  })

  containersByInstance.forEach((containerKeys, instanceKey) => {
    const anchor = layout.get(instanceKey)
    if (!anchor) return
    const dir = instanceDir.get(instanceKey) ?? { dx: 1, dy: 0 }
    const unique = [...new Set(containerKeys)].sort()
    unique.forEach((key, slot) => {
      const fan = fanOffset(dir, slot, unique.length)
      const placed = nudgeOutward(
        anchor.x + dir.dx * STRUCTURAL_CONTAINER_OFFSET + fan.x,
        anchor.y + dir.dy * STRUCTURAL_CONTAINER_OFFSET + fan.y,
        dir,
        obstacles,
        instanceKey
      )
      layout.set(key, { x: placed.x, y: placed.y, community: anchor.community })
      obstacles.push({ key, x: placed.x, y: placed.y })
    })
  })
}

/** Content radius for hub+satellites (shared by sizing and placement). */
function heapContentRadius(satelliteCount: number): number {
  return Math.min(132, Math.max(HEAP_NODE_GAP * 0.92, 48 + satelliteCount * 14))
}

/**
 * Intrinsic bounding box for a heap from member count (content + label pad).
 * Canvas-independent — used to decide how many heaps fit per row.
 * Height is taller than width so bottom titles have a reserved band.
 */
export function heapIntrinsicSize(memberCount: number): { width: number; height: number } {
  const n = Math.max(1, memberCount)
  if (n === 1) {
    return {
      width: 44 + HEAP_LABEL_PAD_X * 2,
      height: 44 + HEAP_LABEL_PAD_X + HEAP_LABEL_PAD_Y,
    }
  }
  if (n === 2) {
    const half = HEAP_NODE_GAP * 0.5
    return {
      width: half * 2 + HEAP_LABEL_PAD_X * 2,
      height: half * 1.8 + HEAP_LABEL_PAD_X + HEAP_LABEL_PAD_Y,
    }
  }
  const radius = heapContentRadius(n - 1) * 1.02
  return {
    width: 2 * (radius + HEAP_LABEL_PAD_X),
    height: 2 * (radius + HEAP_LABEL_PAD_X * 0.6) + HEAP_LABEL_PAD_Y,
  }
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
    const half = Math.min(HEAP_NODE_GAP * 0.5, cellWidth * 0.32, cellHeight * 0.28)
    // Bias upward so the lower node's bottom title stays inside the cell.
    const cy = centerY - HEAP_LABEL_PAD_Y * 0.2
    result.set(ordered[0], { x: centerX - half, y: cy - half * 0.75, community })
    result.set(ordered[1], { x: centerX + half, y: cy + half * 0.75, community })
    return
  }

  const [hub, ...satellites] = ordered
  const cy = centerY - HEAP_LABEL_PAD_Y * 0.25
  result.set(hub, { x: centerX, y: cy, community })
  const radius = Math.min(heapContentRadius(satellites.length), cellWidth * 0.4, cellHeight * 0.36)
  satellites.forEach((key, index) => {
    const angle = (2 * Math.PI * index) / satellites.length - Math.PI / 2
    const rScale = 0.9 + (index % 2) * 0.08
    result.set(key, {
      x: centerX + Math.cos(angle) * radius * rScale,
      y: cy + Math.sin(angle) * radius * rScale,
      community,
    })
  })
}

/**
 * Rebase layout to the viewport inset (top-left) at natural scale — same
 * spacing as the overview page. No enlarge/shrink; roam/pan for overflow.
 */
export function fitLayoutToViewport(
  layout: Map<string, ServiceMapNodeLayout>,
  _width: number,
  _height: number,
  insetX = 72,
  insetY = 48
): void {
  if (layout.size === 0) return
  let minX = Infinity
  let minY = Infinity
  layout.forEach((point) => {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
  })
  const pad = 72
  layout.forEach((point, key) => {
    layout.set(key, {
      ...point,
      x: insetX + pad * 0.5 + (point.x - minX),
      y: insetY + pad * 0.5 + (point.y - minY),
    })
  })
}

/**
 * Overview: Louvain heaps as compact clusters, ordered left→right by mean call depth.
 * Tiny heaps absorb into neighbors; isolates park just under the main block.
 * Structural satellites (instance / container) are placed after the call backbone.
 */
export function buildServiceMapOverviewLayout(
  nodes: ServiceMapDisplayNode[],
  edges: ServiceMapEdge[],
  width: number,
  height: number
): Map<string, ServiceMapNodeLayout> {
  if (!nodes.length) return new Map()
  const backboneNodes = nodes.filter(isBackboneDisplayNode)
  const callEdges = edges.filter(isCallEdge)
  const keys = backboneNodes.map((node) => node.key).sort()
  const depth = assignCallDepths(keys, callEdges)
  const { communityByNode, degree } = detectLouvainCommunities(keys, callEdges)
  const absorbed = absorbTinyCommunities(communityByNode, callEdges)

  const connectedKeys = new Set<string>()
  callEdges.forEach((edge) => {
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
  const canvasWidth = Math.max(500, width - horizontalInset * 2)
  const packedRows = packHeapRows(groupList, canvasWidth)
  // Top-align the heap block — vertical centering left a large empty band under sparse maps.
  const blockTop = verticalInset
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

  const avgHeapWidth =
    packedRows.reduce((sum, row) => sum + row.width / Math.max(1, row.heaps.length), 0) / Math.max(1, packedRows.length)
  anchorInferredNearCallers(
    result,
    backboneNodes,
    callEdges,
    Math.min(110, Math.max(88, avgHeapWidth * 0.32)),
    Math.min(100, Math.max(84, (packedRows[0]?.height ?? 160) * 0.28))
  )

  // Park isolates under the actual lowest placed node (not the pack cell padding).
  let lowestY = blockTop
  result.forEach((point) => {
    lowestY = Math.max(lowestY, point.y)
  })
  isolates.forEach((key, index) => {
    const count = isolates.length
    result.set(key, {
      x: horizontalInset + canvasWidth * 0.5 + (index - (count - 1) / 2) * ISOLATE_NODE_GAP,
      y: lowestY + ISOLATE_ROW_GAP,
      community: 10_000 + index,
    })
  })

  // Rebase backbone at natural overview scale, then hang structural satellites.
  fitLayoutToViewport(result, width, height, horizontalInset, verticalInset)
  placeStructuralAnchors(result, nodes, edges)
  return result
}
