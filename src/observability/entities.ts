import { conventionEntityKeys, type EntitySignal } from './entity-keys'
import { getMetricTableSemantics, getTableEntityDeclarations, type EntityDeclaration } from './table-semantics'
import { TRACE_MODEL_SERVICE_COLUMN, isTraceModel } from './traces/model'

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
export default async function resolveEntityIdentity(
  tableName: string,
  entityType: string,
  columns?: ReadonlyArray<EntitySchemaColumn>
): Promise<ResolvedEntityIdentity | null> {
  const name = tableName.trim()
  if (!name) {
    return null
  }

  const columnNames = columns?.length ? new Set(columns.map((column) => column.name)) : undefined
  const declarations = await getTableEntityDeclarations(name)
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
  options?: { signal?: EntitySignal; columns?: ReadonlyArray<EntitySchemaColumn> }
): Promise<EntityColumnRef | undefined> {
  const name = tableName.trim()
  if (!name) {
    return undefined
  }

  const columns = options?.columns?.length ? new Set(options.columns.map((column) => column.name)) : undefined
  const identity = await resolveEntityIdentity(name, entityKey, options?.columns)
  if (identity?.id[0]) {
    return identity.id[0]
  }

  const source = (await getMetricTableSemantics(name))?.source
  return firstPresent(conventionEntityKeys(options?.signal ?? 'metrics', entityKey, source), columns)
}

/** Filter key form of {@link resolveEntityFilterRef}. */
export async function resolveEntityFilterKey(
  tableName: string,
  entityKey: string,
  options?: { signal?: EntitySignal; columns?: ReadonlyArray<EntitySchemaColumn> }
): Promise<string | undefined> {
  const reference = await resolveEntityFilterRef(tableName, entityKey, options)
  return reference ? entityColumnFilterKey(reference) : undefined
}
