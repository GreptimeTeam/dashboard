import editorApi from '@/api/editor'
import {
  conventionEntityKeys,
  isTraceModel,
  KNOWN_OTLP_TRACE_TABLE,
  TRACE_MODEL_REQUIRED_COLUMNS,
  TRACE_MODEL_SERVICE_COLUMN,
  traceModelScore,
} from './otlp'
import {
  declaredMetricKindFromSemantics,
  declaredMetricUnitFromSemantics,
  declaredTemporalityFromSemantics,
  getTableEntityDeclarations,
  getTableSemantics,
  listBySignal,
  semanticsDump,
} from './source'
import { currentDatabase } from '../current-database'
import { inferMetricKind } from './heuristics'
import type {
  EntityColumnRef,
  EntityDeclaration,
  EntitySchemaColumn,
  MetricKind,
  MetricTableSemantics,
  MetricTemporality,
  ResolvedEntityIdentity,
} from './types'

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
  semantics: MetricTableSemantics | null
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
  semantics: MetricTableSemantics | null,
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
    }) ??
    candidates[0]
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

const LOG_TABLE_HEURISTICS = [/log/i]

function tableNamesFromRecords(records: {
  rows?: string[][]
  schema?: { column_schemas?: Array<{ name: string }> }
}): string[] {
  const schemas = records?.schema?.column_schemas ?? []
  const tableNameIndex = schemas.findIndex((schema) => schema.name === 'table_name')
  if (tableNameIndex < 0 || !Array.isArray(records?.rows)) {
    return []
  }
  return records.rows.map((row) => String(row[tableNameIndex] ?? '')).filter(Boolean)
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

/** Log table names guessed from table names containing "log". */
async function listHeuristicLogTables(database?: string): Promise<string[]> {
  try {
    const tables = (await editorApi.getTables(500, 0, database)) as { output?: Array<{ records?: unknown }> }
    const names = tableNamesFromRecords(tables?.output?.[0]?.records as never)
    return names.filter((name) => LOG_TABLE_HEURISTICS.some((pattern) => pattern.test(name)))
  } catch (error) {
    console.error('Failed to list heuristic log tables:', error)
    return []
  }
}

/**
 * Trace table candidates guessed from the column model: tables whose columns cover the
 * full greptime_trace_v1 required set.
 */
async function listColumnModelTraceTables(requiredColumns: readonly string[], database?: string): Promise<string[]> {
  try {
    // Without the schema filter the GROUP BY unions columns from same-named tables in
    // different schemas, so a name can pass HAVING although no single table has all five.
    const db = database ?? currentDatabase()
    const modelColumns = requiredColumns.map((name) => `'${name}'`).join(', ')
    const sql = `SELECT table_name
FROM information_schema.columns
WHERE table_schema = '${db}'
  AND column_name IN (${modelColumns})
GROUP BY table_name
HAVING COUNT(DISTINCT column_name) = ${requiredColumns.length}
ORDER BY table_name
LIMIT 200`
    const result = (await editorApi.runSQL(sql, db)) as { output?: Array<{ records?: never }> }
    return tableNamesFromRecords(result?.output?.[0]?.records)
  } catch (error) {
    console.error('Failed to list column-model trace tables:', error)
    return []
  }
}

/** Column names of one table, used by trace-model scoring. Empty on failure. */
async function loadTableColumnNames(tableName: string, database?: string): Promise<string[]> {
  try {
    const columns = (await editorApi.getTableSchema(tableName, database)) as Array<{ name: string }>
    return columns.map((column) => column.name)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Signal table selection
// ---------------------------------------------------------------------------

function pickLogTableFromNames(names: string[]): string | undefined {
  if (!names.length) {
    return undefined
  }
  if (names.length === 1) {
    return names[0]
  }
  const heuristic = names.find((name) => LOG_TABLE_HEURISTICS.some((pattern) => pattern.test(name)))
  return heuristic ?? names[0]
}

/**
 * Discover candidate logs tables.
 * Merges table_semantics(signal_type=log) with names containing "log".
 */
export async function listSignalTables(
  signal: 'logs',
  options?: { include?: string[]; database?: string }
): Promise<string[]>

/**
 * Discover and rank candidate traces tables.
 * Merges: table_semantics(signal_type=trace) ∪ required-column model check ∪ known OTLP name.
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
    const [fromSemantics, fromHeuristic] = await Promise.all([
      listBySignal('log', database),
      listHeuristicLogTables(database),
    ])
    const extras = (options?.include ?? []).filter(Boolean)
    return uniquePreserveOrder([...fromSemantics.map((row) => row.tableName), ...fromHeuristic, ...extras])
  }

  const fromSemantics = await listBySignal('trace', database)
  const pipelineByTable = new Map(fromSemantics.map((row) => [row.tableName, row.pipeline]))
  const fromColumns = await listColumnModelTraceTables(TRACE_MODEL_REQUIRED_COLUMNS, database)
  const candidates = uniquePreserveOrder([
    ...fromSemantics.map((row) => row.tableName),
    ...fromColumns,
    ...(options?.include ?? []).filter(Boolean),
    KNOWN_OTLP_TRACE_TABLE,
  ])

  const scored: Array<{ name: string; score: number }> = []
  await Promise.all(
    candidates.map(async (name) => {
      const columnNames = await loadTableColumnNames(name, database)
      if (!columnNames.length) {
        // Keep semantics-only names even if schema fetch fails (settings / allow-create).
        if (pipelineByTable.has(name) || options?.include?.includes(name)) {
          scored.push({
            name,
            score: traceModelScore([], { pipeline: pipelineByTable.get(name), tableName: name }),
          })
        }
        return
      }
      if (!isTraceModel(new Set(columnNames)) && !pipelineByTable.has(name)) {
        return
      }
      scored.push({
        name,
        score: traceModelScore(columnNames, { pipeline: pipelineByTable.get(name), tableName: name }),
      })
    })
  )

  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }
    return left.name.localeCompare(right.name)
  })

  return scored.map((row) => row.name)
}

/**
 * Resolve the bound logs table.
 * Priority: explicit override → settings → semantics → heuristics.
 */
export async function resolveSignalTable(
  signal: 'logs',
  options?: { preferred?: string; settingsTable?: string; database?: string }
): Promise<string | undefined>

/**
 * Resolve the bound traces table.
 * Priority: preferred → settings → ranked listSignalTables first hit.
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

  const database = options?.database
  if (signal === 'logs') {
    const fromSemantics = await listBySignal('log', database)
    const picked = pickLogTableFromNames(fromSemantics.map((row) => row.tableName))
    if (picked) {
      return picked
    }
    const heuristic = await listHeuristicLogTables(database)
    return pickLogTableFromNames(heuristic)
  }

  const listed = await listSignalTables('traces', { database })
  return listed[0]
}
