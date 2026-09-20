import { getTableEntityDeclarations, type EntityDeclaration } from './table-semantics'
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
