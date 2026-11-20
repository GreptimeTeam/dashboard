import { describe, expect, it } from 'vitest'
import {
  defaultSinkName,
  looksLikeCompleteFlowDdl,
  looksLikeFlowDdl,
  quoteFlowIdent,
  toReplaceFlowSql,
} from './flow-sql'

const CANONICAL_EDIT_DDL = `CREATE FLOW IF NOT EXISTS my_flow
SINK TO public.my_sink
EXPIRE AFTER '3600 s'
EVAL INTERVAL '60 s'
COMMENT 'my flow'
AS SELECT max(temperature) AS max_temp, date_bin('10 seconds'::INTERVAL, ts) AS time_window FROM public.temp_sensor_data GROUP BY time_window`

describe('looksLikeFlowDdl', () => {
  it('detects full CREATE FLOW statements', () => {
    expect(looksLikeFlowDdl('CREATE FLOW f SINK TO s AS SELECT 1')).toBe(true)
    expect(looksLikeFlowDdl('  create or replace flow f sink to s as select 1')).toBe(true)
    expect(looksLikeFlowDdl('\nCREATE FLOW IF NOT EXISTS f SINK TO s AS SELECT 1')).toBe(true)
  })

  it('treats query bodies as query bodies', () => {
    expect(looksLikeFlowDdl('SELECT max(t) AS max_t FROM t')).toBe(false)
    expect(looksLikeFlowDdl("TQL EVAL (now() - INTERVAL '5m', now(), '1m') rate(x[5m])")).toBe(false)
  })
})

describe('toReplaceFlowSql', () => {
  it('rewrites the canonical SHOW CREATE FLOW prefix', () => {
    const sql = toReplaceFlowSql(CANONICAL_EDIT_DDL)
    expect(sql.startsWith('CREATE OR REPLACE FLOW my_flow')).toBe(true)
    expect(sql).toContain(`SINK TO public.my_sink\nEXPIRE AFTER '3600 s'`)
    expect(sql).toContain('EVAL INTERVAL')
  })

  it('keeps an already replacing statement unchanged', () => {
    const sql = 'CREATE OR REPLACE FLOW f\nSINK TO s\nAS SELECT 1'
    expect(toReplaceFlowSql(sql)).toBe(sql)
  })

  it('only touches the prologue', () => {
    const body = `CREATE FLOW f\nSINK TO s\nCOMMENT 'CREATE FLOW IF NOT EXISTS inside a comment'\nAS SELECT 1`
    expect(toReplaceFlowSql(body)).toBe(
      `CREATE OR REPLACE FLOW f\nSINK TO s\nCOMMENT 'CREATE FLOW IF NOT EXISTS inside a comment'\nAS SELECT 1`
    )
  })
})

describe('quoteFlowIdent', () => {
  it('quotes plain names', () => {
    expect(quoteFlowIdent('my_flow')).toBe('"my_flow"')
  })

  it('keeps names that need quoting usable', () => {
    expect(quoteFlowIdent('my-flow v2')).toBe('"my-flow v2"')
  })

  it('doubles embedded quotes', () => {
    expect(quoteFlowIdent('a"b')).toBe('"a""b"')
  })
})

describe('defaultSinkName', () => {
  it('derives the sink name from the flow name', () => {
    expect(defaultSinkName('my_flow')).toBe('my_flow_sink')
    expect(defaultSinkName('  my_flow  ')).toBe('my_flow_sink')
  })

  it('stays empty without a flow name', () => {
    expect(defaultSinkName('')).toBe('')
    expect(defaultSinkName('   ')).toBe('')
  })
})

describe('looksLikeCompleteFlowDdl', () => {
  it('detects a full statement with SINK TO', () => {
    expect(looksLikeCompleteFlowDdl(CANONICAL_EDIT_DDL)).toBe(true)
    expect(looksLikeCompleteFlowDdl('CREATE OR REPLACE FLOW f SINK TO s AS SELECT 1')).toBe(true)
  })

  it('ignores partial input and plain queries', () => {
    expect(looksLikeCompleteFlowDdl('CREATE FLOW my_flow')).toBe(false)
    expect(looksLikeCompleteFlowDdl('SELECT max(t) FROM x')).toBe(false)
  })
})
