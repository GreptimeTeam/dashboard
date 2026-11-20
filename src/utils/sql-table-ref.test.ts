import { describe, expect, it } from 'vitest'
import { parseTable, parseTsColumnFromSql } from '@/views/dashboard/logs/query/until'
import { bareTableName, getTableRefForSql } from './sql'

describe('getTableRefForSql', () => {
  it('quotes bare table with database (builder mode)', () => {
    expect(getTableRefForSql({ table: 'genai_conversations', database: 'public' })).toBe(
      '"public"."genai_conversations"'
    )
  })

  it('does not double-quote an already quoted schema.table when database is also set', () => {
    // Code mode: parseTable stores a full SQL ref; queryState also has database.
    expect(
      getTableRefForSql({
        table: '"public"."genai_conversations"',
        database: 'public',
      })
    ).toBe('"public"."genai_conversations"')
  })

  it('quotes unquoted schema.table segments without prefixing database', () => {
    expect(getTableRefForSql({ table: 'public.genai_conversations', database: 'public' })).toBe(
      '"public"."genai_conversations"'
    )
  })

  it('quotes a bare table when only table is provided', () => {
    expect(getTableRefForSql({ table: 'logs' })).toBe('"logs"')
  })

  it('escapes embedded quotes in bare identifiers', () => {
    expect(getTableRefForSql({ table: 'weird"name', database: 'db' })).toBe('"db"."weird""name"')
  })
})

describe('bareTableName', () => {
  it('strips quoted schema.table to the table id', () => {
    expect(bareTableName('"public"."genai_conversations"')).toBe('genai_conversations')
  })

  it('handles unquoted schema.table', () => {
    expect(bareTableName('public.genai_conversations')).toBe('genai_conversations')
  })

  it('handles a bare name', () => {
    expect(bareTableName('logs')).toBe('logs')
    expect(bareTableName('"logs"')).toBe('logs')
  })
})

describe('parseTable + getTableRefForSql (code-mode COUNT path)', () => {
  it('keeps quoted schema.table intact when rebuilding COUNT FROM', () => {
    const sql =
      'SELECT * FROM "public"."genai_conversations" WHERE "timestamp" <= $timeend AND "timestamp" >= $timestart ORDER BY "timestamp" DESC LIMIT 1000'
    const table = parseTable(sql)
    expect(table).toBe('"public"."genai_conversations"')
    expect(getTableRefForSql({ table, database: 'public' })).toBe('"public"."genai_conversations"')
  })
})

describe('parseTsColumnFromSql', () => {
  it('reads the column from $timestart/$timeend filters', () => {
    const sql =
      'SELECT * FROM "vtype_db"."metrics" WHERE "ts" <= $timeend AND "ts" >= $timestart ORDER BY "ts" DESC LIMIT 1000'
    expect(parseTsColumnFromSql(sql)).toBe('ts')
  })

  it('reads the column from now() bounds after placeholder substitution', () => {
    const sql = `SELECT * FROM "vtype_db"."metrics" WHERE "ts" <= now() AND "ts" >= now() - Interval '10m'`
    expect(parseTsColumnFromSql(sql)).toBe('ts')
  })

  it('falls back to ORDER BY when no time bounds are present', () => {
    expect(parseTsColumnFromSql('SELECT * FROM t ORDER BY "greptime_timestamp" DESC LIMIT 10')).toBe(
      'greptime_timestamp'
    )
  })

  it('does not prefer a schema-style timestamp name over the SQL filter column', () => {
    // Table may have both timestamp (semantic TIMESTAMP) and ts — SQL wins.
    const sql = 'SELECT * FROM metrics WHERE "ts" <= $timeend AND "ts" >= $timestart'
    expect(parseTsColumnFromSql(sql)).toBe('ts')
  })
})
