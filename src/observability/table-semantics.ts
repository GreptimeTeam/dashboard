import editorApi from '@/api/editor'
import { currentDatabase } from './current-database'
import type { MetricKind } from './metrics/infer-promql'

export type MetadataQuality = 'declared' | 'inferred' | 'unknown' | string

/** Greptime `metric.temporality` values. */
export type MetricTemporality = 'cumulative' | 'delta' | 'mixed' | 'unknown' | string

export interface MetricTableSemantics {
  tableName: string
  metadataQuality: MetadataQuality
  signalType?: string
  source?: string
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

const SEMANTICS_SELECT =
  'SELECT table_name, signal_type, source, metadata_quality, semantic_options, entity_declarations FROM information_schema.table_semantics'

/** Minimum spacing between refresh-triggered dump reads (see `ensureMetricSemanticsLoaded`). */
const REFRESH_INTERVAL_MS = 10_000

/**
 * One dump per database, shared by concurrent callers.
 *
 * `loadedDatabase` is the database `dump` belongs to; a different current database
 * starts a fresh dump, so switching schemas can neither leak another schema's
 * declarations nor hide the new schema's own. `missingView` means this database has no
 * `table_semantics` view at all (older deployment) — permanent, silently remembered.
 * A transient failure is cached as an empty map so lookups stay cheap, but a refresh
 * is allowed to retry it.
 */
let loadedDatabase: string | null = null
let loadedAt = 0
let dump: Promise<Map<string, MetricTableSemantics>> | null = null
let missingView = false
let inFlight = false
let loadToken = 0

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
  const declarationsIndex = indexOf('entity_declarations')
  const metadataQuality = qualityIndex >= 0 ? String(row[qualityIndex] ?? 'unknown') : 'unknown'
  const options = parseSemanticOptions(optionsIndex >= 0 ? row[optionsIndex] : undefined)

  return {
    tableName,
    metadataQuality,
    signalType: signalIndex >= 0 ? String(row[signalIndex] ?? '').trim() || undefined : undefined,
    source: sourceIndex >= 0 ? String(row[sourceIndex] ?? '').trim() || undefined : undefined,
    metricType: optionString(options, 'metric.type'),
    metricUnit: optionString(options, 'metric.unit'),
    metricTemporality: optionString(options, 'metric.temporality'),
    metricOriginalName: optionString(options, 'metric.original_name'),
    entityDeclarations: declarationsIndex >= 0 ? parseEntityDeclarations(row[declarationsIndex]) : undefined,
  }
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

/**
 * Whether PromQL should wrap the series in `rate()`.
 * Prefer importing from infer-promql; re-exported for convenience.
 */
export { shouldApplyRate } from './metrics/infer-promql'

function ingestSemanticsRows(
  rows: unknown[],
  schemas: Array<{ name: string }>,
  target: Map<string, MetricTableSemantics>
): void {
  rows.forEach((row) => {
    if (!Array.isArray(row)) {
      return
    }
    const semantics = rowToSemantics(row, schemas)
    if (semantics?.tableName) {
      // Core fields only — rowToSemantics already drops raw semantic_options JSON.
      target.set(semantics.tableName, semantics)
    }
  })
}

/**
 * True when the error is "the view does not exist here" rather than a transient
 * failure. The rejected payload only carries `{ error, startTime }`, so this matches
 * on the message the SQL API returns: `Failed to plan SQL: Table not found: …`.
 */
function isMissingSemanticsView(error: unknown): boolean {
  const message =
    error && typeof error === 'object' && 'error' in error
      ? String((error as { error?: unknown }).error ?? '')
      : error instanceof Error
      ? error.message
      : String(error ?? '')
  return /table not found/i.test(message) && message.includes('table_semantics')
}

async function fetchTableSemantics(database: string): Promise<Map<string, MetricTableSemantics>> {
  const byTableName = new Map<string, MetricTableSemantics>()
  try {
    // The view is optional (older deployments) — never surface its absence as a toast.
    const response = await editorApi.runSQL(semanticsSQL(database), undefined, { suppressErrorToast: true })
    const records = response?.output?.[0]?.records
    const schemas = records?.schema?.column_schemas ?? []
    const rows = records?.rows
    if (Array.isArray(rows)) {
      ingestSemanticsRows(rows, schemas, byTableName)
    }
  } catch (error) {
    if (isMissingSemanticsView(error)) {
      // Only settle the database this load was started for (the user may have switched).
      if (loadedDatabase === database) {
        missingView = true
      }
    } else {
      // Transient: keep the empty map (no per-name fallback) but allow a later refresh
      // to retry, so one bad request does not degrade the whole session.
      console.warn('Failed to load information_schema.table_semantics:', error)
    }
  }
  return byTableName
}

function shouldReload(database: string, refresh: boolean): boolean {
  if (!dump || loadedDatabase !== database) {
    return true
  }
  if (inFlight || missingView) {
    return false
  }
  return refresh && Date.now() - loadedAt >= REFRESH_INTERVAL_MS
}

/** The dump for `database`, reusing the loaded/in-flight one and swapping on db change. */
function semanticsFor(database: string, refresh = false): Promise<Map<string, MetricTableSemantics>> {
  if (shouldReload(database, refresh)) {
    loadedDatabase = database
    loadedAt = Date.now()
    missingView = false
    inFlight = true
    const token = (loadToken += 1)
    dump = fetchTableSemantics(database).then((result) => {
      if (token === loadToken) {
        inFlight = false
      }
      return result
    })
  }
  return dump ?? Promise.resolve(new Map<string, MetricTableSemantics>())
}

/**
 * Load all metric rows from `table_semantics` for the current database.
 * Per-name lookups never issue their own SQL. `refresh: true` re-reads the dump so
 * tables created during the session pick up their semantics, throttled to at most one
 * read per {@link REFRESH_INTERVAL_MS}; a database without the view stays settled.
 */
export async function ensureMetricSemanticsLoaded(options?: { refresh?: boolean }): Promise<void> {
  await semanticsFor(currentDatabase(), options?.refresh === true)
}

/**
 * Look up a table's semantic row from the in-memory dump of the current database.
 * Always waits for the dump; never issues per-name SQL.
 */
export async function getMetricTableSemantics(metricName: string): Promise<MetricTableSemantics | null> {
  const key = metricName.trim()
  if (!key) {
    return null
  }

  const semantics = await semanticsFor(currentDatabase())
  return semantics.get(key) ?? null
}

/**
 * Whether the current database's dump has a row for `tableName`.
 * Answers "does this table exist in the semantic layer" without a second query —
 * used to tell a classic histogram's `_bucket` companion from a native one.
 */
export async function hasSemanticsTable(tableName: string): Promise<boolean> {
  const key = tableName.trim()
  if (!key) {
    return false
  }

  const semantics = await semanticsFor(currentDatabase())
  return semantics.has(key)
}

/**
 * Entity identities declared for `tableName` — empty when the table declares none.
 * Shares the metric dump, so reading declarations costs no extra query.
 */
export async function getTableEntityDeclarations(tableName: string): Promise<EntityDeclaration[]> {
  const semantics = await getMetricTableSemantics(tableName)
  return semantics?.entityDeclarations ?? []
}

/** Test helper — drop the cached dump (and its database binding) between cases. */
export function clearMetricTableSemanticsCache(): void {
  loadedDatabase = null
  dump = null
  missingView = false
  inFlight = false
  loadToken += 1
}

export default getMetricTableSemantics
