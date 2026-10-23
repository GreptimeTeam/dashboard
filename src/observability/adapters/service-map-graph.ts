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
  community: number
}

/** Assign connected services to topology communities while keeping every node visible. */
export function buildServiceMapCommunityLayout(
  nodes: ServiceMapDisplayNode[],
  edges: ServiceMapEdge[],
  width: number,
  height: number
): Map<string, ServiceMapNodeLayout> {
  if (!nodes.length) return new Map()
  const keys = nodes.map((node) => node.key).sort()
  const adjacency = new Map(keys.map((key) => [key, new Map<string, number>()]))
  edges.forEach((edge) => {
    if (edge.source === edge.target || !adjacency.has(edge.source) || !adjacency.has(edge.target)) return
    const weight = Math.log1p(Math.max(0, edge.requests) + Math.max(0, edge.unmatched))
    if (!weight) return
    adjacency.get(edge.source)!.set(edge.target, (adjacency.get(edge.source)!.get(edge.target) ?? 0) + weight)
    adjacency.get(edge.target)!.set(edge.source, (adjacency.get(edge.target)!.get(edge.source) ?? 0) + weight)
  })

  const degree = new Map(
    keys.map((key) => [key, [...adjacency.get(key)!.values()].reduce((sum, value) => sum + value, 0)])
  )
  const totalWeight = [...degree.values()].reduce((sum, value) => sum + value, 0) / 2
  const communityByNode = new Map(keys.map((key) => [key, key]))
  const communityDegree = new Map(keys.map((key) => [key, degree.get(key)!]))

  if (totalWeight > 0) {
    for (let pass = 0; pass < 30; pass += 1) {
      let moved = false
      keys.forEach((key) => {
        const current = communityByNode.get(key)!
        const nodeDegree = degree.get(key)!
        communityDegree.set(current, (communityDegree.get(current) ?? 0) - nodeDegree)
        const weightsByCommunity = new Map<string, number>()
        adjacency.get(key)!.forEach((weight, neighbour) => {
          const community = communityByNode.get(neighbour)!
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

  const groups = new Map<string, string[]>()
  communityByNode.forEach((community, key) => groups.set(community, [...(groups.get(community) ?? []), key]))
  const groupList = [...groups.values()].sort((left, right) => {
    const degreeDiff =
      right.reduce((sum, key) => sum + (degree.get(key) ?? 0), 0) -
      left.reduce((sum, key) => sum + (degree.get(key) ?? 0), 0)
    return degreeDiff || left[0].localeCompare(right[0])
  })
  const columns = Math.ceil(Math.sqrt(groupList.length))
  const rows = Math.ceil(groupList.length / columns)
  const horizontalInset = 64
  const verticalInset = 40
  const canvasWidth = Math.max(500, width - horizontalInset * 2)
  const canvasHeight = Math.max(360, height - verticalInset * 2)
  const cellWidth = canvasWidth / columns
  const cellHeight = canvasHeight / rows
  const result = new Map<string, ServiceMapNodeLayout>()
  groupList.forEach((members, community) => {
    const ordered = [...members].sort(
      (left, right) => (degree.get(right) ?? 0) - (degree.get(left) ?? 0) || left.localeCompare(right)
    )
    const radius =
      ordered.length > 1
        ? Math.min(120, Math.max(36, 22 + Math.sqrt(ordered.length) * 30), cellWidth * 0.29, cellHeight * 0.36)
        : 0
    const centerX = horizontalInset + ((community % columns) + 0.5) * cellWidth
    const centerY = verticalInset + (Math.floor(community / columns) + 0.5) * cellHeight
    ordered.forEach((key, index) => {
      const angle = ordered.length > 1 ? (2 * Math.PI * index) / ordered.length - Math.PI / 2 : 0
      result.set(key, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        community,
      })
    })
  })
  return result
}

/** Place the inspected node at the canvas center with neighbors on a ring. */
export function buildServiceMapFocusLayout(
  centerKey: string,
  nodes: ServiceMapDisplayNode[],
  edges: ServiceMapEdge[],
  width: number,
  height: number
): Map<string, ServiceMapNodeLayout> {
  if (!nodes.length) return new Map()
  const hasCenter = nodes.some((node) => node.key === centerKey)
  if (!hasCenter) return buildServiceMapCommunityLayout(nodes, edges, width, height)

  const weightToCenter = new Map<string, number>()
  edges.forEach((edge) => {
    const weight = Math.max(0, edge.requests) + Math.max(0, edge.unmatched)
    if (edge.source === centerKey && edge.target !== centerKey) {
      weightToCenter.set(edge.target, (weightToCenter.get(edge.target) ?? 0) + weight)
    } else if (edge.target === centerKey && edge.source !== centerKey) {
      weightToCenter.set(edge.source, (weightToCenter.get(edge.source) ?? 0) + weight)
    }
  })

  const others = nodes
    .filter((node) => node.key !== centerKey)
    .sort(
      (left, right) =>
        (weightToCenter.get(right.key) ?? 0) - (weightToCenter.get(left.key) ?? 0) ||
        left.label.localeCompare(right.label)
    )

  const centerX = width / 2
  const centerY = height / 2
  const result = new Map<string, ServiceMapNodeLayout>([[centerKey, { x: centerX, y: centerY, community: 0 }]])
  if (!others.length) return result

  const inset = 72
  const available = Math.min(width, height) / 2 - inset
  const radius = Math.max(72, Math.min(available, 56 + others.length * 22))
  others.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / others.length - Math.PI / 2
    result.set(node.key, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      community: 1,
    })
  })
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
      const neighbourKey =
        edge.source === onlyMatch.key ? edge.target : edge.target === onlyMatch.key ? edge.source : ''
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
      const endpointKey = matchedKeys.has(edge.source) ? edge.target : matchedKeys.has(edge.target) ? edge.source : ''
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
