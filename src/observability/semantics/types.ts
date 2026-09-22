export type MetadataQuality = 'declared' | 'inferred' | 'unknown' | string

/** Greptime `metric.temporality` values. */
export type MetricTemporality = 'cumulative' | 'delta' | 'mixed' | 'unknown' | string

export type MetricKind =
  | 'counter'
  | 'gauge'
  | 'updown_counter'
  | 'histogram'
  /** OTLP exponential histogram: native value column, no `_bucket` / `le` to chart. */
  | 'native_histogram'
  /** Prometheus gauge histogram: buckets are not cumulative, so a heatmap is meaningless. */
  | 'gauge_histogram'
  | 'summary'
  | 'unknown'

export interface MetricTableSemantics {
  tableName: string
  metadataQuality: MetadataQuality
  signalType?: string
  source?: string
  /** Write pipeline / data model (e.g. `greptime_trace_v1`). */
  pipeline?: string
  metricType?: string
  /** UCUM unit from `metric.unit` (e.g. `s`, `By`, `{request}`). */
  metricUnit?: string
  metricTemporality?: MetricTemporality
  metricOriginalName?: string
  /** Convention/option-derived identities declared for this table. */
  entityDeclarations?: EntityDeclaration[]
}

/**
 * One entity a table stands for — `service`, `service.instance`, `container`, …
 * `id` entries are column paths: either a flat column name (`service_name`) or a
 * nested path (`resource_attributes.service.instance.id`).
 */
export interface EntityDeclaration {
  entityType: string
  origin?: string
  id: string[]
  idQualifier?: string
  supersededBy?: string
}

/**
 * One physical locator for an entity's identity column.
 *
 * Declarations use column *paths*, which land in two different shapes:
 * - trace tables flatten resource attributes into real columns, so the path is the
 *   column name (`resource_attributes.service.namespace`);
 * - log tables keep a single JSON column, so the path has to be read out of it
 *   (`column: 'resource_attributes'`, `jsonKey: 'service.name'`).
 */
export interface EntityColumnRef {
  column: string
  /** Set when the identity lives inside a JSON column rather than a flat column. */
  jsonKey?: string
}

export type EntityOrigin = 'declaration' | 'model'

export interface ResolvedEntityIdentity {
  entityType: string
  origin: EntityOrigin
  /** Columns that together identify the entity; the first one is the primary. */
  id: EntityColumnRef[]
  /** Extra column that qualifies the identity (e.g. `service.namespace`). */
  idQualifier?: EntityColumnRef
}

/** Column shape needed to place a declaration path physically. */
export interface EntitySchemaColumn {
  name: string
  data_type?: string
}

/** Signals that share the drilldown filter state. */
export type EntitySignal = 'metrics' | 'logs' | 'traces'
