import { describe, expect, it } from 'vitest'
import { decodeMaybeEncoded } from '@/utils/query-url'
import enTour from '@/locale/en-US/tour'
import zhTour from '@/locale/zh-CN/tour'
import {
  TOUR_LOGS_BUILDER_FORM,
  TOUR_PROMQL_QUERY,
  TOUR_SQL_QUERY,
  TOUR_STEPS,
  TOUR_STEP_IDS,
  TOUR_TQL_QUERY,
  TOUR_TRACES_BUILDER_FORM,
  getTourStep,
  isTourStepId,
  matchTourStepFromRoute,
} from './tour-steps'

describe('tour steps config', () => {
  it('contains the 7 canonical steps in order', () => {
    expect(TOUR_STEP_IDS).toEqual(['sql', 'promql', 'tql', 'logs', 'traces', 'signals-explore', 'visualization'])
    expect(new Set(TOUR_STEP_IDS).size).toBe(TOUR_STEPS.length)
  })

  it('keeps display payload consistent with the display type', () => {
    TOUR_STEPS.forEach((step) => {
      expect(['code', 'preset', 'where']).toContain(step.display)
      if (step.display === 'code') {
        expect(step.code?.trim()).toBeTruthy()
        expect(step.builderForm).toBeUndefined()
      }
      if (step.display === 'preset') {
        expect(step.preset?.table).toBeTruthy()
        expect(step.preset?.filters.length).toBeGreaterThan(0)
        expect(step.builderForm).toBeTruthy()
      }
      if (step.display === 'where') {
        expect(step.code).toBeUndefined()
        expect(step.builderForm).toBeUndefined()
      }
    })
  })

  it('uses relative timeLength in minutes', () => {
    expect(getTourStep('promql').location.query.timeLength).toBe('30')
    expect(getTourStep('logs').location.query.timeLength).toBe('60')
    expect(getTourStep('traces').location.query.timeLength).toBe('60')
    expect(getTourStep('signals-explore').location.query.timeLength).toBe('30')
    expect(getTourStep('logs').preset?.timeRangeKey).toBe('tour.presets.last1Hour')
    expect(getTourStep('traces').preset?.timeRangeKey).toBe('tour.presets.last1Hour')
  })

  it('round-trips encoded query payloads', () => {
    const sqlStep = getTourStep('sql')
    const tqlStep = getTourStep('tql')
    const promqlStep = getTourStep('promql')
    const logsStep = getTourStep('logs')
    const tracesStep = getTourStep('traces')

    expect(decodeMaybeEncoded(sqlStep.location.query.sql).trim()).toBe(TOUR_SQL_QUERY.trim())
    expect(decodeMaybeEncoded(tqlStep.location.query.sql).trim()).toBe(TOUR_TQL_QUERY.trim())
    expect(decodeMaybeEncoded(promqlStep.location.query.promql)).toBe(TOUR_PROMQL_QUERY)
    expect(JSON.parse(decodeMaybeEncoded(logsStep.location.query.builderForm))).toEqual(TOUR_LOGS_BUILDER_FORM)
    expect(JSON.parse(decodeMaybeEncoded(tracesStep.location.query.builderForm))).toEqual(TOUR_TRACES_BUILDER_FORM)
  })

  it('ships en/zh copy for every step', () => {
    ;[enTour, zhTour].forEach((messages) => {
      TOUR_STEPS.forEach((step) => {
        const key = step.nameKey.replace(/\.name$/, '')
        expect(messages[`${key}.name`]).toBeTruthy()
        expect(messages[`${key}.title`]).toBeTruthy()
        expect(messages[`${key}.intro`]).toBeTruthy()
        expect(messages[`${key}.points.0.lead`]).toBeTruthy()
        expect(messages[`${key}.points.0.detail`]).toBeTruthy()
        if (step.display === 'where') {
          expect(messages[`${key}.where.0`]).toBeTruthy()
        }
      })
      expect(messages['tour.welcome.title']).toBeTruthy()
      expect(messages['tour.welcome.begin']).toBeTruthy()
      expect(messages['tour.guide.title']).toBeTruthy()
      expect(messages['tour.guide.close']).toBeTruthy()
      expect(messages['tour.guide.switchSteps']).toBeTruthy()
      expect(messages['tour.guide.zoneExplain']).toBeTruthy()
      expect(messages['tour.guide.theQuery']).toBeTruthy()
      expect(messages['tour.guide.tryWhere']).toBeTruthy()
      expect(messages['tour.guide.stepLoaded']).toBeTruthy()
    })
  })

  it('aligns short names with navbar menu labels', () => {
    expect(enTour['tour.steps.sql.name']).toBe('Table Query - SQL')
    expect(enTour['tour.steps.tql.name']).toBe('Table Query - TQL')
    expect(enTour['tour.steps.promql.name']).toBe('Metrics Query')
    expect(enTour['tour.steps.logs.name']).toBe('Logs Query')
    expect(enTour['tour.steps.traces.name']).toBe('Traces Query')
    expect(enTour['tour.steps.signals-explore.name']).toBe('Signals Explore')
    expect(enTour['tour.steps.visualization.name']).toBe('Visualization')
    expect(zhTour['tour.steps.sql.name']).toBe('Table 查询 - SQL')
    expect(zhTour['tour.steps.tql.name']).toBe('Table 查询 - TQL')
    expect(zhTour['tour.steps.promql.name']).toBe('Metrics 查询')
    expect(zhTour['tour.steps.logs.name']).toBe('Logs 查询')
    expect(zhTour['tour.steps.traces.name']).toBe('Traces 查询')
    expect(zhTour['tour.steps.signals-explore.name']).toBe('信号探索')
    expect(zhTour['tour.steps.visualization.name']).toBe('可视化')
  })

  it('uses the same sprite icons as the navbar routes', () => {
    expect(getTourStep('sql').icon).toBe('table')
    expect(getTourStep('tql').icon).toBe('table')
    expect(getTourStep('promql').icon).toBe('metric')
    expect(getTourStep('logs').icon).toBe('Icon5')
    expect(getTourStep('traces').icon).toBe('Icon7')
    expect(getTourStep('visualization').icon).toBe('visualize')
  })
})

describe('matchTourStepFromRoute', () => {
  it('splits /dashboard/query between SQL and TQL by exact ?sql=', () => {
    expect(matchTourStepFromRoute({ name: 'query', query: { sql: encodeURIComponent(TOUR_SQL_QUERY) } })).toBe('sql')
    expect(matchTourStepFromRoute({ name: 'query', query: { sql: encodeURIComponent(TOUR_TQL_QUERY) } })).toBe('tql')
  })

  it('keeps the active query-page step when the param cannot be matched', () => {
    expect(matchTourStepFromRoute({ name: 'query', query: {} }, 'tql')).toBe('tql')
    expect(matchTourStepFromRoute({ name: 'query', query: { sql: 'select 1' } }, 'sql')).toBe('sql')
  })

  it('falls back to the first base-matching step', () => {
    expect(matchTourStepFromRoute({ name: 'query', query: {} }, 'promql')).toBe('sql')
    expect(matchTourStepFromRoute({ name: 'query', query: {} })).toBe('sql')
  })

  it('maps module routes to their steps', () => {
    expect(matchTourStepFromRoute({ name: 'metrics', query: {} })).toBe('promql')
    expect(matchTourStepFromRoute({ name: 'log-query', query: {} })).toBe('logs')
    expect(matchTourStepFromRoute({ name: 'trace-query', query: {} })).toBe('traces')
    expect(matchTourStepFromRoute({ name: 'explore', query: {} })).toBe('signals-explore')
    expect(matchTourStepFromRoute({ name: 'perses', query: {} })).toBe('visualization')
    expect(matchTourStepFromRoute({ name: 'flow', query: {} })).toBeNull()
  })
})

describe('helpers', () => {
  it('validates step ids and fetches steps', () => {
    expect(isTourStepId('logs')).toBe(true)
    expect(isTourStepId('nope')).toBe(false)
    expect(getTourStep('visualization').id).toBe('visualization')
    expect(() => getTourStep('nope' as never)).toThrow()
  })
})
