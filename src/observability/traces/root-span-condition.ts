import type { Condition } from '@/types/query'

/**
 * The Traces query page restricts to root spans with an ordinary, user-visible builder
 * condition (`parent_span_id IS NULL`). The user can remove it to query every span, so the
 * builder reads it back to decide which spans to sample attribute suggestions from.
 */
export const PARENT_SPAN_COLUMN = 'parent_span_id'

export function createRootSpanCondition(): Condition {
  return { field: PARENT_SPAN_COLUMN, operator: 'Not Exist', value: '', relation: 'AND' }
}

export function isRootSpanCondition(condition: Condition | undefined | null): boolean {
  return !!condition && condition.field === PARENT_SPAN_COLUMN && condition.operator === 'Not Exist'
}

export function hasRootSpanCondition(conditions: readonly Condition[] | undefined | null): boolean {
  return !!conditions?.some(isRootSpanCondition)
}
