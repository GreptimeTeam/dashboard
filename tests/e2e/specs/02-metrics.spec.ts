import { expect, test } from '../fixtures'
import { EXPECT } from '../data/dataset'
import { SEED_START } from '../env'
import { metricsUrl, promSeries, visit, waitProm } from '../helpers'
import { expectChartDrawn } from '../oracle'

test.describe('metrics query', () => {
  test('range query returns one series per host with the seeded values', { tag: '@smoke' }, async ({ app }) => {
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

  test('label matcher narrows to a single host', async ({ app }) => {
    const query = 'e2e_cpu_usage{instance="e2e-host-1"}'
    const response = waitProm(app, query)
    await visit(app, metricsUrl(query))
    const series = await promSeries(await response)
    expect(series).toHaveLength(1)
    expect(series[0].metric.instance).toBe('e2e-host-1')
    // The chart must actually draw the series — "a canvas exists" is not evidence.
    await expectChartDrawn(app, '.metrics-result-content')
  })

  test('the chart draws the series and is absent without data', async ({ app }) => {
    // Empty first: the test (and its report screenshot) ends on the chart that carries data.
    const empty = waitProm(app, 'e2e_no_such_metric')
    await visit(app, metricsUrl('e2e_no_such_metric'))
    expect(await promSeries(await empty)).toHaveLength(0)
    // No series => no chart canvas at all (previously "canvas visible" passed for empty results).
    await expect(app.locator('.metrics-result-content canvas')).toHaveCount(0)

    const withData = waitProm(app, 'e2e_cpu_usage')
    await visit(app, metricsUrl('e2e_cpu_usage'))
    expect(await promSeries(await withData)).toHaveLength(EXPECT.cpu.series)
    await expectChartDrawn(app, '.metrics-result-content')
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
})
