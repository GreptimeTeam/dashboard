import { expect, test } from '../fixtures'
import { EXPECT } from '../data/dataset'
import { SEED_START, timeRangeQuery } from '../env'
import { metricsUrl, promSeries, visit, waitProm } from '../helpers'

test.describe('metrics query', () => {
  test('range query returns one series per host with the seeded values', async ({ app }) => {
    const response = waitProm(app, 'e2e_cpu_usage')
    await visit(app, metricsUrl('e2e_cpu_usage'))
    const series = await promSeries(await response)

    expect(series.map((s) => s.metric.instance).sort()).toEqual(['e2e-host-0', 'e2e-host-1', 'e2e-host-2'])
    series.forEach((s) => {
      const host = Number(s.metric.instance.slice(-1))
      const values = s.values.map(([, v]) => Number(v))
      // Host N cycles through (N+1)*10 .. (N+1)*10 + 9.
      expect(Math.min(...values)).toBe((host + 1) * 10)
      expect(Math.max(...values)).toBe((host + 1) * 10 + 9)
    })
    await expect(app.locator('canvas').first()).toBeVisible()
  })

  test('aggregation collapses the hosts into one series', async ({ app }) => {
    const response = waitProm(app, 'sum(e2e_cpu_usage)')
    await visit(app, metricsUrl('sum(e2e_cpu_usage)'))
    const series = await promSeries(await response)

    expect(series).toHaveLength(1)
    // 10 + 20 + 30 plus three times the minute-in-decade offset (0..9).
    series[0].values.forEach(([, v]) => {
      expect(Number(v)).toBeGreaterThanOrEqual(60)
      expect(Number(v)).toBeLessThanOrEqual(87)
    })
  })

  test('label matcher narrows to a single host', async ({ app }) => {
    const query = 'e2e_cpu_usage{instance="e2e-host-1"}'
    const response = waitProm(app, query)
    await visit(app, metricsUrl(query))
    const series = await promSeries(await response)
    expect(series).toHaveLength(1)
    expect(series[0].metric.instance).toBe('e2e-host-1')
  })

  test('table tab runs an instant query at a fixed time', async ({ app }) => {
    const at = SEED_START + 30 * 60 // minute 30 => offset 0 for every host
    const response = waitProm(app, 'e2e_cpu_usage')
    await visit(app, `${metricsUrl('e2e_cpu_usage', { tab: 'table' })}&instantTime=${at}`)
    const result = await promSeries(await response)
    expect(result).toHaveLength(EXPECT.cpu.series)
    const values = result.map((s: any) => Number(s.value?.[1])).sort((a, b) => a - b)
    expect(values).toEqual([10, 20, 30])
    await expect(app.locator('.vxe-body--row')).toHaveCount(EXPECT.cpu.series)
  })

  test('unknown metric yields no series', async ({ app }) => {
    const response = waitProm(app, 'e2e_no_such_metric')
    await visit(app, metricsUrl('e2e_no_such_metric'))
    expect(await promSeries(await response)).toHaveLength(0)
  })

  test('a window without data yields no series', async ({ app }) => {
    const response = waitProm(app, 'e2e_cpu_usage')
    await visit(app, metricsUrl('e2e_cpu_usage', { timeQuery: timeRangeQuery(1_600_000_000, 1_600_003_600) }))
    expect(await promSeries(await response)).toHaveLength(0)
  })
})
