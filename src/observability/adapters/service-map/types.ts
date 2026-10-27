/** Greptime `calls.attributes.connection_type` for inferred peers. */
export type ServiceMapConnectionType = 'database' | 'virtual_node' | string

export interface ServiceMapNode {
  key: string
  type: string
  id: string
  label: string
  serviceValue?: string
  scope?: string
  descriptive?: Record<string, unknown> | string | null
  sourceTables: string[]
  instanceCount: number
  groupAttributes: Record<string, string>
  virtual: boolean
  /** Present on inferred peers when the edge attributes name a connection type. */
  connectionType?: ServiceMapConnectionType
}

export interface ServiceMapEdge {
  key: string
  source: string
  target: string
  /** Relationship kind; defaults to calls for legacy rows. */
  relType?: string
  requests: number
  errors: number
  unmatched: number
  durationSum: number
  durationCount: number
  durationMax: number
  connectionType?: ServiceMapConnectionType
}

export interface ServiceMapResult {
  nodes: ServiceMapNode[]
  edges: ServiceMapEdge[]
  truncated: boolean
}

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

export interface ServiceMapDisplayGraph {
  nodes: ServiceMapDisplayNode[]
  edges: ServiceMapEdge[]
}

export interface ServiceMapNodeLayout {
  x: number
  y: number
  /** Community / heap index. Used for same-group edge styling. */
  community: number
}

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
