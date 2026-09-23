import editorApi from '@/api/editor'
import { currentDatabase } from '../current-database'
import type { EntityDeclaration, MetadataQuality, MetricKind, MetricTableSemantics, MetricTemporality } from './types'

const SEMANTICS_SELECT =
  'SELECT table_name, signal_type, source, pipeline, metadata_quality, semantic_options, entity_declarations FROM information_schema.table_semantics'

/** One semantic row per table of the loaded database, plus the derived lookup indexes. */
export interface SemanticsDump {
  generation: number
  byName: Map<string, MetricTableSemantics>
  bySignal: Map<string, Array<{ tableName: string; pipeline?: string }>>
  /** Tables ending in `_bucket` — decides classic vs native histogram companions. */
  bucketTables: Set<string>
}

let settledDumps = new Map<string, SemanticsDump>()
/** Databases confirmed to have no `table_semantics` view — never queried again. */
const missingViews = new Set<string>()
let inFlight: { database: string; promise: Promise<SemanticsDump> } | null = null
let generation = 0

function emptyDump(): SemanticsDump {
  generation += 1
  return { generation, byName: new Map(), bySignal: new Map(), bucketTables: new Set() }
}

/**
 * `information_schema.table_semantics` covers every schema of the current catalog,
 * so the schema filter is what keeps two same-named tables from colliding.
 *
 * Deliberately no `signal_type` filter: entity declarations live outside metric rows
 * (on a real instance 812 metric rows carry none, while 5 null-signal and 1 trace row
 * do), and every lookup is by table name anyway.
 */
function semanticsSQL(database: string): string {
  return `${SEMANTICS_SELECT} WHERE table_schema = '${database}'`
}

function parseSemanticOptions(raw: unknown): Record<string, unknown> {
  if (raw == null) {
    return {}
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }
  return {}
}

function optionString(options: Record<string, unknown>, key: string): string | undefined {
  const value = options[key]
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

/**
 * `entity_declarations` is a JSON array; entries whose `id` is missing or empty are
 * dropped rather than surfaced as an identity with no columns.
 */
function parseEntityDeclarations(raw: unknown): EntityDeclaration[] | undefined {
  if (raw == null) {
    return undefined
  }
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return undefined
    }
  }
  if (!Array.isArray(parsed)) {
    return undefined
  }

  const declarations: EntityDeclaration[] = []
  parsed.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return
    }
    const record = entry as Record<string, unknown>
    const id = (Array.isArray(record.id) ? record.id : [record.id]).map(optionalString).filter(Boolean) as string[]
    const entityType = optionalString(record.entity_type)
    if (!entityType || !id.length) {
      return
    }
    declarations.push({
      entityType,
      origin: optionalString(record.origin),
      id,
      idQualifier: optionalString(record.id_qualifier),
      supersededBy: optionalString(record.superseded_by),
    })
  })

  return declarations.length ? declarations : undefined
}

function rowToSemantics(row: unknown[], schemas: Array<{ name: string }>): MetricTableSemantics | null {
  const indexOf = (name: string) => schemas.findIndex((schema) => schema.name === name)
  const tableNameIndex = indexOf('table_name')
  if (tableNameIndex < 0) {
    return null
  }
  const tableName = String(row[tableNameIndex] ?? '').trim()
  if (!tableName) {
    return null
  }

  const qualityIndex = indexOf('metadata_quality')
  const optionsIndex = indexOf('semantic_options')
  const signalIndex = indexOf('signal_type')
  const sourceIndex = indexOf('source')
  const pipelineIndex = indexOf('pipeline')
  const declarationsIndex = indexOf('entity_declarations')
  const metadataQuality: MetadataQuality = qualityIndex >= 0 ? String(row[qualityIndex] ?? 'unknown') : 'unknown'
  const options = parseSemanticOptions(optionsIndex >= 0 ? row[optionsIndex] : undefined)

  return {
    tableName,
    metadataQuality,
    signalType: signalIndex >= 0 ? String(row[signalIndex] ?? '').trim() || undefined : undefined,
    source: sourceIndex >= 0 ? String(row[sourceIndex] ?? '').trim() || undefined : undefined,
    pipeline: pipelineIndex >= 0 ? String(row[pipelineIndex] ?? '').trim() || undefined : undefined,
    metricType: optionString(options, 'metric.type'),
    metricUnit: optionString(options, 'metric.unit'),
    metricTemporality: optionString(options, 'metric.temporality'),
    metricOriginalName: optionString(options, 'metric.original_name'),
    entityDeclarations: declarationsIndex >= 0 ? parseEntityDeclarations(row[declarationsIndex]) : undefined,
  }
}

function buildDump(rows: unknown[], schemas: Array<{ name: string }>): SemanticsDump {
  const dump = emptyDump()
  rows.forEach((row) => {
    if (!Array.isArray(row)) {
      return
    }
    const semantics = rowToSemantics(row, schemas)
    if (!semantics?.tableName) {
      return
    }
    dump.byName.set(semantics.tableName, semantics)
    if (semantics.signalType) {
      const list = dump.bySignal.get(semantics.signalType) ?? []
      list.push({ tableName: semantics.tableName, pipeline: semantics.pipeline })
      dump.bySignal.set(semantics.signalType, list)
    }
    if (semantics.tableName.endsWith('_bucket')) {
      dump.bucketTables.add(semantics.tableName)
    }
  })
  return dump
}

/**
 * True when the error is "the view does not exist here" rather than a transient
 * failure. The rejected payload only carries `{ error, startTime }`, so this matches
 * on the message the SQL API returns: `Failed to plan SQL: Table not found: …`.
 */
function isMissingSemanticsView(error: unknown): boolean {
  let message = ''
  if (error && typeof error === 'object' && 'error' in error) {
    message = String((error as { error?: unknown }).error ?? '')
  } else if (error instanceof Error) {
    const { message: errorMessage } = error
    message = errorMessage
  } else {
    message = String(error ?? '')
  }
  return /table not found/i.test(message) && message.includes('table_semantics')
}

type FetchStatus = 'ok' | 'missing' | 'transient'

async function fetchDump(database: string): Promise<{ status: FetchStatus; dump: SemanticsDump }> {
  try {
    // The view is optional (older deployments) — never surface its absence as a toast.
    const response = await editorApi.runSQL(semanticsSQL(database), database, { suppressErrorToast: true })
    const records = response?.output?.[0]?.records
    const schemas = records?.schema?.column_schemas ?? []
    const rows = records?.rows
    return { status: 'ok', dump: Array.isArray(rows) ? buildDump(rows, schemas) : emptyDump() }
  } catch (error) {
    if (isMissingSemanticsView(error)) {
      return { status: 'missing', dump: emptyDump() }
    }
    // Transient: hand out an empty dump so this call degrades to conventions/heuristics,
    // but do not settle the cache — the next lookup retries the read.
    console.warn('Failed to load information_schema.table_semantics:', error)
    return { status: 'transient', dump: emptyDump() }
  }
}

/**
 * The dump for `database`. Minimal policy: load once per database; a missing view is
 * remembered forever; a transient failure is not settled, so the next access retries.
 * Concurrent callers for the same database share one in-flight request.
 */
function semanticsFor(database: string): Promise<SemanticsDump> {
  const settled = settledDumps.get(database)
  if (settled) {
    return Promise.resolve(settled)
  }
  if (missingViews.has(database)) {
    return Promise.resolve(emptyDump())
  }
  if (inFlight?.database === database) {
    return inFlight.promise
  }

  const promise = fetchDump(database).then((result) => {
    if (result.status !== 'transient') {
      if (result.status === 'missing') {
        missingViews.add(database)
      }
      settledDumps.set(database, result.dump)
    }
    if (inFlight?.promise === promise) {
      inFlight = null
    }
    return result.dump
  })
  inFlight = { database, promise }
  return promise
}

/**
 * Load the semantic dump for a database (defaults to the global connection DB).
 * Repeated calls for the same database reuse the settled dump.
 */
export async function ensureSemanticsLoaded(database?: string): Promise<void> {
  await semanticsFor(database ?? currentDatabase())
}

/** The dump for a database — internal to the semantics layer. */
export function semanticsDump(database?: string): Promise<SemanticsDump> {
  return semanticsFor(database ?? currentDatabase())
}

/** Look up a table's semantic row from the dump of the given (or current) database. */
export async function getTableSemantics(tableName: string, database?: string): Promise<MetricTableSemantics | null> {
  const key = tableName.trim()
  if (!key) {
    return null
  }
  const dump = await semanticsDump(database)
  return dump.byName.get(key) ?? null
}

/**
 * Whether the database's dump has a row for `tableName`.
 * Answers "does this table exist in the semantic layer" without a second query —
 * used to tell a classic histogram's `_bucket` companion from a native one.
 */
export async function hasSemanticsTable(tableName: string, database?: string): Promise<boolean> {
  const key = tableName.trim()
  if (!key) {
    return false
  }
  const dump = await semanticsDump(database)
  return dump.byName.has(key)
}

/** Entity identities declared for `tableName` — empty when the table declares none. */
export async function getTableEntityDeclarations(tableName: string, database?: string): Promise<EntityDeclaration[]> {
  const semantics = await getTableSemantics(tableName, database)
  return semantics?.entityDeclarations ?? []
}

/** Semantic rows for a signal ('log' | 'trace' | 'metric'), sorted by table name. */
export async function listBySignal(
  signal: string,
  database?: string
): Promise<Array<{ tableName: string; pipeline?: string }>> {
  const dump = await semanticsDump(database)
  return [...(dump.bySignal.get(signal) ?? [])].sort((left, right) => left.tableName.localeCompare(right.tableName))
}

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
export function declaredMetricKindFromSemantics(semantics: MetricTableSemantics | null): MetricKind | null {
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
export function declaredMetricUnitFromSemantics(semantics: MetricTableSemantics | null): string | null {
  return semantics?.metricUnit ?? null
}

/** Instrument temporality — null when the table carries none (see unit above). */
export function declaredTemporalityFromSemantics(semantics: MetricTableSemantics | null): MetricTemporality | null {
  return semantics?.metricTemporality ?? null
}

/** Test helper — drop cached dumps (and missing-view markers) between cases. */
export function clearSemanticsCache(): void {
  settledDumps = new Map()
  missingViews.clear()
  inFlight = null
}
