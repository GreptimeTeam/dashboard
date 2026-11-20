import { describe, expect, it } from 'vitest'
import {
  parseTable,
  parseTableSchema,
  parseTableRefForSql,
  parseTsColumnFromSql,
} from '@/views/dashboard/logs/query/until'
import { bareTableName, getTableRefForSql, schemaFromTableRef } from './sql'

describe('getTableRefForSql', () => {
  it('quotes bare table with database (builder / normalized code mode)', () => {
    expect(getTableRefForSql({ table: 'genai_conversations', database: 'public' })).toBe(
      '"public"."genai_conversations"'
    )
  })

  it('does not double-quote an already quoted schema.table when database is also set', () => {
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

describe('bareTableName / schemaFromTableRef', () => {
  it('strips quoted schema.table', () => {
    expect(bareTableName('"public"."genai_conversations"')).toBe('genai_conversations')
    expect(schemaFromTableRef('"public"."genai_conversations"')).toBe('public')
  })

  it('handles unquoted schema.table', () => {
    expect(bareTableName('public.genai_conversations')).toBe('genai_conversations')
    expect(schemaFromTableRef('public.genai_conversations')).toBe('public')
  })

  it('handles a bare name', () => {
    expect(bareTableName('logs')).toBe('logs')
    expect(bareTableName('"logs"')).toBe('logs')
    expect(schemaFromTableRef('logs')).toBeUndefined()
  })
})

describe('parseTable family (code-mode state vs SQL FROM)', () => {
  const sql =
    'SELECT * FROM "public"."opentelemetry_traces" WHERE "parent_span_id" IS NULL ORDER BY "timestamp" DESC LIMIT 1000'

  it('parseTable returns bare name for queryState', () => {
    expect(parseTable(sql)).toBe('opentelemetry_traces')
  })

  it('parseTableSchema returns schema for queryState.database', () => {
    expect(parseTableSchema(sql)).toBe('public')
  })

  it('parseTableRefForSql returns a ready FROM fragment', () => {
    expect(parseTableRefForSql(sql)).toBe('"public"."opentelemetry_traces"')
  })

  it('rebuilds COUNT/detail FROM without double quoting', () => {
    const table = parseTable(sql)
    const database = parseTableSchema(sql)
    expect(getTableRefForSql({ table, database })).toBe('"public"."opentelemetry_traces"')
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
    const sql = 'SELECT * FROM metrics WHERE "ts" <= $timeend AND "ts" >= $timestart'
    expect(parseTsColumnFromSql(sql)).toBe('ts')
  })
})
