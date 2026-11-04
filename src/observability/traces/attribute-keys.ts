/**
 * Attribute dimensions for trace tables whose attributes are JSON2 containers
 * (`greptime_trace_v2` ships `span_attributes` / `scope_attributes` /
 * `resource_attributes`).
 *
 * v1 tables flatten attributes into physical columns, so discovery reads them from the
 * table schema. v2 keeps them inside three JSON objects: there are no columns to read, so
 * the keys have to be sampled from a bounded slice of rows. Both paths end up as the same
 * `TraceBreakdownAttribute` shape, whose `column` is the chip key used by filters and
 * breakdown queries (`span_attributes.http.method` → `json_get_string(...)`).
 */

import type { TraceAttrScope, TraceBreakdownAttribute } from './field-map'

/** JSON2 attribute containers created by the trace v2 data model. */
export const TRACE_ATTRIBUTE_CONTAINERS = ['span_attributes', 'scope_attributes', 'resource_attributes'] as const

export type TraceAttributeContainer = (typeof TRACE_ATTRIBUTE_CONTAINERS)[number]

/** Resource attributes describe the process; span/scope attributes describe the call. */
export function attributeScopeOf(container: string): TraceAttrScope {
  return container === 'resource_attributes' ? 'resource' : 'span'
}

/** Grafana-style label: `resource.service.version`, `span.http.method`. */
export function attributeLabelOf(container: string, key: string): string {
  return `${attributeScopeOf(container)}.${key}`
}

/** Chip key: `<container>.<key>`; `parseJsonFieldChipKey` splits it back into column + path. */
export function attributeChipKey(container: string, key: string): string {
  return `${container}.${key}`
}

function isAttributeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Attribute dimensions discovered by sampling rows from a v2 table.
 *
 * Rows come back from `SELECT <containers> … LIMIT n`; only string keys are kept (a JSON
 * key is always a string, but the row shape is attacker-free yet untyped). Keys are
 * deduplicated across rows and sorted so the dropdown order is stable between refreshes.
 */
export function discoverSampledAttributes(
  containers: readonly string[],
  rows: ReadonlyArray<Record<string, unknown>>
): TraceBreakdownAttribute[] {
  const keysByContainer = new Map<string, Set<string>>()
  containers.forEach((container) => keysByContainer.set(container, new Set<string>()))

  rows.forEach((row) => {
    containers.forEach((container) => {
      const value = row?.[container]
      if (!isAttributeObject(value)) {
        return
      }
      const keys = keysByContainer.get(container)
      Object.keys(value).forEach((key) => {
        if (key) {
          keys?.add(key)
        }
      })
    })
  })

  const result: TraceBreakdownAttribute[] = []
  containers.forEach((container) => {
    const keys = [...(keysByContainer.get(container) ?? [])].sort((left, right) => left.localeCompare(right))
    keys.forEach((key) => {
      result.push({
        column: attributeChipKey(container, key),
        label: attributeLabelOf(container, key),
        scope: attributeScopeOf(container),
        sampled: true,
      })
    })
  })
  return result
}

/** Container columns present on the bound table (empty for v1, which has no containers). */
export function attributeContainersOf(columns: readonly string[]): string[] {
  return TRACE_ATTRIBUTE_CONTAINERS.filter((container) => columns.includes(container))
}
