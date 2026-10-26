import { edgeTraffic } from './metrics'
import type { ServiceMapDisplayNode, ServiceMapEdge, ServiceMapNodeLayout } from './types'

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
      const fan = (slot - (inferredKeys.length - 1) / 2) * 70
      // Sit below-right of the caller so the parent's bottom title stays clear.
      self.x = neighbour.x + (link.asTarget ? offsetX : offsetX * 0.55) + fan
      self.y = neighbour.y + offsetY + Math.abs(fan) * 0.25
      self.community = neighbour.community
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

/** Shrink layout if it overflows the viewport; keep top-left alignment (no vertical centering). */
export function fitLayoutToViewport(
  layout: Map<string, ServiceMapNodeLayout>,
  width: number,
  height: number,
  insetX = 72,
  insetY = 48
): void {
  if (layout.size === 0) return
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  layout.forEach((point) => {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  })
  const pad = 72
  const contentW = Math.max(1, maxX - minX)
  const contentH = Math.max(1, maxY - minY)
  const availW = Math.max(1, width - insetX * 2 - pad)
  const availH = Math.max(1, height - insetY * 2 - pad)
  // Only shrink when overflowing — do not enlarge sparse graphs into empty space.
  const scale = Math.min(1, availW / contentW, availH / contentH)
  layout.forEach((point, key) => {
    layout.set(key, {
      ...point,
      x: insetX + pad * 0.5 + (point.x - minX) * scale,
      y: insetY + pad * 0.5 + (point.y - minY) * scale,
    })
  })
}

/**
 * Overview: Louvain heaps as compact clusters, ordered left→right by mean call depth.
 * Tiny heaps absorb into neighbors; isolates park just under the main block.
 */
export function buildServiceMapOverviewLayout(
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
    nodes,
    edges,
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

  fitLayoutToViewport(result, width, height, horizontalInset, verticalInset)
  return result
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
