import { getTableEntityDeclarations, getTableSemantics, listBySignal, semanticsDump } from './source'
import { currentDatabase } from '../current-database'
import {
  compareTraceTableCandidates,
  conventionEntityKeys,
  declaredMetricKindFromSemantics,
  declaredMetricUnitFromSemantics,
  declaredTemporalityFromSemantics,
  inferMetricKind,
  isTraceModel,
  TRACE_MODEL_SERVICE_COLUMN,
  type EntityColumnRef,
  type EntityDeclaration,
  type EntitySchemaColumn,
  type EntitySignal,
  type MetricKind,
  type MetricTemporality,
  type ResolvedEntityIdentity,
  type TableSemantics,
  type TraceTableEvidence,
} from './model'

// ---------------------------------------------------------------------------
// Metric metadata
// ---------------------------------------------------------------------------

export interface ResolvedMetricMeta {
  kind: MetricKind
  /** Declared UCUM unit when available. */
  semanticUnit: string | null
  temporality: MetricTemporality | null
  originalName: string | null
  source: string | null
  metadataQuality: string | null
  semantics: TableSemantics | null
}

/** Series suffixes that a histogram family emits alongside its `_bucket` series. */
const HISTOGRAM_COMPANION_SUFFIXES = ['_sum', '_count']

/**
 * Prometheus remote-write 2.0 metadata describes a whole family, and writers such as
 * the OTel Collector's prometheusremotewrite exporter stamp `type=histogram` on every
 * series of it. The `_sum` / `_count` tables then arrive declared as histogram even
 * though they are cumulative counters with no `_bucket` of their own — querying them
 * as classic would ask for `foo_sum_bucket`, which does not exist.
 */
function isHistogramCompanionSeries(name: string): boolean {
  return HISTOGRAM_COMPANION_SUFFIXES.some((suffix) => name.endsWith(suffix))
}

/** `foo_seconds_count` → `foo_seconds`; null when the name is not a count series. */
function histogramCountBaseName(name: string): string | null {
  const suffix = '_count'
  return name.endsWith(suffix) && name.length > suffix.length ? name.slice(0, -suffix.length) : null
}

/**
 * OTLP stamps the metric's observed-value unit on every table it emits, so a
 * histogram's `{base}_count` table inherits `unit=s` / `{token}` even though a count
 * series counts observations — that unit only mislabels the axis (e.g. `token/s` for
 * observation rate, or raw seconds on a delta path).
 *
 * Dropped only for real histogram companions: a standalone counter such as
 * `dotnet_assembly_count` has no `dotnet_assembly_bucket` and keeps its declared unit.
 */
async function resolveSemanticUnit(
  name: string,
  declaredUnit: string | null,
  database?: string
): Promise<string | null> {
  const base = histogramCountBaseName(name)
  if (!declaredUnit || !base) {
    return declaredUnit
  }
  const dump = await semanticsDump(database)
  return dump.bucketTables.has(`${base}_bucket`) ? null : declaredUnit
}

/**
 * Classic OTLP histograms fan out into a `_bucket` table carrying `le`, which the
 * semantic layer declares too. An OTLP exponential histogram lands in the metric's
 * own table as a native histogram value with no `_bucket` sibling and no `le`
 * matrix — charting it as classic would query a table that does not exist.
 */
async function isNativeHistogram(name: string, database?: string): Promise<boolean> {
  // `_bucket` is itself the classic histogram table, never a native one.
  if (name.endsWith('_bucket')) {
    return false
  }
  const dump = await semanticsDump(database)
  return !dump.bucketTables.has(`${name}_bucket`)
}

async function resolveMetricKind(
  name: string,
  semantics: TableSemantics | null,
  database?: string
): Promise<MetricKind> {
  const declaredKind = declaredMetricKindFromSemantics(semantics)
  if (declaredKind === 'histogram') {
    // Checked first: a remote-write `_sum`/`_count` table has no `_bucket` companion
    // either, so the native check below would otherwise swallow a chartable counter.
    if (isHistogramCompanionSeries(name)) {
      return 'counter'
    }
    if (await isNativeHistogram(name, database)) {
      return 'native_histogram'
    }
  }
  return declaredKind ?? inferMetricKind(name)
}

/** Memo for {@link resolveMetricMeta}, keyed by database + name. */
const metricMetaMemo = new Map<string, { generation: number; meta: ResolvedMetricMeta }>()

/**
 * Resolve kind + declared unit/temporality/original_name for charting & UI.
 * Layer order: declared semantics (+ companion/native corrections) → name heuristic.
 */
export async function resolveMetricMeta(name: string, database?: string): Promise<ResolvedMetricMeta> {
  const trimmed = name.trim()
  if (!trimmed) {
    return {
      kind: 'unknown',
      semanticUnit: null,
      temporality: null,
      originalName: null,
      source: null,
      metadataQuality: null,
      semantics: null,
    }
  }

  const dump = await semanticsDump(database)
  const memoKey = `${database ?? ''}\0${trimmed}`
  const memoized = metricMetaMemo.get(memoKey)
  if (memoized && memoized.generation === dump.generation) {
    return memoized.meta
  }

  const semantics = dump.byName.get(trimmed) ?? null
  const meta: ResolvedMetricMeta = {
    kind: await resolveMetricKind(trimmed, semantics, database),
    semanticUnit: await resolveSemanticUnit(trimmed, declaredMetricUnitFromSemantics(semantics), database),
    temporality: declaredTemporalityFromSemantics(semantics),
    // `metadata_quality` describes `metric.type` only; original_name is never guessed.
    originalName: semantics?.metricOriginalName ?? null,
    source: semantics?.source ?? null,
    metadataQuality: semantics?.metadataQuality ?? null,
    semantics,
  }
  metricMetaMemo.set(memoKey, { generation: dump.generation, meta })
  return meta
}

// ---------------------------------------------------------------------------
// Entity identity
// ---------------------------------------------------------------------------

/**
 * Place a declaration path against the table's columns.
 * Longest existing column prefix wins, so `resource_attributes.service.namespace`
 * resolves to the flat column when it exists and to the JSON container otherwise.
 */
function toColumnRef(path: string, columns?: ReadonlySet<string>): EntityColumnRef {
  if (!columns?.size) {
    return { column: path }
  }
  if (columns.has(path)) {
    return { column: path }
  }

  const parts = path.split('.')
  for (let end = parts.length - 1; end > 0; end -= 1) {
    const head = parts.slice(0, end).join('.')
    if (columns.has(head)) {
      return { column: head, jsonKey: parts.slice(end).join('.') }
    }
  }

  return { column: path }
}

function toResolvedIdentity(declaration: EntityDeclaration, columns?: ReadonlySet<string>): ResolvedEntityIdentity {
  return {
    entityType: declaration.entityType,
    origin: 'declaration',
    id: declaration.id.map((path) => toColumnRef(path, columns)),
    idQualifier: declaration.idQualifier ? toColumnRef(declaration.idQualifier, columns) : undefined,
  }
}

/**
 * Resolve where an entity's identity lives for `tableName`.
 *
 * Priority is fixed and deliberate:
 * 1. `entity_declarations` — it can express composite keys and qualifiers, so it must
 *    win over any built-in assumption;
 * 2. the `greptime_trace_v1` model shape, which guarantees `service_name` even when a
 *    table declares nothing (measured: most tables in a real instance declare nothing);
 * 3. `null` — callers keep their existing settings / column-name heuristics.
 *
 * `columns` is optional: without it declaration paths are returned verbatim.
 */
export async function resolveEntityIdentity(
  tableName: string,
  entityType: string,
  columns?: ReadonlyArray<EntitySchemaColumn>,
  database?: string
): Promise<ResolvedEntityIdentity | null> {
  const name = tableName.trim()
  if (!name) {
    return null
  }

  const columnNames = columns?.length ? new Set(columns.map((column) => column.name)) : undefined
  const declarations = await getTableEntityDeclarations(name, database)
  const declaration = declarations.find((entry) => entry.entityType === entityType)
  if (declaration) {
    return toResolvedIdentity(declaration, columnNames)
  }

  // Model fallback: only what greptime_trace_v1 actually guarantees (`service`).
  if (entityType === 'service' && columnNames && isTraceModel(columnNames)) {
    return {
      entityType,
      origin: 'model',
      id: [{ column: TRACE_MODEL_SERVICE_COLUMN }],
    }
  }

  return null
}

/** Filter key form of an identity column: a flat column, or a JSON attribute chip. */
export function entityColumnFilterKey(reference: EntityColumnRef): string {
  return reference.jsonKey ? `${reference.column}.${reference.jsonKey}` : reference.column
}

/** First candidate the table actually has, placed as a flat column or a JSON container. */
function firstPresent(candidates: string[], columns?: ReadonlySet<string>): EntityColumnRef | undefined {
  if (!candidates.length) {
    return undefined
  }
  if (!columns?.size) {
    return { column: candidates[0] }
  }
  const match =
    candidates.find((candidate) => columns.has(candidate)) ??
    // A chip candidate counts as present when its container column exists.
    candidates.find((candidate) => {
      const dot = candidate.indexOf('.')
      return dot > 0 && columns.has(candidate.slice(0, dot))
    })
  if (!match) {
    // The schema is known and none of the candidates exists: a guessed column would only
    // produce SQL the server rejects ("No field named …") — report no identity instead.
    return undefined
  }
  return toColumnRef(match, columns)
}

/**
 * Where `entityKey` lives on `tableName`, with a fixed priority:
 *
 * 1. the table's `entity_declarations` (semantics — wins over every assumption);
 * 2. the `greptime_trace_v1` model shape (`service_name`), which the server guarantees;
 * 3. the ingestion source's convention (`opentelemetry` / `prometheus`), narrowed by
 *    which of its candidate columns the table actually has;
 * 4. nothing — `custom`/unknown sources and tables matching no convention get no entity,
 *    so the caller keeps its own behaviour instead of guessing a column.
 */
export async function resolveEntityFilterRef(
  tableName: string,
  entityKey: string,
  options?: {
    signal?: import('./types').EntitySignal
    columns?: ReadonlyArray<EntitySchemaColumn>
    database?: string
  }
): Promise<EntityColumnRef | undefined> {
  const name = tableName.trim()
  if (!name) {
    return undefined
  }

  const columns = options?.columns?.length ? new Set(options.columns.map((column) => column.name)) : undefined
  const identity = await resolveEntityIdentity(name, entityKey, options?.columns, options?.database)
  if (identity?.id[0]) {
    return identity.id[0]
  }

  const source = (await getTableSemantics(name, options?.database))?.source
  return firstPresent(conventionEntityKeys(options?.signal ?? 'metrics', entityKey, source), columns)
}

/** Filter key form of {@link resolveEntityFilterRef}. */
export async function resolveEntityFilterKey(
  tableName: string,
  entityKey: string,
  options?: {
    signal?: import('./types').EntitySignal
    columns?: ReadonlyArray<EntitySchemaColumn>
    database?: string
  }
): Promise<string | undefined> {
  const reference = await resolveEntityFilterRef(tableName, entityKey, options)
  return reference ? entityColumnFilterKey(reference) : undefined
}

/**
 * Physical service column for a trace field map: the resolved identity with JSON chips
 * dropped — trace maps address real columns only.
 */
export function physicalServiceColumn(reference: EntityColumnRef | undefined): string | undefined {
  return reference && !reference.jsonKey ? reference.column : undefined
}

/**
 * Candidate filter keys that may carry the logs detail group value: the role columns,
 * the table-resolved entity key, and the canonical `service` key. One shared helper so
 * every consumer answers "is this chip the service?" identically.
 */
export function logsServiceFilterCandidateKeys(
  fieldMapLogs: Record<string, string>,
  entityServiceKey?: string
): Set<string> {
  return new Set(
    [fieldMapLogs.primaryGroupBy, fieldMapLogs.service, entityServiceKey, 'service'].filter(Boolean) as string[]
  )
}

function uniquePreserveOrder(names: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  names.forEach((name) => {
    if (!name || seen.has(name)) {
      return
    }
    seen.add(name)
    result.push(name)
  })
  return result
}

/**
 * All user tables in the database (no name heuristics) — served from the global
 * database store's per-db table tree (paginated and cached there, refreshed on page
 * reload or sidebar refresh). Imported lazily: the classic store drags in the query
 * workbench dependency graph, which must not leak into this module's importers.
 */
async function listAllTables(database?: string): Promise<string[]> {
  const db = database ?? currentDatabase()
  const storeModule = await import('@/store/modules/database')
  return storeModule.default().getTableNames(db)
}

// ---------------------------------------------------------------------------
// Signal table selection
// ---------------------------------------------------------------------------

/**
 * Discover candidate logs tables.
 * Prefer table_semantics(signal_type=log) first, then every other table in the
 * database (no table-name heuristics).
 */
export async function listSignalTables(
  signal: 'logs',
  options?: { include?: string[]; database?: string }
): Promise<string[]>

/**
 * Discover and rank candidate traces tables.
 * Merges table_semantics(signal_type=trace), physical tables carrying `trace_id`, and
 * the known OTLP table name. Full greptime_trace_v1 shapes rank first; a `trace_id`-only
 * custom table remains selectable for trace-id investigation even though model roles are missing.
 */
export async function listSignalTables(
  signal: 'traces',
  options?: { include?: string[]; database?: string }
): Promise<string[]>

export async function listSignalTables(
  signal: 'logs' | 'traces',
  options?: { include?: string[]; database?: string }
): Promise<string[]> {
  const database = options?.database
  if (signal === 'logs') {
    const [fromSemantics, allTables] = await Promise.all([listBySignal('log', database), listAllTables(database)])
    const extras = (options?.include ?? []).filter(Boolean)
    // Semantics first (priority), then remaining tables — no name guessing.
    return uniquePreserveOrder([...fromSemantics.map((row) => row.tableName), ...allTables, ...extras])
  }

  const fromSemantics = await listBySignal('trace', database)
  // `trace_id` is the minimum physical evidence: it supports trace-id filtering even when
  // a custom table lacks parent/span-name/model roles. The store pre-filter is one
  // cached GROUP BY query.
  const { default: useTableSchemaStore } = await import('@/store/modules/table-schema')
  const tableSchemaStore = useTableSchemaStore()
  const traceCapable = await tableSchemaStore.tablesHavingColumn('trace_id', database)
  // A declaration wins over the physical trace_id signal: a table declared as another
  // signal (log/metric) is never a traces candidate. Undeclared trace_id-bearing
  // tables stay in — they are the escape hatch.
  const withSemantics = await Promise.all(
    [...traceCapable].map(async (name) => ({ name, semantics: await getTableSemantics(name, database) }))
  )
  const fromColumns = withSemantics
    .filter(({ semantics }) => !semantics?.signalType || semantics.signalType === 'trace')
    .map(({ name }) => name)

  // Names only — no columns fetch here. Full-model ranking lives in
  // `resolveSignalTable`, the only consumer that needs it (auto-binding without an
  // explicit table); the dropdown and builder work fine with declaration-first order.
  const candidates = uniquePreserveOrder([
    ...fromSemantics.map((row) => row.tableName),
    ...fromColumns,
    ...(options?.include ?? []).filter(Boolean),
  ])
  if (import.meta.env.DEV) {
    console.info('[traces-discovery] traces candidates (names only):', candidates)
  }
  return candidates
}

/**
 * Resolve the bound traces table.
 * Priority: preferred → settings → auto-bind.
 * Auto-binding is the only path that fetches candidate columns: without full-model
 * evidence an alphabetically-first trace_id table (e.g. an internal `_gt_logs`)
 * would win over `opentelemetry_traces`. With preferred/settings — the normal case —
 * no columns query happens at all.
 */
export async function resolveSignalTable(
  signal: 'traces',
  options?: { preferred?: string; settingsTable?: string; database?: string }
): Promise<string | undefined>

export async function resolveSignalTable(
  signal: 'logs' | 'traces',
  options?: { preferred?: string; settingsTable?: string; database?: string }
): Promise<string | undefined> {
  if (options?.preferred?.trim()) {
    return options.preferred.trim()
  }
  if (options?.settingsTable?.trim()) {
    return options.settingsTable.trim()
  }
  if (signal === 'logs') {
    const listed = await listSignalTables('logs', { database: options?.database })
    return listed[0]
  }

  const listed = await listSignalTables('traces', { database: options?.database })
  if (!listed.length) {
    return undefined
  }

  // Auto-bind: rank candidates by full greptime_trace_v1 model. One batched columns
  // query, once — the results land in the table-schema store cache.
  const { default: useTableSchemaStore } = await import('@/store/modules/table-schema')
  const tableSchemaStore = useTableSchemaStore()
  if (import.meta.env.DEV) {
    console.info('[traces-discovery] auto-bind → schema batch:', listed)
  }
  await tableSchemaStore.ensureTableSchemas(listed, options?.database).catch(() => undefined)

  const scored: Array<{ name: string; evidence: TraceTableEvidence }> = []
  await Promise.all(
    listed.map(async (name) => {
      let columnNames: string[] = []
      try {
        columnNames = (await tableSchemaStore.ensureTableSchema(name, options?.database)).map((column) => column.name)
      } catch {
        columnNames = []
      }
      const semantics = await getTableSemantics(name, options?.database)
      const declaredTrace = semantics?.signalType === 'trace'
      // A traces table must be trace-filterable: physical trace_id or a declaration.
      if (!columnNames.includes('trace_id') && !declaredTrace) {
        return
      }
      scored.push({
        name,
        evidence: {
          fullModel: isTraceModel(new Set(columnNames)),
          declaredTrace,
        },
      })
    })
  )
  if (!scored.length) {
    // Every schema fetch failed — fall back to discovery order instead of nothing.
    return listed[0]
  }
  scored.sort(compareTraceTableCandidates)
  return scored[0].name
}

// ---------------------------------------------------------------------------
// Signal table inspection (schema + service identity; does not write Context)
// ---------------------------------------------------------------------------

export interface SignalTableInspection {
  /** Physical columns of the bound table; empty when the schema could not be loaded. */
  columns: Array<{ name: string; data_type?: string; semantic_type?: string }>
  /** Resolved `service` identity — a real column or a JSON chip (logs). */
  serviceRef?: EntityColumnRef
}

/**
 * Load the physical schema once and resolve the `service` entity once.
 * Returns an empty `columns` array on failure so callers can clear binding state together.
 * Does not write Context — the binder (`useSignalBinding` / `bindTable`) publishes the result.
 */
export async function inspectSignalTable(
  signal: Extract<EntitySignal, 'logs' | 'traces'>,
  tableName: string,
  database: string
): Promise<SignalTableInspection> {
  const name = tableName.trim()
  if (!name) {
    return { columns: [] }
  }

  try {
    // Dynamic import keeps Pinia/table-schema out of resolve's top-level graph so
    // pure resolve consumers (and their unit tests) do not need a Vue app.
    const { default: useTableSchemaStore } = await import('@/store/modules/table-schema')
    if (import.meta.env.DEV) {
      console.info('[signal-binding] inspect table:', signal, name, database)
    }
    const columns = (await useTableSchemaStore().ensureTableSchema(name, database)) as SignalTableInspection['columns']
    let serviceRef: EntityColumnRef | undefined
    try {
      serviceRef = await resolveEntityFilterRef(name, 'service', { signal, columns, database })
    } catch (error) {
      console.error(`Failed to resolve the service filter key for ${name}:`, error)
    }
    return { columns, serviceRef }
  } catch (error) {
    console.error(`Failed to inspect ${signal} table ${name}:`, error)
    return { columns: [] }
  }
}
