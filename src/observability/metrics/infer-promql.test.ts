import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSemanticsCache, inferMetricKind, resolveMetricMeta } from '../semantics'
import { inferPromQL } from './infer-promql'

vi.mock('@/api/editor', () => ({
  default: {
    runSQL: vi.fn(),
  },
}))

vi.mock('../current-database', () => ({
  currentDatabase: () => 'public',
}))

describe('infer-promql', () => {
  beforeEach(async () => {
    clearSemanticsCache()
    const editorApi = (await import('@/api/editor')).default
    vi.mocked(editorApi.runSQL).mockReset()
  })

  it('infers counter and histogram from name', () => {
    expect(inferMetricKind('http_requests_total')).toBe('counter')
    expect(inferMetricKind('http_request_duration_seconds')).toBe('histogram')
    expect(inferPromQL('http_requests_total')).toBe('sum(rate(http_requests_total[5m]))')
  })

  it('prefers declared table_semantics over name heuristic', async () => {
    const editorApi = (await import('@/api/editor')).default
    vi.mocked(editorApi.runSQL).mockResolvedValue({
      output: [
        {
          records: {
            schema: {
              column_schemas: [{ name: 'table_name' }, { name: 'metadata_quality' }, { name: 'semantic_options' }],
            },
            rows: [['odd_gauge_total', 'declared', JSON.stringify({ 'metric.type': 'gauge' })]],
          },
        },
      ],
    } as never)

    await expect(resolveMetricMeta('odd_gauge_total')).resolves.toMatchObject({ kind: 'gauge' })
    expect(inferPromQL('odd_gauge_total', undefined, 'gauge')).toBe('avg(odd_gauge_total)')
    expect(inferPromQL('odd_gauge_total', undefined, { kind: 'gauge' })).toBe('avg(odd_gauge_total)')
  })

  it('falls back to heuristic when semantics missing', async () => {
    const editorApi = (await import('@/api/editor')).default
    vi.mocked(editorApi.runSQL).mockRejectedValue(new Error('no view'))

    await expect(resolveMetricMeta('http_requests_total')).resolves.toMatchObject({ kind: 'counter' })
  })
})
