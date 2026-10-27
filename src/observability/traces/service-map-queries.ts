export interface ServiceMapQueryRange {
  startUnix: number
  endUnix: number
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

/** Latest observation per service in the selected half-open window. */
export function buildServiceMapEntitiesSql(range: ServiceMapQueryRange): string {
  return `SELECT entity_type, entity_id, entity_id_attrs, scope, descriptive, source_tables
FROM (
  SELECT entity_type, entity_id, entity_id_attrs, scope, descriptive, source_tables,
         ROW_NUMBER() OVER (
           PARTITION BY entity_type, entity_id
           ORDER BY observed_at DESC
         ) AS rn
  FROM greptime_private.semantic_entities
  WHERE entity_type = 'service'
    AND ${timePredicate(range)}
) t
WHERE rn = 1
ORDER BY entity_id
LIMIT ${SERVICE_MAP_ENTITY_ROWS_LIMIT}`
}

/**
 * Calls RED aggregated to one row per endpoint pair.
 * Paired RED uses confidence >= 1 only; unmatched always sums.
 */
export function buildServiceMapCallsSql(range: ServiceMapQueryRange): string {
  return `SELECT src_type, src_id, dst_type, dst_id, 'calls' AS rel_type,
       SUM(CASE WHEN confidence >= 1 THEN request_count ELSE 0 END) AS request_count,
       SUM(CASE WHEN confidence >= 1 THEN error_count ELSE 0 END) AS error_count,
       SUM(unmatched_count) AS unmatched_count,
       SUM(CASE WHEN confidence >= 1 THEN duration_sum ELSE 0 END) AS duration_sum,
       SUM(CASE WHEN confidence >= 1 THEN duration_count ELSE 0 END) AS duration_count,
       MAX(CASE WHEN confidence >= 1 THEN duration_max ELSE NULL END) AS duration_max,
       MAX(attributes) AS attributes
FROM greptime_private.semantic_relationships
WHERE rel_type = 'calls'
  AND ${timePredicate(range)}
GROUP BY src_type, src_id, dst_type, dst_id
ORDER BY request_count DESC, unmatched_count DESC
LIMIT ${SERVICE_MAP_RELATIONSHIP_ROWS_LIMIT}`
}

/** @deprecated Prefer buildServiceMapCallsSql. */
export function buildServiceMapRelationshipsSql(range: ServiceMapQueryRange): string {
  return buildServiceMapCallsSql(range)
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
