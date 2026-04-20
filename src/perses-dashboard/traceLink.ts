export const TRACE_MODAL_VIEW = 'gantt'
export const TRACE_MODAL_MODE = 'modal'
export const TRACE_MODAL_SOURCE = 'perses-trace-table'
export const TRACE_ID_QUERY_KEY = 'traceId'

export type TraceModalPayload = {
  traceId: string
  table?: string
  database?: string
  source?: string
  mode?: string
  view?: string
}

export function buildDefaultTraceLink(): string {
  return `/dashboard/traces?${TRACE_ID_QUERY_KEY}=\${traceId}&table=\${table}&database=\${database}&view=${TRACE_MODAL_VIEW}&mode=${TRACE_MODAL_MODE}&source=${TRACE_MODAL_SOURCE}`
}

export function ensureTraceTableLinks<T extends Record<string, any>>(dashboard: T): T {
  if (!dashboard?.spec?.panels) return dashboard

  const nextPanels = { ...dashboard.spec.panels }
  let hasChanges = false

  Object.entries(nextPanels).forEach(([panelId, panel]: [string, any]) => {
    if (panel?.kind !== 'Panel') return
    if (panel?.spec?.plugin?.kind !== 'TraceTable') return

    const currentTraceLink = panel?.spec?.plugin?.spec?.links?.trace
    if (typeof currentTraceLink === 'string' && currentTraceLink.trim().length > 0) return

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
              trace: buildDefaultTraceLink(),
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
