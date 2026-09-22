import { isTraceModel, TRACE_MODEL_SERVICE_COLUMN } from '../semantics/otlp'

/**
 * greptime_trace_v1 / OTel-shaped field map and top-bar label keys.
 * Product Labels for traces ≠ Greptime TAG-only (only service_name is TAG on v1).
 */

export const TRACE_LABEL_KEYS = ['service_name', 'span_name', 'span_status_code', 'span_kind'] as const

export type TraceLabelKey = (typeof TRACE_LABEL_KEYS)[number]

const RESOURCE_ATTR_PREFIX = 'resource_attributes.'
const SPAN_ATTR_PREFIX = 'span_attributes.'

export type TraceAttrScope = 'resource' | 'span'

export interface TraceBreakdownAttribute {
  /** Physical SQL column on greptime_trace_v1 / OTel table. */
  column: string
  /** Grafana-style display label (resource.* / span.* / intrinsics). */
  label: string
  scope: TraceAttrScope
}

export interface SchemaColumnLike {
  name: string
  data_type?: string
  semantic_type?: string
}

/** Columns that must never be Breakdown group-by (ids / time / payloads). */
const BREAKDOWN_EXCLUDED_COLUMNS = new Set([
  'timestamp',
  'timestamp_end',
  'duration_nano',
  'parent_span_id',
  'trace_id',
  'span_id',
  'trace_state',
  'span_events',
  'span_links',
])

/**
 * Intrinsic greptime_trace_v1 columns mapped to Grafana Trace Drilldown attribute labels.
 * @see grafana/traces-drilldown radioAttributesResource / radioAttributesSpan
 */
const INTRINSIC_BREAKDOWN_ATTRS: TraceBreakdownAttribute[] = [
  { column: 'service_name', label: 'resource.service.name', scope: 'resource' },
  { column: 'span_name', label: 'name', scope: 'span' },
  { column: 'span_kind', label: 'kind', scope: 'span' },
  { column: 'span_status_code', label: 'status', scope: 'span' },
  { column: 'span_status_message', label: 'statusMessage', scope: 'span' },
  { column: 'scope_name', label: 'scope.name', scope: 'span' },
  { column: 'scope_version', label: 'scope.version', scope: 'span' },
]

function isGroupableDataType(dataType?: string): boolean {
  if (!dataType) {
    return true
  }
  const lower = dataType.toLowerCase()
  if (lower.includes('json') || lower.includes('binary') || lower.includes('vector')) {
    return false
  }
  return true
}

/**
 * Breakdown Group-by candidates (Grafana Resource / Span scopes).
 * - Intrinsic columns (service_name → resource.service.name, …)
 * - `resource_attributes.*` → Resource
 * - `span_attributes.*` → Span
 */
export function discoverTraceBreakdownAttributes(columns: SchemaColumnLike[]): TraceBreakdownAttribute[] {
  const byName = new Map(columns.map((column) => [column.name, column]))
  const result: TraceBreakdownAttribute[] = []
  const seen = new Set<string>()

  const push = (attr: TraceBreakdownAttribute) => {
    if (seen.has(attr.column) || BREAKDOWN_EXCLUDED_COLUMNS.has(attr.column)) {
      return
    }
    const schema = byName.get(attr.column)
    if (!schema || !isGroupableDataType(schema.data_type)) {
      return
    }
    seen.add(attr.column)
    result.push(attr)
  }

  INTRINSIC_BREAKDOWN_ATTRS.forEach((attr) => push(attr))

  columns.forEach((column) => {
    const { name } = column
    if (name.startsWith(RESOURCE_ATTR_PREFIX)) {
      const path = name.slice(RESOURCE_ATTR_PREFIX.length)
      if (path) {
        push({ column: name, label: `resource.${path}`, scope: 'resource' })
      }
      return
    }
    if (name.startsWith(SPAN_ATTR_PREFIX)) {
      const path = name.slice(SPAN_ATTR_PREFIX.length)
      if (path) {
        push({ column: name, label: `span.${path}`, scope: 'span' })
      }
    }
  })

  return result
}

/** Filter discovered attributes by Resource / Span (dropdown grouping / tests). */
export function filterBreakdownAttributesByScope(
  attrs: TraceBreakdownAttribute[],
  scope: TraceAttrScope | 'all'
): TraceBreakdownAttribute[] {
  if (scope === 'all') {
    return attrs
  }
  return attrs.filter((attr) => attr.scope === scope)
}

/** Merge discovered breakdown columns into traces fieldMap so Add to filter SQL resolves. */
export function mergeTracesFieldMapColumns(
  fieldMap: Record<string, string>,
  columns: string[]
): Record<string, string> {
  const next = { ...fieldMap }
  columns.forEach((column) => {
    if (column && !next[column]) {
      next[column] = column
    }
  })
  return next
}

export interface TracesFieldMapOptions {
  /** Service identity column when the bound table declares a different one. */
  serviceColumn?: string
}

/** Fixed roles for greptime_trace_v1 (identity map for filter chips). */
export function buildDefaultTracesFieldMap(options?: TracesFieldMapOptions): Record<string, string> {
  const service = options?.serviceColumn?.trim() || TRACE_MODEL_SERVICE_COLUMN
  return {
    time: 'timestamp',
    timeEnd: 'timestamp_end',
    duration: 'duration_nano',
    traceId: 'trace_id',
    spanId: 'span_id',
    parentSpanId: 'parent_span_id',
    service,
    spanName: 'span_name',
    status: 'span_status_code',
    kind: 'span_kind',
    // Identity entries so top-bar chips resolve via resolveFieldMapColumn.
    service_name: service,
    span_name: 'span_name',
    span_status_code: 'span_status_code',
    span_kind: 'span_kind',
    timestamp: 'timestamp',
    duration_nano: 'duration_nano',
    trace_id: 'trace_id',
    parent_span_id: 'parent_span_id',
  }
}

/** Label keys present on the bound table (intersection with TRACE_LABEL_KEYS). */
export function discoverTraceLabelColumns(columns: SchemaColumnLike[]): string[] {
  const names = new Set(columns.map((column) => column.name))
  return TRACE_LABEL_KEYS.filter((key) => names.has(key))
}

/**
 * Top-bar filter keys for a traces table: every business field a user can filter on —
 * intrinsic span/resource columns plus the flattened `resource_attributes.*` /
 * `span_attributes.*` attributes, and `duration_nano` (numeric comparisons).
 *
 * Identity/payload/time columns stay out: `trace_id` / `span_id` / `parent_span_id` have
 * dedicated entry points (Trace ID search, Gantt), and `span_events` / `span_links` /
 * `trace_state` are not useful predicates.
 */
export function discoverTraceFilterKeys(
  columns: SchemaColumnLike[],
  options?: { exclude?: readonly string[] }
): string[] {
  const exclude = new Set(options?.exclude ?? [])
  const keys = new Set<string>()
  discoverTraceBreakdownAttributes(columns).forEach((attr) => {
    if (!exclude.has(attr.column)) {
      keys.add(attr.column)
    }
  })
  const names = new Set(columns.map((column) => column.name))
  if (names.has('duration_nano') && !exclude.has('duration_nano')) {
    keys.add('duration_nano')
  }
  return [...keys].sort((a, b) => a.localeCompare(b))
}

export function tableHasRequiredTraceColumns(columnNames: string[]): boolean {
  return isTraceModel(new Set(columnNames))
}
