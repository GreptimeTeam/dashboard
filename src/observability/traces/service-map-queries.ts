export interface ServiceMapQueryRange {
  startUnix: number
  endUnix: number
}

export const SERVICE_MAP_ENTITY_ROWS_LIMIT = 500
export const SERVICE_MAP_RELATIONSHIP_ROWS_LIMIT = 500

function timePredicate(range: ServiceMapQueryRange): string {
  return `observed_at >= FROM_UNIXTIME(${Math.floor(range.startUnix)}) AND observed_at < FROM_UNIXTIME(${Math.floor(
    range.endUnix
  )})`
}

/** Semantic Graph entity observations in the selected half-open window. */
export function buildServiceMapEntitiesSql(range: ServiceMapQueryRange): string {
  return `SELECT DISTINCT observed_at, entity_type, entity_id, entity_id_attrs, scope, descriptive, source_tables
FROM greptime_private.semantic_entities
WHERE entity_type = 'service'
  AND ${timePredicate(range)}
ORDER BY observed_at DESC
LIMIT ${SERVICE_MAP_ENTITY_ROWS_LIMIT}`
}

/** Calls RED grouped by the endpoint identity and confidence population. */
export function buildServiceMapRelationshipsSql(range: ServiceMapQueryRange): string {
  return `SELECT src_type, src_id, dst_type, dst_id, provenance, confidence,
       SUM(request_count) AS request_count,
       SUM(error_count) AS error_count,
       SUM(unmatched_count) AS unmatched_count,
       SUM(duration_sum) AS duration_sum,
       SUM(duration_count) AS duration_count,
       MAX(duration_max) AS duration_max
FROM greptime_private.semantic_relationships
WHERE rel_type = 'calls'
  AND ${timePredicate(range)}
GROUP BY src_type, src_id, dst_type, dst_id, provenance, confidence
ORDER BY request_count DESC
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
