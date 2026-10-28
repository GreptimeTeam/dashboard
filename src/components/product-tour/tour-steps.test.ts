import { describe, expect, it } from 'vitest'
import { decodeMaybeEncoded } from '@/utils/query-url'
import enTour from '@/locale/en-US/tour'
import zhTour from '@/locale/zh-CN/tour'
import { MCP_SERVER_REPO_URL } from '@/utils/mcp-config'
import {
  TOUR_EXPLORE_TIME_LENGTH,
  TOUR_LOGS_BUILDER_FORM,
  TOUR_PROMQL_QUERY,
  TOUR_SQL_QUERY,
  TOUR_STEPS,
  TOUR_STEP_IDS,
  TOUR_TQL_QUERY,
  TOUR_TRACES_BUILDER_FORM,
  getTourBrowseQuery,
  getTourExploreCaseQuery,
  getTourStep,
  isTourStepId,
  matchTourStepFromRoute,
} from './tour-steps'

describe('tour steps config', () => {
  it('contains the 8 canonical steps in order', () => {
    expect(TOUR_STEP_IDS).toEqual(['signals-explore', 'sql', 'promql', 'tql', 'logs', 'traces', 'visualization', 'mcp'])
    expect(new Set(TOUR_STEP_IDS).size).toBe(TOUR_STEPS.length)
    expect(TOUR_STEPS[0].id).toBe('signals-explore')
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].id).toBe('mcp')
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
    expect(getTourStep('signals-explore').location.query.timeLength).toBe(TOUR_EXPLORE_TIME_LENGTH)
    expect(getTourStep('logs').preset?.timeRangeKey).toBe('tour.presets.last1Hour')
    expect(getTourStep('traces').preset?.timeRangeKey).toBe('tour.presets.last1Hour')
  })

  it('defines Signals Explore cases without per-case timeLength', () => {
    const step = getTourStep('signals-explore')
    expect(step.cases?.map((item) => item.id)).toEqual(['metrics', 'logs', 'traces'])
    step.cases?.forEach((item) => {
      expect(item.query.signal).toBe(item.id)
      expect(item.query.timeLength).toBeUndefined()
    })
    expect(step.cases?.find((item) => item.id === 'logs')?.query.logsTable).toBe('opentelemetry_logs')
  })

  it('merges explore case query with shared topbar time/filters', () => {
    const step = getTourStep('signals-explore')
    expect(getTourExploreCaseQuery(step, 'logs', { timeLength: '45', filters: '%5B%5D' })).toEqual({
      timeLength: '45',
      filters: '%5B%5D',
      signal: 'logs',
      logsTable: 'opentelemetry_logs',
    })
    expect(getTourExploreCaseQuery(step, 'traces', {})).toEqual({
      timeLength: TOUR_EXPLORE_TIME_LENGTH,
      signal: 'traces',
    })
    expect(getTourExploreCaseQuery(step, 'metrics', { timeRange: '1,2' })).toEqual({
      timeRange: '1,2',
      signal: 'metrics',
    })
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

  it('maps every step to its primary GreptimeDB capability docs', () => {
    const docsPaths: Record<string, string> = {
      'sql': '/user-guide/query-data/sql/',
      'promql': '/user-guide/query-data/promql/',
      'tql': '/reference/sql/tql/',
      'logs': '/user-guide/logs/overview/',
      'traces': '/user-guide/traces/read-write/',
      'signals-explore': '/user-guide/concepts/why-greptimedb/#why-one-engine-for-three-signals',
      'visualization': '/getting-started/installation/greptimedb-dashboard/',
      'mcp': MCP_SERVER_REPO_URL,
    }

    TOUR_STEPS.forEach((step) => {
      expect(step.docsPath).toBe(docsPaths[step.id])
    })
  })

  it('defines MCP as an action-only step without a route location', () => {
    const step = getTourStep('mcp')
    expect(step.action).toBe('open-mcp-config')
    expect(step.location).toBeUndefined()
    expect(step.baseRouteName).toBeUndefined()
    expect(getTourBrowseQuery(step)).toEqual({})
  })

  it('ships en/zh copy for every step', () => {
    ;[enTour, zhTour].forEach((messages) => {
      TOUR_STEPS.forEach((step) => {
        const key = step.nameKey.replace(/\.name$/, '')
        expect(messages[`${key}.name`]).toBeTruthy()
        expect(messages[`${key}.title`]).toBeTruthy()
        // Action steps (MCP) open a modal only — no guide prose.
        if (step.action) {
          expect(messages[`${key}.capability`]).toBeUndefined()
          expect(messages[`${key}.scenario`]).toBeUndefined()
          expect(messages[`${key}.points.0.lead`]).toBeUndefined()
          expect(messages[`${key}.where.0`]).toBeUndefined()
          return
        }
        expect(messages[`${key}.scenarioTitle`]).toBeTruthy()
        expect(messages[`${key}.capability`]).toBeTruthy()
        expect(messages[`${key}.subtitle`]).toBeUndefined()
        expect(messages[`${key}.points.0.lead`]).toBeTruthy()
        expect(messages[`${key}.points.0.detail`]).toBeTruthy()
        if (step.cases?.length) {
          step.cases.forEach((item) => {
            expect(messages[item.titleKey]).toBeTruthy()
            expect(messages[item.detailKey]).toBeTruthy()
          })
          expect(messages[`${key}.scenario`]).toBeUndefined()
          expect(messages[`${key}.where.0`]).toBeUndefined()
        } else {
          expect(messages[`${key}.scenario`]).toBeTruthy()
          if (step.display === 'where') {
            expect(messages[`${key}.where.0`]).toBeTruthy()
          }
        }
      })
      expect(messages['tour.welcome.title']).toBeTruthy()
      expect(messages['tour.welcome.begin']).toBeTruthy()
      expect(messages['tour.guide.title']).toBeTruthy()
      expect(messages['tour.guide.close']).toBeTruthy()
      expect(messages['tour.guide.switchSteps']).toBeTruthy()
      expect(messages['tour.guide.switchStepsHint']).toBeTruthy()
      expect(messages['tour.guide.viewDocs']).toBeTruthy()
      expect(messages['tour.guide.tryACase']).toBeTruthy()
      expect(messages['tour.guide.pillWithStep']).toBeTruthy()
      expect(messages['tour.guide.runQuery']).toBeTruthy()
      expect(messages['tour.guide.zoneExplain']).toBeTruthy()
      expect(messages['tour.guide.theQuery']).toBeTruthy()
      expect(messages['tour.guide.stepLoaded']).toBeTruthy()
    })
  })

  it('browse query omits fill/run payloads', () => {
    expect(getTourBrowseQuery(getTourStep('sql'))).toEqual({})
    expect(getTourBrowseQuery(getTourStep('promql'))).toEqual({
      timeLength: '30',
      stepType: 'medium',
      tab: 'graph',
    })
    expect(getTourBrowseQuery(getTourStep('logs'))).toEqual({
      editorType: 'builder',
      timeLength: '60',
    })
    expect(getTourBrowseQuery(getTourStep('signals-explore'))).toEqual({
      signal: 'metrics',
      timeLength: TOUR_EXPLORE_TIME_LENGTH,
    })
    expect(getTourBrowseQuery(getTourStep('visualization'))).toEqual({
      dashboard: 'astronomy-shop-overview',
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
    expect(enTour['tour.steps.mcp.name']).toBe('GreptimeDB MCP')
    expect(zhTour['tour.steps.sql.name']).toBe('Table 查询 - SQL')
    expect(zhTour['tour.steps.tql.name']).toBe('Table 查询 - TQL')
    expect(zhTour['tour.steps.promql.name']).toBe('Metrics 查询')
    expect(zhTour['tour.steps.logs.name']).toBe('Logs 查询')
    expect(zhTour['tour.steps.traces.name']).toBe('Traces 查询')
    expect(zhTour['tour.steps.signals-explore.name']).toBe('信号探索')
    expect(zhTour['tour.steps.visualization.name']).toBe('可视化')
    expect(zhTour['tour.steps.mcp.name']).toBe('GreptimeDB MCP')
  })

  it('uses the same sprite icons as the navbar routes', () => {
    expect(getTourStep('sql').icon).toBe('table')
    expect(getTourStep('tql').icon).toBe('table')
    expect(getTourStep('promql').icon).toBe('metric')
    expect(getTourStep('logs').icon).toBe('Icon5')
    expect(getTourStep('traces').icon).toBe('Icon7')
    expect(getTourStep('visualization').icon).toBe('visualize')
    expect(getTourStep('mcp').icon).toBe('code')
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

  it('never matches the MCP action step from a route', () => {
    expect(matchTourStepFromRoute({ name: 'query', query: {} }, 'mcp')).toBe('sql')
    expect(matchTourStepFromRoute({ name: 'mcp', query: {} })).toBeNull()
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
