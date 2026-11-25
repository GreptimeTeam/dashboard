import { describe, expect, it } from 'vitest'
import en from '@/locale/en-US'
import zh from '@/locale/zh-CN'
import ja from '@/locale/ja-JP'
import {
  traceLogsEmptyKey,
  traceLogsEmptyReason,
  type TraceLogsEmptyReason,
  type TraceLogsPanelSource,
} from './trace-logs-empty-state'

const SOURCES: TraceLogsPanelSource[] = ['query', 'explore']
const REASONS: TraceLogsEmptyReason[] = ['no-table', 'no-trace-column', 'no-rows']
const dictionaries: Record<string, Record<string, unknown>> = { 'en-US': en, 'zh-CN': zh, 'ja-JP': ja }

describe('trace logs empty state', () => {
  it('reports a missing table before anything else', () => {
    expect(traceLogsEmptyReason({ hasTarget: false, missingTraceColumn: false })).toBe('no-table')
    expect(traceLogsEmptyReason({ hasTarget: false, missingTraceColumn: true })).toBe('no-table')
  })

  it('reports a table without a trace id column', () => {
    expect(traceLogsEmptyReason({ hasTarget: true, missingTraceColumn: true })).toBe('no-trace-column')
  })

  it('falls back to "no rows" once the table was asked', () => {
    expect(traceLogsEmptyReason({ hasTarget: true, missingTraceColumn: false })).toBe('no-rows')
  })

  it('defaults to the Logs Query wording', () => {
    expect(traceLogsEmptyKey('no-rows')).toBe('drilldown.traces.traceLogsEmpty')
  })

  it('differs only where the user has to go to pick the logs table', () => {
    expect(traceLogsEmptyKey('no-table', 'query')).toBe('drilldown.traces.traceLogsNoTable')
    expect(traceLogsEmptyKey('no-table', 'explore')).toBe('drilldown.traces.traceLogsNoTableExplore')
    expect(traceLogsEmptyKey('no-trace-column', 'query')).toBe('drilldown.traces.traceLogsNoTraceColumn')
    expect(traceLogsEmptyKey('no-trace-column', 'explore')).toBe('drilldown.traces.traceLogsNoTraceColumnExplore')
    expect(traceLogsEmptyKey('no-rows', 'explore')).toBe('drilldown.traces.traceLogsEmptyExplore')
  })

  it('resolves to a key that exists in every locale', () => {
    SOURCES.forEach((source) => {
      REASONS.forEach((reason) => {
        const key = traceLogsEmptyKey(reason, source)
        Object.entries(dictionaries).forEach(([locale, dictionary]) => {
          expect(dictionary[key], `${locale} is missing ${key}`).toBeTruthy()
        })
      })
    })
  })
})
