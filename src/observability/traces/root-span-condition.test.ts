import { describe, expect, it } from 'vitest'
import type { Condition } from '@/types/query'
import { createRootSpanCondition, hasRootSpanCondition, isRootSpanCondition } from './root-span-condition'

const status: Condition = { field: 'span_status_code', operator: '=', value: 'STATUS_CODE_ERROR', relation: 'AND' }

describe('root span condition', () => {
  it('recognises only the Not Exist condition on parent_span_id', () => {
    expect(isRootSpanCondition(createRootSpanCondition())).toBe(true)
    expect(isRootSpanCondition({ field: 'parent_span_id', operator: '=', value: 'x' })).toBe(false)
    expect(isRootSpanCondition({ field: 'service_name', operator: 'Not Exist', value: '' })).toBe(false)
    expect(hasRootSpanCondition(undefined)).toBe(false)
    expect(hasRootSpanCondition([status, createRootSpanCondition()])).toBe(true)
  })
})
