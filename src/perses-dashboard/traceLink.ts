export const TRACE_MODAL_VIEW = 'gantt'
export const TRACE_MODAL_MODE = 'modal'
export const TRACE_MODAL_SOURCE = 'perses-trace-table'
export const TRACE_ID_QUERY_KEY = 'traceId'
export const TRACE_MODAL_LINK_PATH = '/__perses_trace_modal__'

export type TraceModalPayload = {
  traceId: string
  table?: string
  database?: string
  source?: string
  mode?: string
  view?: string
}

type TraceLinkContext = {
  table?: string
  database?: string
}

const TRACE_ID_TEMPLATE = ['$', '{traceId}'].join('')
const TABLE_TEMPLATE = ['$', '{table}'].join('')
const DATABASE_TEMPLATE = ['$', '{database}'].join('')

export function buildDefaultTraceLink(context: TraceLinkContext = {}): string {
  const params: Array<[string, string]> = []
  params.push([TRACE_ID_QUERY_KEY, TRACE_ID_TEMPLATE])
  params.push(['table', context.table || TABLE_TEMPLATE])
  if (context.database) {
    params.push(['database', context.database])
  } else if (!context.table) {
    // Keep backward-compatible variable template when table/database are not resolved yet.
    params.push(['database', DATABASE_TEMPLATE])
  }
  params.push(['view', TRACE_MODAL_VIEW])
  params.push(['mode', TRACE_MODAL_MODE])
  params.push(['source', TRACE_MODAL_SOURCE])

  const query = params
    .map(([key, value]) => {
      const encodedValue = value.startsWith('${') && value.endsWith('}') ? value : encodeURIComponent(value)
      return `${encodeURIComponent(key)}=${encodedValue}`
    })
    .join('&')

  return `${TRACE_MODAL_LINK_PATH}?${query}`
}

function extractSqlFromTraceTablePanel(panel: any): string | undefined {
  const queries = panel?.spec?.queries
  if (!Array.isArray(queries)) return undefined
  return queries
    .map((query: any) => query?.spec?.plugin?.spec?.query)
    .find((sql: unknown) => typeof sql === 'string' && sql.trim().length > 0)
}

function resolveTraceTargetFromSql(sql?: string): TraceLinkContext {
  if (!sql) return {}
  // Handles: FROM "db"."table", FROM db.table, FROM "table", FROM table
  const fromMatch = sql.match(
    /\bfrom\s+((?:"[^"]+"|`[^`]+`|[a-zA-Z_][\w$]*)\s*\.\s*)?(?:"([^"]+)"|`([^`]+)`|([a-zA-Z_][\w$]*))/i
  )
  if (!fromMatch) return {}

  const rawDatabasePart = fromMatch[1]?.replace(/\s*\.\s*$/, '').trim()
  const database = rawDatabasePart ? rawDatabasePart.replace(/^["`]|["`]$/g, '') : undefined
  const table = fromMatch[2] || fromMatch[3] || fromMatch[4]
  if (!table) return {}
  return { table, database }
}

function isTemplateValue(value?: string | null): boolean {
  if (!value) return false
  const trimmed = value.trim()
  return /^\$\{[^}]+\}$/.test(trimmed) || /^%24%7B[^%]+%7D$/i.test(trimmed)
}

function shouldAutoUpgradeTraceLink(currentTraceLink?: string): boolean {
  if (!currentTraceLink || currentTraceLink.trim().length === 0) return true

  let url: URL
  try {
    url = new URL(currentTraceLink, window.location.origin)
  } catch {
    return false
  }

  const tableParam = url.searchParams.get('table')
  const databaseParam = url.searchParams.get('database')
  const modeParam = url.searchParams.get('mode')
  const viewParam = url.searchParams.get('view')
  const sourceParam = url.searchParams.get('source')

  const isKnownTraceModalLink =
    url.pathname === TRACE_MODAL_LINK_PATH ||
    (modeParam === TRACE_MODAL_MODE && viewParam === TRACE_MODAL_VIEW) ||
    sourceParam === TRACE_MODAL_SOURCE

  if (!isKnownTraceModalLink) return false

  // Auto-upgrade protocol links that still carry unresolved templates.
  return isTemplateValue(tableParam) || isTemplateValue(databaseParam)
}

export function ensureTraceTableLinks<T extends Record<string, any>>(dashboard: T): T {
  if (!dashboard?.spec?.panels) return dashboard

  const nextPanels = { ...dashboard.spec.panels }
  let hasChanges = false

  Object.entries(nextPanels).forEach(([panelId, panel]: [string, any]) => {
    if (panel?.kind !== 'Panel') return
    if (panel?.spec?.plugin?.kind !== 'TraceTable') return

    const resolvedTarget = resolveTraceTargetFromSql(extractSqlFromTraceTablePanel(panel))
    const currentTraceLink = panel?.spec?.plugin?.spec?.links?.trace
    const inferredTraceLink = buildDefaultTraceLink(resolvedTarget)
    // Keep user custom links untouched; auto-upgrade only empty/default protocol links.
    if (!shouldAutoUpgradeTraceLink(currentTraceLink) && currentTraceLink !== inferredTraceLink) {
      return
    }

    nextPanels[panelId] = {
      ...panel,
      spec: {
        ...panel.spec,
        plugin: {
          ...panel.spec?.plugin,
          spec: {
            ...(panel.spec?.plugin?.spec || {}),
            links: {
              ...(panel.spec?.plugin?.spec?.links || {}),
              trace: inferredTraceLink,
            },
          },
        },
      },
    }
    hasChanges = true
  })

  if (!hasChanges) return dashboard

  return {
    ...dashboard,
    spec: {
      ...dashboard.spec,
      panels: nextPanels,
    },
  }
}

export function parseTraceModalPayloadFromHref(href: string): TraceModalPayload | null {
  if (!href) return null

  let url: URL
  try {
    url = new URL(href, window.location.origin)
  } catch {
    return null
  }

  const traceId = url.searchParams.get(TRACE_ID_QUERY_KEY) || url.searchParams.get('var-traceId')
  if (!traceId) return null

  return {
    traceId,
    view: url.searchParams.get('view') || undefined,
    mode: url.searchParams.get('mode') || undefined,
    source: url.searchParams.get('source') || undefined,
    table: url.searchParams.get('table') || url.searchParams.get('var-table') || undefined,
    database: url.searchParams.get('database') || url.searchParams.get('var-database') || undefined,
  }
}

export function isTraceModalPayload(payload: TraceModalPayload): boolean {
  return payload.mode === TRACE_MODAL_MODE && payload.view === TRACE_MODAL_VIEW && Boolean(payload.traceId)
}
