/**
 * Explore’s single semantic facade.
 *
 * - `source.ts` is the common `information_schema.table_semantics` catalog;
 * - `model.ts` holds types, OTLP/Greptime conventions, metric mapping, and entity vocabulary;
 * - `resolve.ts` turns those sources into metric metadata, entity refs, signal-table
 *   discovery, and schema inspection.
 *
 * Signal adapters and Vue components import this facade instead of reaching into a
 * private module, so semantic precedence stays in one place.
 */
export {
  clearSemanticsCache,
  ensureSemanticsLoaded,
  getTableEntityDeclarations,
  getTableSemantics,
  hasSemanticsTable,
  listBySignal,
} from './source'
export {
  canonicalEntityKey,
  conventionEntityKeys,
  declaredMetricKindFromSemantics,
  declaredMetricUnitFromSemantics,
  declaredTemporalityFromSemantics,
  ENTITY_FILTER_KEYS,
  inferMetricKind,
  isHistogramMetricName,
  isOtelResourceLabelChip,
  isTraceModel,
  mapDeclaredMetricType,
  normalizeEntityFilters,
  OTEL_LOG_BODY,
  OTEL_LOG_INDEX_LABELS,
  OTEL_LOG_SEVERITY,
  OTEL_LOG_SERVICE,
  OTEL_LOG_TIME,
  OTEL_LOG_TRACE,
  otelResourceLabelName,
  compareTraceTableCandidates,
  traceTableRank,
  TRACE_MODEL_REQUIRED_COLUMNS,
  TRACE_MODEL_SERVICE_COLUMN,
  unboundEntityFilterKey,
  type EntityColumnRef,
  type EntityDeclaration,
  type EntityOrigin,
  type EntitySchemaColumn,
  type EntitySignal,
  type MetadataQuality,
  type MetricKind,
  type MetricTemporality,
  type ResolvedEntityIdentity,
  type TableSemantics,
} from './model'
export {
  entityColumnFilterKey,
  inspectSignalTable,
  logsServiceFilterCandidateKeys,
  physicalServiceColumn,
  resolveEntityFilterKey,
  resolveEntityFilterRef,
  resolveEntityIdentity,
  resolveMetricMeta,
  resolveSignalTable,
  listSignalTables,
  type ResolvedMetricMeta,
  type SignalTableInspection,
} from './resolve'
