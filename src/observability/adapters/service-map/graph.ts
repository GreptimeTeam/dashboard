import type {
  ServiceMapDisplayGraph,
  ServiceMapDisplayNode,
  ServiceMapEdge,
  ServiceMapFacet,
  ServiceMapFilters,
  ServiceMapNode,
} from './types'

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
  ;(node.scopes ?? []).forEach((scope) => {
    if (scope.trim()) values.add(scope.trim())
  })
  if (node.scope?.trim()) values.add(node.scope.trim())
  Object.entries(node.groupAttributes).forEach(([key, rawValue]) => {
    // groupAttributes.scope may be a joined list ("prod,staging") after multi-scope merge.
    if (key === 'scope' || isScopeAttribute(key)) {
      rawValue
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((value) => values.add(value))
      return
    }
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
    const current = pending.shift()
    if (current === undefined) break
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

/**
 * Re-key edge endpoints via `resolve` and sum RED per (source, target, rel, provenance).
 * Edges whose endpoint resolves to nothing, or that collapse into a self-loop, are dropped.
 */
export function mergeEdges(edges: ServiceMapEdge[], resolve: (key: string) => string | undefined): ServiceMapEdge[] {
  const aggregates = new Map<string, ServiceMapEdge>()
  edges.forEach((edge) => {
    const source = resolve(edge.source)
    const target = resolve(edge.target)
    if (!source || !target || source === target) return
    const relType = edge.relType || 'calls'
    const provenance = edge.provenance || 'trace'
    const key = `${source}\0${target}\0${relType}\0${provenance}`
    const aggregate = aggregates.get(key) ?? {
      key,
      source,
      target,
      relType,
      provenance,
      confidence: edge.confidence,
      declared: edge.declared,
      hasTelemetry: edge.hasTelemetry,
      mixedScope: edge.mixedScope,
      requests: 0,
      errors: 0,
      unmatched: 0,
      durationSum: 0,
      durationCount: 0,
      durationMax: 0,
      connectionType: edge.connectionType,
    }
    aggregate.requests += edge.requests
    aggregate.errors += edge.errors
    aggregate.unmatched += edge.unmatched
    aggregate.durationSum += edge.durationSum
    aggregate.durationCount += edge.durationCount
    aggregate.durationMax = Math.max(aggregate.durationMax, edge.durationMax)
    aggregate.connectionType ||= edge.connectionType
    aggregate.declared = aggregate.declared || edge.declared
    aggregate.hasTelemetry = aggregate.hasTelemetry || edge.hasTelemetry
    aggregate.mixedScope = aggregate.mixedScope || edge.mixedScope
    if (edge.confidence !== undefined) {
      aggregate.confidence = Math.max(aggregate.confidence ?? 0, edge.confidence)
    }
    aggregates.set(key, aggregate)
  })
  return [...aggregates.values()]
}

function aggregateEdges(edges: ServiceMapEdge[], nodeMap: Map<string, ServiceMapDisplayNode>): ServiceMapEdge[] {
  return mergeEdges(edges, (key) => nodeMap.get(key)?.key)
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
    // Keep expanded structural satellites of the inspected service (containers hang off instances).
    const inspected = rawNodes.get(inspectNodeKey)
    if (inspected && !inspected.virtual && inspected.type === 'service') {
      const satellites = new Set<string>()
      edges.forEach((edge) => {
        if ((edge.relType || '') === 'part_of' && edge.target === inspectNodeKey) satellites.add(edge.source)
      })
      edges.forEach((edge) => {
        if ((edge.relType || '') !== 'runs_on') return
        if (satellites.has(edge.source)) satellites.add(edge.target)
      })
      satellites.forEach((key) => adjacent.add(key))
    }
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
      if (neighbour.virtual || serviceIdentity(neighbour) || neighbour.type !== 'service') {
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
      if (!endpoint || displayMap.has(endpoint.key)) return
      if (!endpoint.virtual && endpoint.type === 'service') return
      const displayNode = toDisplayNode(endpoint)
      displayNodes.push(displayNode)
      displayMap.set(endpoint.key, displayNode)
    })
  }

  // Keep structural satellites of matched services on the filtered graph.
  matchedServices.forEach((service) => {
    const satellites = new Set<string>()
    edges.forEach((edge) => {
      if ((edge.relType || '') === 'part_of' && edge.target === service.key) satellites.add(edge.source)
    })
    edges.forEach((edge) => {
      if ((edge.relType || '') !== 'runs_on') return
      if (satellites.has(edge.source)) satellites.add(edge.target)
    })
    satellites.forEach((key) => {
      if (displayMap.has(key)) return
      const satellite = rawNodes.get(key)
      if (!satellite) return
      const displayNode = toDisplayNode(satellite)
      displayNodes.push(displayNode)
      displayMap.set(key, displayNode)
    })
  })

  const remappedEdges = edges
    .filter(
      (edge) =>
        matchedKeys.has(edge.source) ||
        matchedKeys.has(edge.target) ||
        hiddenKeys.has(edge.source) ||
        hiddenKeys.has(edge.target) ||
        displayMap.has(edge.source) ||
        displayMap.has(edge.target)
    )
    .map((edge) => ({
      ...edge,
      source: hiddenNodeMap.get(edge.source) ?? edge.source,
      target: hiddenNodeMap.get(edge.target) ?? edge.target,
    }))
  return { nodes: displayNodes, edges: aggregateEdges(remappedEdges, displayMap) }
}
