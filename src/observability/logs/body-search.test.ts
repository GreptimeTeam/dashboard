import { describe, expect, it } from 'vitest'
import { logsBodyPredicate } from './body-search'

describe('logsBodyPredicate', () => {
  it('wraps LIKE the same way logs query does', () => {
    expect(logsBodyPredicate('message', 'LIKE', 'timeout')).toBe(`"message" LIKE '%timeout%' ESCAPE '\\'`)
    expect(logsBodyPredicate('message', 'NOT LIKE', 'a_b')).toBe(`"message" NOT LIKE '%a\\_b%' ESCAPE '\\'`)
  })

  it('builds IN lists and null checks', () => {
    expect(logsBodyPredicate('message', 'IN', 'a, b')).toBe(`"message" IN ('a', 'b')`)
    expect(logsBodyPredicate('message', 'Exist', '')).toBe('"message" IS NOT NULL')
    expect(logsBodyPredicate('message', 'Not Exist', '')).toBe('"message" IS NULL')
  })

  it('uses GreptimeDB matches_term for full-text MATCH', () => {
    expect(logsBodyPredicate('message', 'MATCH', "can't")).toBe(`"message" @@ 'can''t'`)
    expect(logsBodyPredicate('message', 'NOT MATCH', 'error')).toBe(`NOT "message" @@ 'error'`)
    expect(logsBodyPredicate('message', 'MATCH', '  ')).toBeUndefined()
  })

  it('skips blank values', () => {
    expect(logsBodyPredicate('message', 'LIKE', '  ')).toBeUndefined()
    expect(logsBodyPredicate('message', '=', 'exact')).toBe(`"message" = 'exact'`)
  })
})
