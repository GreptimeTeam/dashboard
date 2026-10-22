import { describe, expect, it } from 'vitest'
import {
  buildServiceMapEntitiesSql,
  buildServiceMapInstanceCountsSql,
  buildServiceMapRelationshipsSql,
} from './service-map-queries'

describe('Service Map semantic queries', () => {
  const range = { startUnix: 1_789_696_923.8, endUnix: 1_789_785_123.9 }

  it('bounds service entities by the selected half-open time range and limits rows', () => {
    const sql = buildServiceMapEntitiesSql(range)
    expect(sql).toContain("entity_type = 'service'")
    expect(sql).toContain('observed_at >= FROM_UNIXTIME(1789696923)')
    expect(sql).toContain('observed_at < FROM_UNIXTIME(1789785123)')
    expect(sql).toContain('LIMIT 500')
  })

  it('aggregates call RED by typed endpoints and confidence', () => {
    const sql = buildServiceMapRelationshipsSql(range)
    expect(sql).toContain("rel_type = 'calls'")
    expect(sql).toContain('GROUP BY src_type, src_id, dst_type, dst_id, provenance, confidence')
    expect(sql).toContain('SUM(request_count) AS request_count')
    expect(sql).toContain('SUM(error_count) AS error_count')
    expect(sql).toContain('SUM(unmatched_count) AS unmatched_count')
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
})
