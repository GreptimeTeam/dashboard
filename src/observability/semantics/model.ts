/**
 * Pure semantic model: types, OTLP/Greptime conventions, metric declaration mapping,
 * and cross-signal entity vocabulary. No SQL, Pinia, or editor API.
 *
 * Sections follow docs/drilldown/semantics.md:
 *   1. Shared types (table_semantics row, entity refs)
 *   2. Cross-signal entity vocabulary
 *   3. Metrics (declaration mapping + name fallbacks)
 *   4. Logs (OTel role columns, Loki index labels)
 *   5. Traces (greptime_trace_v1 model + scoring)
 */
import { parseJsonFieldChipKey } from '../logs/json-field-keys'
import type { DrilldownFilter } from '../types'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

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
 * One row of `information_schema.table_semantics`.
 *
 * The catalog is shared by all signals: metric-only options simply stay empty on log
 * and trace rows. Consumers that are not metric-specific should therefore read this
 * shape as “the table’s semantic row”, not as a metrics-only declaration.
 */
export interface TableSemantics {
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

// ---------------------------------------------------------------------------
// Cross-signal entity vocabulary
// ---------------------------------------------------------------------------

/**
 * Canonical entity key → every name that means it. Used only to *recognize* that two
 * filters are the same entity (dedupe, cross-signal re-key); the physical mapping comes
 * from the table's declaration, this vocabulary does not decide it.
 */
const ENTITY_ALIASES: Record<string, string[]> = {
  service: ['service', 'job', 'service_name', 'resource_attributes.service.name'],
}

/**
 * Convention fallback: the physical keys an ingestion source writes for an entity, per
 * signal, ordered by preference. Only consulted when the table declares nothing —
 * declarations always win (see `resolve.ts`).
 *
 * Taken from the open conventions, not from one deployment:
 * - OTLP metrics keep the bare `service_name`; `job` carries the namespace-qualified
 *   form (`namespace/service`), so it is the *fallback*, not the join key (measured:
 *   joining `job` against traces' `service_name` matches 0 rows);
 * - OTLP traces keep `service_name` (the greptime_trace_v1 model);
 * - OTLP logs promote flat labels when present, otherwise identity stays inside the
 *   `resource_attributes` JSON container (the chip form).
 */
const SOURCE_ENTITY_KEYS: Record<string, Partial<Record<EntitySignal, Record<string, string[]>>>> = {
  opentelemetry: {
    metrics: { service: ['service_name', 'job'] },
    traces: { service: ['service_name'] },
    logs: { service: ['service_name', 'resource_attributes.service.name'] },
  },
  prometheus: {
    metrics: { service: ['job'] },
  },
}

/**
 * With no bound table there is nothing to declare or inspect (the metrics catalog has no
 * single table). Traces/logs fall back to the entity role their field map owns; metrics
 * falls back to the widest metric convention.
 */
const UNBOUND_ENTITY_KEYS: Record<EntitySignal, Record<string, string>> = {
  // No table to inspect: `service_name` holds the bare service (same value the other
  // signals use). `job` is namespace-qualified, so it would match nothing.
  metrics: { service: 'service_name' },
  traces: { service: 'service' },
  logs: { service: 'service' },
}

export const ENTITY_FILTER_KEYS = Object.keys(ENTITY_ALIASES)

function normalizeKey(key: string): string {
  return key.trim().toLowerCase()
}

/** Canonical entity a filter key stands for, or undefined. */
export function canonicalEntityKey(key: string): string | undefined {
  const trimmed = normalizeKey(key)
  if (!trimmed) {
    return undefined
  }
  return ENTITY_FILTER_KEYS.find((entity) => ENTITY_ALIASES[entity].includes(trimmed))
}

/** Convention candidates for an entity. Without `source` every known source's keys are
 * returned in source order, so callers can pick by column presence. */
export function conventionEntityKeys(signal: EntitySignal, entityKey: string, source?: string): string[] {
  const entity = normalizeKey(entityKey)
  const sources = source ? [normalizeKey(source)] : Object.keys(SOURCE_ENTITY_KEYS)
  const keys = sources.flatMap((name) => SOURCE_ENTITY_KEYS[name]?.[signal]?.[entity] ?? [])
  return [...new Set(keys)]
}

/** Key to use when no table is bound (metrics catalog, signal switch). */
export function unboundEntityFilterKey(signal: EntitySignal, entityKey: string): string | undefined {
  return UNBOUND_ENTITY_KEYS[signal]?.[normalizeKey(entityKey)]
}

/**
 * Rewrite entity filters into `signal`'s vocabulary so one shared filter works on all
 * three signals.
 *
 * `resolveKey` lets the caller supply a table-derived key (declaration → source
 * convention); without it the signal's unbound default is used. A physical key the
 * signal natively owns stays untouched (a metric table may carry `service_name` without
 * `job`), and alias duplicates of the same entity collapse onto one key so two labels
 * are never ANDed.
 */
export function normalizeEntityFilters(
  filters: DrilldownFilter[],
  signal: EntitySignal,
  resolveKey?: (entityKey: string) => string | undefined
): DrilldownFilter[] {
  const seen = new Map<string, number>()
  const result: DrilldownFilter[] = []

  filters.forEach((filter) => {
    const entity = canonicalEntityKey(filter.key)
    if (!entity) {
      result.push(filter)
      return
    }

    const resolved = resolveKey?.(entity)
    const preferred = resolved ?? unboundEntityFilterKey(signal, entity)
    const isCanonicalKey = normalizeKey(filter.key) === normalizeKey(entity)
    // With no table-derived answer, metrics keeps a key it already owns (a metric table
    // may carry `service_name` without `job`); traces/logs prefer their role/chip key.
    const keepNativeAlias =
      !resolved &&
      !isCanonicalKey &&
      signal === 'metrics' &&
      conventionEntityKeys(signal, entity).includes(normalizeKey(filter.key))
    const key = preferred && !keepNativeAlias ? preferred : filter.key

    // Same entity + op + value: keep one occurrence, preferring the resolved key.
    const dedupeKey = `${entity}\0${filter.op}\0${filter.value}`
    const existing = seen.get(dedupeKey)
    if (existing !== undefined) {
      if (preferred && normalizeKey(result[existing].key) !== normalizeKey(preferred)) {
        result[existing] = { ...result[existing], key: preferred }
      }
      return
    }

    seen.set(dedupeKey, result.length)
    result.push({ ...filter, key })
  })

  return result
}

// ---------------------------------------------------------------------------
// Metrics — declaration mapping + name fallbacks
// ---------------------------------------------------------------------------

/**
 * Map Greptime `metric.type` strings onto dashboard MetricKind.
 * Values follow the DB-side whitelist in `table/requests/semantic.rs`
 * (`counter|gauge|histogram|summary|updown_counter|gauge_histogram|info|stateset|mixed|unknown`);
 * anything else falls through to null. Only call with declared semantics.
 */
export function mapDeclaredMetricType(metricType: string | undefined): MetricKind | null {
  if (!metricType) {
    return null
  }
  const normalized = metricType.trim().toLowerCase().replace(/-/g, '_')
  switch (normalized) {
    case 'counter':
      return 'counter'
    case 'gauge':
      return 'gauge'
    case 'updown_counter':
      return 'updown_counter'
    case 'histogram':
      return 'histogram'
    case 'gauge_histogram':
      return 'gauge_histogram'
    case 'summary':
      return 'summary'
    // Info / stateset series are 1-valued gauges carrying extra labels.
    case 'info':
    case 'stateset':
      return 'gauge'
    // The server collapses conflicting writers onto these sentinels: it is telling us
    // it does not know. Keep them unknown instead of guessing from the name.
    case 'mixed':
    case 'unknown':
      return 'unknown'
    default:
      return null
  }
}

/** Declared kind only — null when missing, non-declared, or unmapped. */
export function declaredMetricKindFromSemantics(semantics: TableSemantics | null): MetricKind | null {
  if (!semantics || semantics.metadataQuality !== 'declared') {
    return null
  }
  return mapDeclaredMetricType(semantics.metricType)
}

/**
 * UCUM unit — null when the table carries none. `metadata_quality` describes
 * `metric.type` only, and unit/temporality/original_name have no "guessed" write path,
 * so they are usable whenever present.
 */
export function declaredMetricUnitFromSemantics(semantics: TableSemantics | null): string | null {
  return semantics?.metricUnit ?? null
}

/** Instrument temporality — null when the table carries none (see unit above). */
export function declaredTemporalityFromSemantics(semantics: TableSemantics | null): MetricTemporality | null {
  return semantics?.metricTemporality ?? null
}

/** Classic Prometheus histogram: base name, _bucket, or duration *_seconds family. */
export function isHistogramMetricName(name: string): boolean {
  if (name.endsWith('_bucket')) {
    return true
  }
  if (name.endsWith('_seconds_sum') || name.endsWith('_seconds_count')) {
    return false
  }
  if (name.endsWith('_seconds')) {
    return true
  }
  return false
}

/** Metric kind guessed from the Prometheus naming convention. */
export function inferMetricKind(name: string): MetricKind {
  if (isHistogramMetricName(name)) {
    return 'histogram'
  }
  if (name.endsWith('_total') || name.endsWith('_count')) {
    return 'counter'
  }
  if (name.includes('quantile')) {
    return 'summary'
  }
  return 'unknown'
}

// ---------------------------------------------------------------------------
// Logs — OTel role columns + Loki index labels
// ---------------------------------------------------------------------------

/**
 * Loki's default OTLP resource attributes stored as index labels.
 * Dots are underscores. Log attributes and scope attributes are not in this set.
 * https://grafana.com/docs/loki/latest/send-data/otel/
 */
export const OTEL_LOG_INDEX_LABELS = [
  'cloud_availability_zone',
  'cloud_region',
  'container_name',
  'deployment_environment_name',
  'k8s_cluster_name',
  'k8s_container_name',
  'k8s_cronjob_name',
  'k8s_daemonset_name',
  'k8s_deployment_name',
  'k8s_job_name',
  'k8s_namespace_name',
  'k8s_pod_name',
  'k8s_replicaset_name',
  'k8s_statefulset_name',
  'service_instance_id',
  'service_name',
  'service_namespace',
] as const

const OTEL_LOG_INDEX_LABEL_SET = new Set<string>(OTEL_LOG_INDEX_LABELS)

/** OTLP resource attribute key (`service.name`) → OTel/Loki index-label name (`service_name`). */
export function otelResourceLabelName(path: string): string {
  return path.trim().replace(/\./g, '_').toLowerCase()
}

/**
 * True when a chip names an OTLP *resource* attribute that OTel/Loki promote to a label.
 *
 * Resource attributes are the logs identity surface (`service.name`, `k8s.pod.name`, …) — the
 * same names the flat-column path recognizes through {@link OTEL_LOG_INDEX_LABELS}. Log and
 * scope attributes stay fields.
 */
export function isOtelResourceLabelChip(chipKey: string, jsonColumns: string[] = []): boolean {
  const chip = parseJsonFieldChipKey(chipKey.trim(), jsonColumns)
  if (!chip) {
    return false
  }
  if (!/resource/i.test(chip.column)) {
    return false
  }
  return OTEL_LOG_INDEX_LABEL_SET.has(otelResourceLabelName(chip.path))
}

/** Greptime OTLP logs role columns. No name heuristics — missing columns stay unset. */
export const OTEL_LOG_TIME = ['timestamp']
export const OTEL_LOG_BODY = ['body']
export const OTEL_LOG_SEVERITY = ['severity_text']
export const OTEL_LOG_SERVICE = ['service_name']
export const OTEL_LOG_TRACE = ['trace_id']

// ---------------------------------------------------------------------------
// Traces — greptime_trace_v1 model + scoring
// ---------------------------------------------------------------------------

/**
 * `greptime_trace_v1` — the trace table model GreptimeDB creates itself.
 *
 * Its column names are a server-side contract, so they live here once and are shared
 * by table discovery, field maps and entity resolution instead of being copied into
 * each of them.
 */
export const TRACE_MODEL_REQUIRED_COLUMNS = [
  'trace_id',
  'parent_span_id',
  'timestamp',
  'span_name',
  'service_name',
] as const

/** Extra columns that mark a fuller greptime_trace_v1 layout. */
export const TRACE_MODEL_BONUS_COLUMNS = ['duration_nano', 'span_id', 'span_status_code', 'span_kind'] as const

/** Column the model guarantees for the `service` identity. */
export const TRACE_MODEL_SERVICE_COLUMN = 'service_name'

/** Table name the OTLP pipeline writes by default. */
export const KNOWN_OTLP_TRACE_TABLE = 'opentelemetry_traces'

/** True when `columns` carries the full required model column set. */
export function isTraceModel(columns: ReadonlySet<string>): boolean {
  return TRACE_MODEL_REQUIRED_COLUMNS.every((column) => columns.has(column))
}

/**
 * How strongly a candidate looks like the greptime_trace_v1 model. Higher is better.
 * A semantic `signal_type='trace'` declaration is positive evidence, but remains below
 * the full column model so an undeclared complete model still wins.
 */
export function traceModelScore(
  columnNames: string[],
  options?: { declaredTrace?: boolean; pipeline?: string; tableName?: string }
): number {
  const set = new Set(columnNames)
  let score = 0
  if (TRACE_MODEL_REQUIRED_COLUMNS.every((name) => set.has(name))) {
    score += 100
  }
  TRACE_MODEL_BONUS_COLUMNS.forEach((name) => {
    if (set.has(name)) {
      score += 10
    }
  })
  if (options?.declaredTrace) {
    score += 40
  }
  if (options?.pipeline === 'greptime_trace_v1') {
    score += 50
  }
  if (options?.tableName === KNOWN_OTLP_TRACE_TABLE) {
    score += 20
  }
  return score
}
