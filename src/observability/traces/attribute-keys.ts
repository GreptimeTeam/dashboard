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

import { shallowRef } from 'vue'
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
  // Keys whose sampled values are always objects/arrays cannot be grouped as text, so they
  // are tracked and dropped at the end (e.g. `http.request.header`).
  const stats = new Map<string, Map<string, AttributeStat>>()

  rows.forEach((row) => {
    containers.forEach((container) => {
      const value = row?.[container]
      if (!isAttributeObject(value)) {
        return
      }
      const keys = stats.get(container) ?? new Map<string, AttributeStat>()
      stats.set(container, keys)
      Object.entries(value).forEach(([key, attributeValue]) => {
        if (!key) {
          return
        }
        const stat = keys.get(key) ?? createAttributeStat()
        keys.set(key, stat)
        observeAttributeValue(stat, attributeValue)
      })
    })
  })

  const result: TraceBreakdownAttribute[] = []
  containers.forEach((container) => {
    const entries = [...(stats.get(container) ?? new Map<string, AttributeStat>()).entries()]
      .filter(([, stat]) => !stat.compoundOnly)
      .sort(([left], [right]) => left.localeCompare(right))
    entries.forEach(([key, stat]) => {
      result.push({
        column: attributeChipKey(container, key),
        label: attributeLabelOf(container, key),
        scope: attributeScopeOf(container),
        sampled: true,
        dataType: attributeDataTypeOf(stat),
      })
    })
  })
  return result
}

interface AttributeStat {
  sawString: boolean
  sawNumber: boolean
  sawBoolean: boolean
  allIntegers: boolean
  /** True until a scalar value is seen; object/array-only keys are not groupable. */
  compoundOnly: boolean
}

function createAttributeStat(): AttributeStat {
  return { sawString: false, sawNumber: false, sawBoolean: false, allIntegers: true, compoundOnly: true }
}

/** Numeric-looking text: JSON2 keeps the wire type, and instrumentation is inconsistent. */
const NUMERIC_TEXT = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/

function observeAttributeValue(stat: AttributeStat, value: unknown): void {
  const asNumber = (numeric: number): void => {
    stat.sawNumber = true
    if (!Number.isInteger(numeric)) {
      stat.allIntegers = false
    }
  }

  if (typeof value === 'number') {
    asNumber(value)
  } else if (typeof value === 'boolean') {
    stat.sawBoolean = true
  } else if (typeof value === 'string') {
    // The same key arrives as "200" from one service and 200 from another; both cast
    // to a number, so treat numeric text as numeric instead of hiding the operators.
    const trimmed = value.trim()
    if (NUMERIC_TEXT.test(trimmed)) {
      asNumber(Number(trimmed))
    } else if (trimmed === 'true' || trimmed === 'false') {
      stat.sawBoolean = true
    } else {
      stat.sawString = true
    }
  } else if (value === null || value === undefined) {
    // JSON null carries no type information; ignore it rather than dropping the key.
    return
  } else {
    // Object/array: only affects groupability when it is all we ever saw.
    return
  }
  stat.compoundOnly = false
}

/**
 * Attribute type inferred from the sampled values, in the shape the filter UI reads
 * (`filterOpsForType`) so numeric keys also offer `>`/`<`.
 *
 * Mixed scalars fall back to STRING: a key that is sometimes text is not safe to cast.
 */
function attributeDataTypeOf(stat: AttributeStat): string | undefined {
  if (stat.sawString) {
    return 'STRING'
  }
  if (stat.sawBoolean && !stat.sawNumber) {
    return 'BOOLEAN'
  }
  if (stat.sawNumber && !stat.sawBoolean) {
    return stat.allIntegers ? 'BIGINT' : 'DOUBLE'
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Type registry — lets the filter combobox offer numeric operators for sampled keys
// (chip keys are not table columns, so the schema has no type for them).
// ---------------------------------------------------------------------------

const ATTRIBUTE_TYPE_LIMIT = 4000
const attributeTypes = shallowRef<Record<string, string>>({})

function registryKey(database: string | undefined, table: string | undefined, chipKey: string): string {
  return `${database ?? ''}\0${table ?? ''}\0${chipKey}`
}

/** Remember the sampled types of one table's attribute keys. */
export function rememberAttributeTypes(
  database: string | undefined,
  table: string | undefined,
  attributes: ReadonlyArray<TraceBreakdownAttribute>
): void {
  if (!attributes.length) {
    return
  }
  const next = { ...attributeTypes.value }
  let changed = false
  attributes.forEach((attribute) => {
    if (!attribute.dataType) {
      return
    }
    const key = registryKey(database, table, attribute.column)
    if (next[key] !== attribute.dataType) {
      next[key] = attribute.dataType
      changed = true
    }
  })
  if (changed) {
    // Bounded like the sampling cache: a long session that visits many tables must not
    // grow this registry without limit.
    attributeTypes.value =
      Object.keys(next).length > ATTRIBUTE_TYPE_LIMIT
        ? Object.fromEntries(
            attributes
              .filter((attribute) => attribute.dataType)
              .map((attribute) => [registryKey(database, table, attribute.column), attribute.dataType as string])
          )
        : next
  }
}

/** Type of a sampled attribute key, or undefined when it was never sampled. */
export function attributeTypeOf(
  database: string | undefined,
  table: string | undefined,
  chipKey: string
): string | undefined {
  return attributeTypes.value[registryKey(database, table, chipKey)]
}

/** Container columns present on the bound table (empty for v1, which has no containers). */
export function attributeContainersOf(columns: readonly string[]): string[] {
  return TRACE_ATTRIBUTE_CONTAINERS.filter((container) => columns.includes(container))
}
