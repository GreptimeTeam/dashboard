import editorApi from '@/api/editor'
import type { DrilldownContext } from '../../context'
import {
  SERVICE_MAP_EDGE_LIMIT,
  SERVICE_MAP_ENTITY_ROWS_LIMIT,
  SERVICE_MAP_INSTANCE_SATELLITE_LIMIT,
  SERVICE_MAP_NODE_LIMIT,
  SERVICE_MAP_RELATIONSHIP_ROWS_LIMIT,
  buildServiceMapCallsSql,
  buildServiceMapEntitiesSql,
  buildServiceMapInstanceCountsSql,
  buildServiceMapStructuralSql,
  isStructuralEntityType,
  isStructuralRelType,
} from '../../traces/service-map-queries'
import { mergeEdges } from './graph'
import type {
  ServiceMapConnectionType,
  ServiceMapEdge,
  ServiceMapNode,
  ServiceMapProvenance,
  ServiceMapResult,
} from './types'

export interface FetchServiceMapOptions {
  /**
   * When true, load instance/container satellites for every real service in the
   * call graph (capped per service). Default false — calls-only overview.
   */
  showTopology?: boolean
}

interface QueryRecords {
  schema?: { column_schemas?: Array<{ name: string }> }
  rows?: unknown[][]
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function recordsToObjects(records?: QueryRecords): Array<Record<string, unknown>> {
  const columns = records?.schema?.column_schemas ?? []
  const rows = records?.rows ?? []
  return rows.map((row) => Object.fromEntries(columns.map((column, index) => [column.name, row[index]])))
}

function serviceNameFromAttrs(raw: unknown): string | undefined {
  const attrs = parseJson(raw)
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
    return undefined
  }
  const record = attrs as Record<string, unknown>
  const preferredKeys = ['service.name', 'service_name', 'service', 'name']
  const preferred = preferredKeys
    .map((key) => record[key])
    .find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
  if (preferred) return preferred.trim()
  const value = Object.values(record).find((candidate) => typeof candidate === 'string' && candidate.trim())
  return typeof value === 'string' ? value.trim() : undefined
}

function sourceTablesFrom(raw: unknown): string[] {
  const parsed = parseJson(raw)
  if (Array.isArray(parsed)) {
    return parsed.map(String)
  }
  return typeof parsed === 'string' && parsed ? [parsed] : []
}

function entityAttributesFrom(...values: unknown[]): Record<string, string> {
  const result: Record<string, string> = {}

  const addValues = (record: Record<string, unknown>, prefix = '') => {
    Object.entries(record).forEach(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        const normalized = String(value).trim()
        if (normalized) result[path] = normalized
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        addValues(value as Record<string, unknown>, path)
      }
    })
  }

  values.forEach((raw) => {
    const parsed = parseJson(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    addValues(parsed as Record<string, unknown>)
  })
  return result
}

function entityKey(type: string, id: string): string {
  return `${type}\0${id}`
}

function connectionTypeFromAttributes(raw: unknown): ServiceMapConnectionType | undefined {
  const attrs = parseJson(raw)
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return undefined
  const value = (attrs as Record<string, unknown>).connection_type
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeProvenance(raw: unknown, fallback: ServiceMapProvenance = 'trace'): ServiceMapProvenance {
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return fallback
}

function makeNode(
  type: string,
  id: string,
  virtual: boolean,
  connectionType?: ServiceMapConnectionType
): ServiceMapNode {
  return {
    key: entityKey(type, id),
    type,
    id,
    label: id || type,
    scopes: [],
    sourceTables: [],
    instanceCount: 0,
    groupAttributes: {},
    virtual,
    connectionType,
  }
}

function ensureEndpoint(
  nodes: Map<string, ServiceMapNode>,
  type: string,
  id: string,
  connectionType?: ServiceMapConnectionType
): string {
  const key = entityKey(type, id)
  const existing = nodes.get(key)
  if (!existing) {
    // Structural satellites are real entities from part_of / runs_on; call peers stay virtual.
    nodes.set(key, makeNode(type, id, !isStructuralEntityType(type), connectionType))
    return key
  }
  if (existing.virtual && connectionType) existing.connectionType ||= connectionType
  return key
}

function mergeScopeList(existing: string[], next?: string): string[] {
  if (!next?.trim()) return existing
  const value = next.trim()
  return existing.includes(value) ? existing : [...existing, value]
}

/** Remap inferred peers onto real services with the same display name; keep unmatched on the folded edge. */
export function foldVirtualPeersIntoServices(
  nodes: ServiceMapNode[],
  edges: ServiceMapEdge[]
): { nodes: ServiceMapNode[]; edges: ServiceMapEdge[] } {
  const realByName = new Map<string, string>()
  nodes.forEach((node) => {
    if (node.virtual || node.type !== 'service') return
    ;[node.label, node.serviceValue, node.id].forEach((name) => {
      const normalized = name?.trim().toLowerCase()
      if (normalized && !realByName.has(normalized)) realByName.set(normalized, node.key)
    })
  })

  const remap = new Map<string, string>()
  nodes.forEach((node) => {
    if (!node.virtual) return
    const hit = realByName.get(node.label.trim().toLowerCase()) || realByName.get(node.id.trim().toLowerCase())
    if (hit && hit !== node.key) remap.set(node.key, hit)
  })
  if (!remap.size) return { nodes, edges }

  const merged = mergeEdges(edges, (key) => remap.get(key) ?? key)
  const kept = new Set(merged.flatMap((edge) => [edge.source, edge.target]))
  return {
    nodes: nodes.filter((node) => !remap.has(node.key) && (kept.has(node.key) || !node.virtual)),
    edges: merged,
  }
}

export function nodesFromEntities(rows: Array<Record<string, unknown>>): Map<string, ServiceMapNode> {
  const nodes = new Map<string, ServiceMapNode>()
  rows.forEach((row) => {
    const type = String(row.entity_type ?? '')
    const id = String(row.entity_id ?? '')
    if (!type || !id) {
      return
    }
    const key = entityKey(type, id)
    const attrs = parseJson(row.entity_id_attrs)
    const serviceValue = serviceNameFromAttrs(attrs)
    const scope = typeof row.scope === 'string' ? row.scope.trim() : ''
    const existing = nodes.get(key)
    const node: ServiceMapNode = {
      ...makeNode(type, id, false),
      label: serviceValue || id,
      serviceValue: serviceValue || id,
      scope: scope || undefined,
      scopes: scope ? [scope] : [],
      descriptive: parseJson(row.descriptive) as ServiceMapNode['descriptive'],
      sourceTables: sourceTablesFrom(row.source_tables),
      groupAttributes: entityAttributesFrom(row.entity_id_attrs, row.descriptive, scope ? { scope } : undefined),
    }
    if (!existing) {
      nodes.set(key, node)
    } else {
      existing.sourceTables = [...new Set([...existing.sourceTables, ...node.sourceTables])]
      existing.scopes = mergeScopeList(existing.scopes, scope)
      existing.scope = existing.scopes[0]
      existing.serviceValue ||= node.serviceValue
      existing.label ||= node.label
      // Do not overwrite prior env values with later ones — keep first-seen per key,
      // but always union scope into scopes[] above.
      Object.entries(node.groupAttributes).forEach(([attrKey, value]) => {
        if (!(attrKey in existing.groupAttributes)) existing.groupAttributes[attrKey] = value
      })
      if (scope) existing.groupAttributes.scope = existing.scopes.join(',')
    }
  })
  return nodes
}

function edgeIdentityKey(source: string, target: string, relType: string, provenance: ServiceMapProvenance): string {
  return `${source}\0${target}\0${relType}\0${provenance}`
}

export function edgesFromRows(
  rows: Array<Record<string, unknown>>,
  nodes: Map<string, ServiceMapNode>,
  options: { declaredDefault?: boolean } = {}
): ServiceMapEdge[] {
  const edges = new Map<string, ServiceMapEdge>()
  rows.forEach((row) => {
    const srcType = String(row.src_type ?? '')
    const srcId = String(row.src_id ?? '')
    const dstType = String(row.dst_type ?? '')
    const dstId = String(row.dst_id ?? '')
    if (!srcType || !srcId || !dstType || !dstId) {
      return
    }
    const relType = String(row.rel_type ?? 'calls') || 'calls'
    const isDeclaredRel = relType === 'depends_on' || relType === 'owns' || Boolean(options.declaredDefault)
    let provenanceFallback: ServiceMapProvenance = 'trace'
    if (isDeclaredRel) provenanceFallback = 'declared'
    else if (isStructuralRelType(relType)) provenanceFallback = 'attribute'
    const provenance = normalizeProvenance(row.provenance, provenanceFallback)
    const connectionType = connectionTypeFromAttributes(row.attributes)
    const source = ensureEndpoint(nodes, srcType, srcId, connectionType)
    const target = ensureEndpoint(nodes, dstType, dstId, connectionType)
    const confidence = row.confidence === undefined || row.confidence === null ? undefined : toNumber(row.confidence)
    const declared = isDeclaredRel || provenance === 'declared'
    const key = edgeIdentityKey(source, target, relType, provenance)
    const edge = edges.get(key) ?? {
      key,
      source,
      target,
      relType,
      provenance,
      confidence,
      declared,
      hasTelemetry: false,
      requests: 0,
      errors: 0,
      unmatched: 0,
      durationSum: 0,
      durationCount: 0,
      durationMax: 0,
      connectionType,
    }
    edge.connectionType ||= connectionType
    if (confidence !== undefined) {
      edge.confidence = Math.max(edge.confidence ?? 0, confidence)
    }
    const unmatched = toNumber(row.unmatched_count)
    edge.unmatched += unmatched
    // SQL already gates paired RED with confidence >= 1 for aggregated calls.
    // Legacy unaggregated rows may still expose a confidence column.
    const hasConfidence = row.confidence !== undefined && row.confidence !== null
    const paired = !declared && (!hasConfidence || toNumber(row.confidence) >= 1)
    if (paired) {
      edge.requests += toNumber(row.request_count)
      edge.errors += toNumber(row.error_count)
      edge.durationSum += toNumber(row.duration_sum)
      edge.durationCount += toNumber(row.duration_count)
      edge.durationMax = Math.max(edge.durationMax, toNumber(row.duration_max))
    }
    edge.hasTelemetry = edge.requests > 0 || edge.errors > 0 || edge.unmatched > 0 || edge.durationCount > 0
    const sourceNode = nodes.get(source)
    const targetNode = nodes.get(target)
    if (sourceNode && targetNode && (sourceNode.scopes.length > 1 || targetNode.scopes.length > 1)) {
      edge.mixedScope = true
    }
    edges.set(key, edge)
  })
  return [...edges.values()]
}

/**
 * Keep at most N instance→service part_of edges per service; drop runs_on whose
 * instance was not kept. Other structural edges pass through unchanged.
 */
export function capInstanceSatellites(
  edges: ServiceMapEdge[],
  limit = SERVICE_MAP_INSTANCE_SATELLITE_LIMIT
): ServiceMapEdge[] {
  const partOf: ServiceMapEdge[] = []
  const runsOn: ServiceMapEdge[] = []
  const other: ServiceMapEdge[] = []
  edges.forEach((edge) => {
    const rel = edge.relType || 'calls'
    if (rel === 'part_of') partOf.push(edge)
    else if (rel === 'runs_on') runsOn.push(edge)
    else other.push(edge)
  })
  const byService = new Map<string, ServiceMapEdge[]>()
  partOf.forEach((edge) => {
    byService.set(edge.target, [...(byService.get(edge.target) ?? []), edge])
  })
  const keptPartOf: ServiceMapEdge[] = []
  const keptInstances = new Set<string>()
  byService.forEach((list) => {
    ;[...list]
      .sort((left, right) => left.source.localeCompare(right.source))
      .slice(0, Math.max(0, limit))
      .forEach((edge) => {
        keptPartOf.push(edge)
        keptInstances.add(edge.source)
      })
  })
  return [...other, ...keptPartOf, ...runsOn.filter((edge) => keptInstances.has(edge.source))]
}

async function loadStructuralExpansion(
  range: { startUnix: number; endUnix: number },
  database: string,
  serviceIds: string[],
  baseNodes: ServiceMapNode[]
): Promise<{ nodes: ServiceMapNode[]; edges: ServiceMapEdge[]; truncated: boolean }> {
  if (!serviceIds.length) return { nodes: [], edges: [], truncated: false }
  const nodes = new Map(baseNodes.map((node) => [node.key, { ...node, scopes: [...node.scopes] }]))
  const partOfResponse = await editorApi.runSQL(
    buildServiceMapStructuralSql(range, ['part_of'], { serviceIds }),
    database,
    { suppressErrorToast: true }
  )
  const partOfRows = recordsToObjects(partOfResponse?.output?.[0]?.records)
  const partOfEdges = edgesFromRows(partOfRows, nodes)
  const cappedPartOf = capInstanceSatellites(partOfEdges)
  const instanceIds = [
    ...new Set(
      cappedPartOf
        .filter((edge) => (edge.relType || '') === 'part_of')
        .map((edge) => nodes.get(edge.source)?.id)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  let runsOnRows: Array<Record<string, unknown>> = []
  let runsOnEdges: ServiceMapEdge[] = []
  if (instanceIds.length) {
    const runsOnResponse = await editorApi.runSQL(
      buildServiceMapStructuralSql(range, ['runs_on'], { instanceIds }),
      database,
      { suppressErrorToast: true }
    )
    runsOnRows = recordsToObjects(runsOnResponse?.output?.[0]?.records)
    runsOnEdges = edgesFromRows(runsOnRows, nodes)
  }
  const structuralEdges = capInstanceSatellites([...cappedPartOf, ...runsOnEdges])
  const keptKeys = new Set(structuralEdges.flatMap((edge) => [edge.source, edge.target]))
  // Only return satellites newly introduced by expansion (services already in base).
  const baseKeys = new Set(baseNodes.map((node) => node.key))
  const satelliteNodes = [...nodes.values()].filter(
    (node) => keptKeys.has(node.key) && (!baseKeys.has(node.key) || isStructuralEntityType(node.type))
  )
  const truncated =
    partOfRows.length >= SERVICE_MAP_RELATIONSHIP_ROWS_LIMIT || runsOnRows.length >= SERVICE_MAP_RELATIONSHIP_ROWS_LIMIT
  return { nodes: satelliteNodes, edges: structuralEdges, truncated }
}

/**
 * Keep the heaviest edges within the node/edge display limits, then top up with
 * standalone services. `nodes` must already contain every edge endpoint.
 */
export function limitServiceMapGraph(nodes: Map<string, ServiceMapNode>, edges: ServiceMapEdge[]): ServiceMapResult {
  const rankedEdges = [...edges].sort((a, b) => b.requests - a.requests || b.unmatched - a.unmatched)
  const includedNodes = new Set<string>()
  const limitedEdges: ServiceMapEdge[] = []
  rankedEdges.forEach((edge) => {
    if (limitedEdges.length >= SERVICE_MAP_EDGE_LIMIT) return
    const newEndpointCount = Number(!includedNodes.has(edge.source)) + Number(!includedNodes.has(edge.target))
    if (includedNodes.size + newEndpointCount > SERVICE_MAP_NODE_LIMIT) return
    includedNodes.add(edge.source)
    includedNodes.add(edge.target)
    limitedEdges.push(edge)
  })
  // Keep a bounded sample of standalone services too, even when they have no calls.
  ;[...nodes.values()].some((node) => {
    if (includedNodes.size >= SERVICE_MAP_NODE_LIMIT) return true
    includedNodes.add(node.key)
    return false
  })
  const visibleNodes = [...includedNodes]
    .map((key) => nodes.get(key))
    .filter((node): node is ServiceMapNode => Boolean(node))
  return {
    nodes: visibleNodes,
    edges: limitedEdges,
    // Snapshot rows can repeat the same services many times. Only warn when the
    // graph itself is clipped by the client-side node/edge display limits.
    truncated: rankedEdges.length > SERVICE_MAP_EDGE_LIMIT || nodes.size > SERVICE_MAP_NODE_LIMIT,
  }
}

/**
 * After topology expansion, keep call-graph nodes and fill remaining slots with
 * satellites so the display cap stays honest.
 */
export function limitTopologyNodes(
  callNodes: ServiceMapNode[],
  satelliteNodes: ServiceMapNode[],
  callEdges: ServiceMapEdge[],
  structuralEdges: ServiceMapEdge[],
  nodeLimit = SERVICE_MAP_NODE_LIMIT
): { nodes: ServiceMapNode[]; edges: ServiceMapEdge[]; truncated: boolean } {
  const locked = new Set(callNodes.map((node) => node.key))
  const kept = [...callNodes]
  const truncated = locked.size + satelliteNodes.length > nodeLimit
  satelliteNodes
    .slice()
    .sort((left, right) => left.key.localeCompare(right.key))
    .forEach((node) => {
      if (kept.length >= nodeLimit) return
      if (locked.has(node.key)) return
      locked.add(node.key)
      kept.push(node)
    })
  const edges = [...callEdges, ...structuralEdges].filter((edge) => locked.has(edge.source) && locked.has(edge.target))
  return { nodes: kept, edges, truncated }
}

export async function fetchServiceMap(
  ctx: DrilldownContext,
  options: FetchServiceMapOptions = {}
): Promise<ServiceMapResult> {
  const range = ctx.query.unixTimeRange()
  if (range.length !== 2) {
    return { nodes: [], edges: [], truncated: false }
  }
  const database = ctx.connection.databaseFor('traces')
  const queryRange = { startUnix: range[0], endUnix: range[1] }
  // Wait for entities + relationships together — painting nodes-only would flash
  // an isolate row before call edges arrive and the community layout settles.
  const [entitiesResponse, relationshipsResponse] = await Promise.all([
    editorApi.runSQL(buildServiceMapEntitiesSql(queryRange), database, {
      suppressErrorToast: true,
    }),
    editorApi.runSQL(buildServiceMapCallsSql(queryRange), database, {
      suppressErrorToast: true,
    }),
  ])
  const entityRows = recordsToObjects(entitiesResponse?.output?.[0]?.records)
  const relationshipRows = recordsToObjects(relationshipsResponse?.output?.[0]?.records)
  const nodes = nodesFromEntities(entityRows)
  const callEdges = edgesFromRows(relationshipRows, nodes)
  // Declared depends_on / owns are not shown yet — without authored dependency data the
  // "Dependencies" layer only flattened call-graph isolates. Keep calls + provenance only.
  const limited = limitServiceMapGraph(nodes, callEdges)
  const folded = foldVirtualPeersIntoServices(limited.nodes, limited.edges)
  const sqlTruncated =
    entityRows.length >= SERVICE_MAP_ENTITY_ROWS_LIMIT || relationshipRows.length >= SERVICE_MAP_RELATIONSHIP_ROWS_LIMIT

  if (!options.showTopology) {
    return {
      nodes: folded.nodes,
      edges: folded.edges,
      truncated: limited.truncated || sqlTruncated,
    }
  }

  const topologyServiceIds = [
    ...new Set(folded.nodes.filter((node) => node.type === 'service' && !node.virtual).map((node) => node.id)),
  ]
  if (!topologyServiceIds.length) {
    return {
      nodes: folded.nodes,
      edges: folded.edges,
      truncated: limited.truncated || sqlTruncated,
    }
  }

  const structural = await loadStructuralExpansion(queryRange, database, topologyServiceIds, folded.nodes)
  const capped = limitTopologyNodes(folded.nodes, structural.nodes, folded.edges, structural.edges)
  return {
    nodes: capped.nodes,
    edges: capped.edges,
    truncated: limited.truncated || sqlTruncated || structural.truncated || capped.truncated,
  }
}

export async function fetchServiceMapInstanceCount(ctx: DrilldownContext, serviceId: string): Promise<number> {
  const range = ctx.query.unixTimeRange()
  if (range.length !== 2) return 0
  const database = ctx.connection.databaseFor('traces')
  const response = await editorApi.runSQL(
    buildServiceMapInstanceCountsSql({ startUnix: range[0], endUnix: range[1] }, serviceId),
    database,
    { suppressErrorToast: true }
  )
  const row = recordsToObjects(response?.output?.[0]?.records)[0]
  return toNumber(row?.instance_count)
}

/**
 * SQL interceptor rejects with `{ error, startTime }` rather than `Error`.
 * Prefer the server message when present.
 */
export function serviceMapSqlErrorMessage(reason: unknown): string {
  if (reason && typeof reason === 'object' && 'error' in reason) {
    const message = String((reason as { error?: unknown }).error ?? '').trim()
    if (message) return message
  }
  if (reason instanceof Error) {
    return reason.message.trim()
  }
  const fallback = String(reason ?? '').trim()
  return fallback === '[object Object]' ? '' : fallback
}

/**
 * True when GreptimeDB has no Semantic Graph tables (older builds / no Semantic Layer).
 * Matches the SQL planner message shape: `Failed to plan SQL: Table not found: …`.
 */
export function isMissingSemanticGraph(reason: unknown): boolean {
  const message = serviceMapSqlErrorMessage(reason)
  if (!/table not found/i.test(message)) return false
  return /semantic_entities|semantic_relationships/i.test(message)
}
