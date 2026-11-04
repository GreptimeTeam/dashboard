import { describe, expect, it } from 'vitest'
import {
  SERVICE_MAP_ENTITY_ROWS_LIMIT,
  SERVICE_MAP_RELATIONSHIP_ROWS_LIMIT,
  buildServiceMapCallsSql,
  buildServiceMapDeclaredSql,
  buildServiceMapEntitiesSql,
  buildServiceMapInstanceCountsSql,
  buildServiceMapRelationshipsSql,
  buildServiceMapStructuralSql,
} from './service-map-queries'

describe('Service Map semantic queries', () => {
  const range = { startUnix: 1_789_696_923.8, endUnix: 1_789_785_123.9 }

  it('dedupes services per scope with ROW_NUMBER and limits unique entities', () => {
    const sql = buildServiceMapEntitiesSql(range)
    expect(sql).toContain("entity_type = 'service'")
    expect(sql).toContain('ROW_NUMBER() OVER')
    expect(sql).toContain('PARTITION BY entity_type, entity_id, scope')
    expect(sql).toContain('ORDER BY observed_at DESC')
    expect(sql).toContain('WHERE rn = 1')
    expect(sql).toContain('observed_at >= FROM_UNIXTIME(1789696923)')
    expect(sql).toContain('observed_at < FROM_UNIXTIME(1789785123)')
    expect(sql).toContain(`LIMIT ${SERVICE_MAP_ENTITY_ROWS_LIMIT}`)
  })

  it('filters entities by optional service ids', () => {
    const sql = buildServiceMapEntitiesSql(range, { serviceIds: ['checkout', "o'brien"] })
    expect(sql).toContain("entity_id IN ('checkout', 'o''brien')")
  })

  it('aggregates call RED by endpoint pair and provenance', () => {
    const sql = buildServiceMapRelationshipsSql(range)
    expect(sql).toContain("rel_type = 'calls'")
    expect(sql).toContain("GROUP BY src_type, src_id, dst_type, dst_id, COALESCE(provenance, 'trace')")
    expect(sql).toContain("COALESCE(provenance, 'trace') AS provenance")
    expect(sql).toContain('MAX(confidence) AS confidence')
    expect(sql).toContain('SUM(CASE WHEN confidence >= 1 THEN request_count ELSE 0 END) AS request_count')
    expect(sql).toContain('SUM(CASE WHEN confidence >= 1 THEN error_count ELSE 0 END) AS error_count')
    expect(sql).toContain('SUM(unmatched_count) AS unmatched_count')
    expect(sql).toContain('ORDER BY request_count DESC, unmatched_count DESC')
    expect(sql).toContain(`LIMIT ${SERVICE_MAP_RELATIONSHIP_ROWS_LIMIT}`)
  })

  it('keeps one-hop neighbors when filtering calls by service ids', () => {
    const sql = buildServiceMapCallsSql(range, { serviceIds: ['api'] })
    expect(sql).toContain("src_id IN ('api') OR dst_id IN ('api')")
  })

  it('queries declared depends_on / owns without RED aggregation', () => {
    const sql = buildServiceMapDeclaredSql(range)
    expect(sql).toContain("rel_type IN ('depends_on', 'owns')")
    expect(sql).toContain("COALESCE(provenance, 'declared') AS provenance")
    expect(sql).not.toContain('request_count')
  })

  it('counts instances only through declared part_of relationships', () => {
    const sql = buildServiceMapInstanceCountsSql(range)
    expect(sql).toContain("rel_type = 'part_of'")
    expect(sql).toContain("src_type = 'service.instance'")
    expect(sql).toContain("dst_type = 'service'")
    expect(sql).toContain('COUNT(DISTINCT src_id) AS instance_count')
    expect(sql).toContain('observed_at >= FROM_UNIXTIME(1789696923)')
    expect(sql).toContain('observed_at < FROM_UNIXTIME(1789785123)')
  })

  it('scopes structural part_of and runs_on to expanded services / instances', () => {
    const partOf = buildServiceMapStructuralSql(range, ['part_of'], { serviceIds: ['svc-a', "o'brien"] })
    expect(partOf).toContain("rel_type = 'part_of'")
    expect(partOf).toContain("dst_type = 'service'")
    expect(partOf).toContain("dst_id IN ('svc-a', 'o''brien')")
    expect(partOf).not.toContain("rel_type = 'runs_on'")

    const runsOn = buildServiceMapStructuralSql(range, ['runs_on'], { instanceIds: ['i-1', 'i-2'] })
    expect(runsOn).toContain("rel_type = 'runs_on'")
    expect(runsOn).toContain("src_id IN ('i-1', 'i-2')")
    expect(runsOn).not.toContain("rel_type = 'part_of'")
  })
})
