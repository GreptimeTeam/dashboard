import editorApi from '@/api/editor'
import type { DrilldownContext } from '../../context'
import {
  buildServiceMapEntitiesSql,
  buildServiceMapInstanceCountsSql,
  buildServiceMapRelationshipsSql,
} from '../../traces/service-map-queries'
import { mergeEdges } from './graph'
import type { ServiceMapConnectionType, ServiceMapEdge, ServiceMapNode, ServiceMapResult } from './types'

const SERVICE_MAP_NODE_LIMIT = 100
const SERVICE_MAP_EDGE_LIMIT = 250

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
    nodes.set(key, makeNode(type, id, true, connectionType))
    return key
  }
  if (existing.virtual && connectionType) existing.connectionType ||= connectionType
  return key
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

function nodesFromEntities(rows: Array<Record<string, unknown>>): Map<string, ServiceMapNode> {
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
    const existing = nodes.get(key)
    const node: ServiceMapNode = {
      ...makeNode(type, id, false),
      label: serviceValue || id,
      serviceValue: serviceValue || id,
      scope: typeof row.scope === 'string' ? row.scope : undefined,
      descriptive: parseJson(row.descriptive) as ServiceMapNode['descriptive'],
      sourceTables: sourceTablesFrom(row.source_tables),
      groupAttributes: entityAttributesFrom(
        row.entity_id_attrs,
        row.descriptive,
        typeof row.scope === 'string' && row.scope.trim() ? { scope: row.scope } : undefined
      ),
    }
    // A changing descriptive snapshot can produce multiple rows for one entity. Keep
    // the first observed row; identity and graph connectivity are stable across them.
    if (!existing) {
      nodes.set(key, node)
    } else {
      existing.sourceTables = [...new Set([...existing.sourceTables, ...node.sourceTables])]
      existing.scope ||= node.scope
      existing.serviceValue ||= node.serviceValue
      existing.groupAttributes = { ...existing.groupAttributes, ...node.groupAttributes }
    }
  })
  return nodes
}

function edgesFromRows(rows: Array<Record<string, unknown>>, nodes: Map<string, ServiceMapNode>): ServiceMapEdge[] {
  const edges = new Map<string, ServiceMapEdge>()
  rows.forEach((row) => {
    const srcType = String(row.src_type ?? '')
    const srcId = String(row.src_id ?? '')
    const dstType = String(row.dst_type ?? '')
    const dstId = String(row.dst_id ?? '')
    if (!srcType || !srcId || !dstType || !dstId) {
      return
    }
    const connectionType = connectionTypeFromAttributes(row.attributes)
    const source = ensureEndpoint(nodes, srcType, srcId, connectionType)
    const target = ensureEndpoint(nodes, dstType, dstId, connectionType)

    const key = `${source}\0${target}`
    const edge = edges.get(key) ?? {
      key,
      source,
      target,
      requests: 0,
      errors: 0,
      unmatched: 0,
      durationSum: 0,
      durationCount: 0,
      durationMax: 0,
      connectionType,
    }
    edge.connectionType ||= connectionType
    const confidence = toNumber(row.confidence)
    const unmatched = toNumber(row.unmatched_count)
    edge.unmatched += unmatched
    // RED request/error/duration values belong to different populations at confidence
    // 1 and below 1. Keep the UI's RED metrics paired-only; expose unmatched separately.
    if (confidence >= 1) {
      edge.requests += toNumber(row.request_count)
      edge.errors += toNumber(row.error_count)
      edge.durationSum += toNumber(row.duration_sum)
      edge.durationCount += toNumber(row.duration_count)
      edge.durationMax = Math.max(edge.durationMax, toNumber(row.duration_max))
    }
    edges.set(key, edge)
  })
  return [...edges.values()]
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

export async function fetchServiceMap(
  ctx: DrilldownContext,
  onEntitiesLoaded?: (partial: ServiceMapResult) => void
): Promise<ServiceMapResult> {
  const range = ctx.query.unixTimeRange()
  if (range.length !== 2) {
    return { nodes: [], edges: [], truncated: false }
  }
  const database = ctx.connection.databaseFor('traces')
  const entitiesQuery = editorApi
    .runSQL(buildServiceMapEntitiesSql({ startUnix: range[0], endUnix: range[1] }), database, {
      suppressErrorToast: true,
    })
    .then((response) => {
      const partialNodes = [...nodesFromEntities(recordsToObjects(response?.output?.[0]?.records)).values()]
      onEntitiesLoaded?.({
        nodes: partialNodes.slice(0, SERVICE_MAP_NODE_LIMIT),
        edges: [],
        truncated: partialNodes.length > SERVICE_MAP_NODE_LIMIT,
      })
      return response
    })
  const [entitiesResponse, relationshipsResponse] = await Promise.all([
    entitiesQuery,
    editorApi.runSQL(buildServiceMapRelationshipsSql({ startUnix: range[0], endUnix: range[1] }), database, {
      suppressErrorToast: true,
    }),
  ])
  const entityRows = recordsToObjects(entitiesResponse?.output?.[0]?.records)
  const relationshipRows = recordsToObjects(relationshipsResponse?.output?.[0]?.records)
  const nodes = nodesFromEntities(entityRows)
  const limited = limitServiceMapGraph(nodes, edgesFromRows(relationshipRows, nodes))
  const folded = foldVirtualPeersIntoServices(limited.nodes, limited.edges)
  return { nodes: folded.nodes, edges: folded.edges, truncated: limited.truncated }
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
