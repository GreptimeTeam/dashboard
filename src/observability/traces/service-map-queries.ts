export interface ServiceMapQueryRange {
  startUnix: number
  endUnix: number
}

export interface ServiceMapQueryOptions {
  /** When set, restrict entities / call endpoints to these entity ids (plus one-hop neighbors for calls). */
  serviceIds?: string[]
}

/** Unique services / call edges returned by SQL (post-dedupe / post-endpoint aggregate). */
export const SERVICE_MAP_ENTITY_ROWS_LIMIT = 2000
export const SERVICE_MAP_RELATIONSHIP_ROWS_LIMIT = 2000

/** Client-side display caps; keep below SQL limits as a render guardrail. */
export const SERVICE_MAP_NODE_LIMIT = 300
export const SERVICE_MAP_EDGE_LIMIT = 750

/** Max instance satellites shown per expanded service (rest omitted). */
export const SERVICE_MAP_INSTANCE_SATELLITE_LIMIT = 3

export const STRUCTURAL_REL_TYPES = new Set(['part_of', 'runs_on', 'contains'])

export const DECLARED_REL_TYPES = ['depends_on', 'owns'] as const

export const STRUCTURAL_ENTITY_TYPES = new Set([
  'service.instance',
  'container',
  'host',
  'process',
  'k8s.pod',
  'k8s.container',
])

export function isStructuralRelType(relType: string): boolean {
  return STRUCTURAL_REL_TYPES.has(relType)
}

export function isStructuralEntityType(entityType: string): boolean {
  return STRUCTURAL_ENTITY_TYPES.has(entityType)
}

function timePredicate(range: ServiceMapQueryRange): string {
  return `observed_at >= FROM_UNIXTIME(${Math.floor(range.startUnix)}) AND observed_at < FROM_UNIXTIME(${Math.floor(
    range.endUnix
  )})`
}

function sqlStringList(values: string[]): string {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ')
}

function serviceIdPredicate(column: string, serviceIds?: string[]): string {
  const ids = (serviceIds ?? []).filter(Boolean)
  if (!ids.length) return ''
  return `\n  AND ${column} IN (${sqlStringList(ids)})`
}

/**
 * Latest observation per (service, scope) in the selected half-open window.
 * Scope is not identity — clients merge rows with the same entity_id into scopes[].
 */
export function buildServiceMapEntitiesSql(range: ServiceMapQueryRange, options: ServiceMapQueryOptions = {}): string {
  const idFilter = serviceIdPredicate('entity_id', options.serviceIds)
  return `SELECT entity_type, entity_id, entity_id_attrs, scope, descriptive, source_tables
FROM (
  SELECT entity_type, entity_id, entity_id_attrs, scope, descriptive, source_tables,
         ROW_NUMBER() OVER (
           PARTITION BY entity_type, entity_id, scope
           ORDER BY observed_at DESC
         ) AS rn
  FROM greptime_private.semantic_entities
  WHERE entity_type = 'service'
    AND ${timePredicate(range)}${idFilter}
) t
WHERE rn = 1
ORDER BY entity_id
LIMIT ${SERVICE_MAP_ENTITY_ROWS_LIMIT}`
}

/**
 * Calls RED aggregated per endpoint pair + provenance.
 * Paired RED uses confidence >= 1 only; unmatched always sums.
 * Optional serviceIds keeps selected services and their one-hop neighbors.
 */
export function buildServiceMapCallsSql(range: ServiceMapQueryRange, options: ServiceMapQueryOptions = {}): string {
  const ids = (options.serviceIds ?? []).filter(Boolean)
  const endpointFilter = ids.length
    ? `\n  AND (src_id IN (${sqlStringList(ids)}) OR dst_id IN (${sqlStringList(ids)}))`
    : ''
  return `SELECT src_type, src_id, dst_type, dst_id, 'calls' AS rel_type,
       COALESCE(provenance, 'trace') AS provenance,
       MAX(confidence) AS confidence,
       SUM(CASE WHEN confidence >= 1 THEN request_count ELSE 0 END) AS request_count,
       SUM(CASE WHEN confidence >= 1 THEN error_count ELSE 0 END) AS error_count,
       SUM(unmatched_count) AS unmatched_count,
       SUM(CASE WHEN confidence >= 1 THEN duration_sum ELSE 0 END) AS duration_sum,
       SUM(CASE WHEN confidence >= 1 THEN duration_count ELSE 0 END) AS duration_count,
       MAX(CASE WHEN confidence >= 1 THEN duration_max ELSE NULL END) AS duration_max,
       MAX(attributes) AS attributes
FROM greptime_private.semantic_relationships
WHERE rel_type = 'calls'
  AND ${timePredicate(range)}${endpointFilter}
GROUP BY src_type, src_id, dst_type, dst_id, COALESCE(provenance, 'trace')
ORDER BY request_count DESC, unmatched_count DESC
LIMIT ${SERVICE_MAP_RELATIONSHIP_ROWS_LIMIT}`
}

/** @deprecated Prefer buildServiceMapCallsSql. */
export function buildServiceMapRelationshipsSql(
  range: ServiceMapQueryRange,
  options: ServiceMapQueryOptions = {}
): string {
  return buildServiceMapCallsSql(range, options)
}

/** Declared dependency / ownership edges (no RED aggregation). */
export function buildServiceMapDeclaredSql(range: ServiceMapQueryRange, options: ServiceMapQueryOptions = {}): string {
  const ids = (options.serviceIds ?? []).filter(Boolean)
  const endpointFilter = ids.length
    ? `\n  AND (src_id IN (${sqlStringList(ids)}) OR dst_id IN (${sqlStringList(ids)}))`
    : ''
  const relList = DECLARED_REL_TYPES.map((rel) => `'${rel}'`).join(', ')
  return `SELECT src_type, src_id, dst_type, dst_id, rel_type,
       COALESCE(provenance, 'declared') AS provenance,
       MAX(confidence) AS confidence,
       MAX(attributes) AS attributes
FROM greptime_private.semantic_relationships
WHERE rel_type IN (${relList})
  AND ${timePredicate(range)}${endpointFilter}
GROUP BY src_type, src_id, dst_type, dst_id, rel_type, COALESCE(provenance, 'declared')
ORDER BY rel_type, src_id, dst_id
LIMIT ${SERVICE_MAP_RELATIONSHIP_ROWS_LIMIT}`
}

/**
 * Structural edges for expanded services. Prefer scoping via serviceIds / instanceIds
 * so LIMIT is not eaten by unrelated services.
 */
export function buildServiceMapStructuralSql(
  range: ServiceMapQueryRange,
  relTypes: string[],
  options: { serviceIds?: string[]; instanceIds?: string[] } = {}
): string {
  const structural = relTypes.filter(isStructuralRelType)
  if (!structural.length) {
    return `SELECT src_type, src_id, dst_type, dst_id, rel_type
FROM greptime_private.semantic_relationships
WHERE 1 = 0`
  }
  const serviceIds = (options.serviceIds ?? []).filter(Boolean)
  const instanceIds = (options.instanceIds ?? []).filter(Boolean)
  const hasPartOf = structural.includes('part_of')
  const hasRunsOn = structural.includes('runs_on')
  const otherRels = structural.filter((rel) => rel !== 'part_of' && rel !== 'runs_on')
  const predicates: string[] = []
  if (hasPartOf) {
    const serviceScope =
      serviceIds.length > 0 ? ` AND dst_type = 'service' AND dst_id IN (${sqlStringList(serviceIds)})` : ''
    predicates.push(`(rel_type = 'part_of'${serviceScope})`)
  }
  if (hasRunsOn) {
    const instanceScope = instanceIds.length > 0 ? ` AND src_id IN (${sqlStringList(instanceIds)})` : ''
    predicates.push(`(rel_type = 'runs_on'${instanceScope})`)
  }
  if (otherRels.length) {
    predicates.push(`rel_type IN (${sqlStringList(otherRels)})`)
  }
  return `SELECT DISTINCT src_type, src_id, dst_type, dst_id, rel_type
FROM greptime_private.semantic_relationships
WHERE (${predicates.join(' OR ')})
  AND ${timePredicate(range)}
ORDER BY rel_type, src_id, dst_id
LIMIT ${SERVICE_MAP_RELATIONSHIP_ROWS_LIMIT}`
}

/** Maps service instances to their owning service; never infer ownership from IDs. */
export function buildServiceMapInstanceCountsSql(range: ServiceMapQueryRange, serviceId?: string): string {
  const servicePredicate = serviceId === undefined ? '' : `\n  AND dst_id = '${serviceId.replace(/'/g, "''")}'`
  const limit = serviceId === undefined ? '' : '\nLIMIT 1'
  return `SELECT dst_type, dst_id, COUNT(DISTINCT src_id) AS instance_count
FROM greptime_private.semantic_relationships
WHERE rel_type = 'part_of'
  AND src_type = 'service.instance'
  AND dst_type = 'service'
  AND confidence = 1.0
${servicePredicate}
  AND ${timePredicate(range)}
GROUP BY dst_type, dst_id${limit}`
}

/** SQL Explorer deep-link: calls for one service in the current window. */
export function buildServiceMapOpenInSql(range: ServiceMapQueryRange, serviceId: string): string {
  const id = serviceId.replace(/'/g, "''")
  return `SELECT src_type, src_id, dst_type, dst_id, rel_type,
       COALESCE(provenance, 'trace') AS provenance,
       confidence,
       request_count, error_count, unmatched_count,
       duration_sum, duration_count, duration_max, attributes, observed_at
FROM greptime_private.semantic_relationships
WHERE rel_type = 'calls'
  AND (src_id = '${id}' OR dst_id = '${id}')
  AND ${timePredicate(range)}
ORDER BY observed_at DESC
LIMIT 500`
}
