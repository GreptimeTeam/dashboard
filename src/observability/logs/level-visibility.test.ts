import { describe, expect, it } from 'vitest'
import { buildSeverityLevelsPredicate } from './level-visibility'

describe('buildSeverityLevelsPredicate', () => {
  it('matches unknown as null or empty and ORs named levels', () => {
    expect(buildSeverityLevelsPredicate('level', ['unknown'])).toBe(`("level" IS NULL OR "level" = '')`)
    expect(buildSeverityLevelsPredicate('level', ['error', 'unknown'])).toBe(
      `("level" = 'error' OR ("level" IS NULL OR "level" = ''))`
    )
    expect(buildSeverityLevelsPredicate('level', ['info', 'error'])).toBe(`"level" IN ('info', 'error')`)
    expect(buildSeverityLevelsPredicate('level', [])).toBeUndefined()
  })
})
