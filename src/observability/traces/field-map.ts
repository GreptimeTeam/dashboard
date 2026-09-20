import { TRACE_MODEL_BONUS_COLUMNS, TRACE_MODEL_REQUIRED_COLUMNS, TRACE_MODEL_SERVICE_COLUMN } from './model'

/**
 * greptime_trace_v1 / OTel-shaped field map and top-bar label keys.
 * Product Labels for traces ≠ Greptime TAG-only (only service_name is TAG on v1).
 */

export const TRACE_LABEL_KEYS = ['service_name', 'span_name', 'span_status_code', 'span_kind'] as const

export type TraceLabelKey = (typeof TRACE_LABEL_KEYS)[number]

/** Minimum columns to treat a table as a usable trace model. */
export const TRACE_REQUIRED_COLUMNS = TRACE_MODEL_REQUIRED_COLUMNS

/** Extra columns that mark a fuller greptime_trace_v1 layout. */
export const TRACE_BONUS_COLUMNS = TRACE_MODEL_BONUS_COLUMNS

const KNOWN_DEFAULT_TABLE = 'opentelemetry_traces'

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

export function tableHasRequiredTraceColumns(columnNames: string[]): boolean {
  const set = new Set(columnNames)
  return TRACE_REQUIRED_COLUMNS.every((name) => set.has(name))
}

export function traceModelScore(columnNames: string[], options?: { pipeline?: string; tableName?: string }): number {
  const set = new Set(columnNames)
  let score = 0
  if (TRACE_REQUIRED_COLUMNS.every((name) => set.has(name))) {
    score += 100
  }
  TRACE_BONUS_COLUMNS.forEach((name) => {
    if (set.has(name)) {
      score += 10
    }
  })
  if (options?.pipeline === 'greptime_trace_v1') {
    score += 50
  }
  if (options?.tableName === KNOWN_DEFAULT_TABLE) {
    score += 20
  }
  return score
}

export { KNOWN_DEFAULT_TABLE as KNOWN_OTLP_TRACE_TABLE }
