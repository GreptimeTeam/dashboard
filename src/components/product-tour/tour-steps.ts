import type { LocationQuery } from 'vue-router'
import { decodeMaybeEncoded } from '@/utils/query-url'

export type TourStepId = 'sql' | 'promql' | 'tql' | 'logs' | 'traces' | 'signals-explore' | 'visualization'

export type TourStepDisplay = 'code' | 'preset' | 'where'

/** Exactly as shipped in the demo copy — do not reformat or localize. */
export const TOUR_SQL_QUERY = `SELECT
  service_name,
  count(*) AS requests,
  sum(CASE WHEN span_status_code = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END) AS errors,
  approx_percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_nano) / 1e6 AS p95_ms
FROM opentelemetry_traces
WHERE "timestamp" > now() - INTERVAL '15 minutes'
  AND span_kind = 'SPAN_KIND_SERVER'
  AND "resource_attributes.service.namespace" = 'opentelemetry-demo'
GROUP BY service_name
ORDER BY requests DESC;`

export const TOUR_PROMQL_QUERY =
  '100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{job="node",mode="idle"}[5m])))'

export const TOUR_TQL_QUERY = `TQL EVAL (now() - '30 minutes'::interval, now(), '1m')
  ${TOUR_PROMQL_QUERY};`

export const TOUR_LOGS_BUILDER_FORM = {
  table: 'opentelemetry_logs',
  tsColumn: { name: 'timestamp' },
  conditions: [
    {
      field: 'severity_number',
      operator: '>=',
      value: 17,
      relation: 'AND',
      fieldType: 'Number',
    },
  ],
  orderByField: 'timestamp',
  orderBy: 'DESC',
  limit: 1000,
}

export const TOUR_TRACES_BUILDER_FORM = {
  table: 'opentelemetry_traces',
  tsColumn: { name: 'timestamp' },
  conditions: [
    // Demo topology: `frontend` spans sit under frontend-proxy/web, so parent_span_id is
    // almost never NULL. Keep service + ERROR — that returns live failed requests.
    { field: 'service_name', operator: '=', value: 'frontend', relation: 'AND', fieldType: 'String' },
    {
      field: 'span_status_code',
      operator: '=',
      value: 'STATUS_CODE_ERROR',
      relation: 'AND',
      fieldType: 'String',
    },
  ],
  orderByField: 'duration_nano',
  orderBy: 'DESC',
  limit: 1000,
}

export interface TourPresetSummary {
  table: string
  filters: string[]
  sort: string
  limit: number
  timeRangeKey: string
}

/** Case entry inside Signals Explore — switches signal; shares topbar time/filters. */
export type TourExploreCaseId = 'metrics' | 'logs' | 'traces'

export interface TourExploreCase {
  id: TourExploreCaseId
  titleKey: string
  detailKey: string
  /** Signal-specific query deltas (no timeLength — shared with the hub step). */
  query: Record<string, string>
}

export interface TourStep {
  id: TourStepId
  /** Flat i18n key under `tour.steps.<id>` namespace. */
  nameKey: string
  titleKey: string
  icon: string
  /** Route base match by route name. */
  baseRouteName: string
  /** Exact match on top of the base (used to split /dashboard/query SQL vs TQL). */
  matchesExact?: (route: { name?: unknown; query: LocationQuery }) => boolean
  display: TourStepDisplay
  /** Raw code shown in `View query` (code display). */
  code?: string
  /** Builder form JSON (preset display). */
  builderForm?: unknown
  /** Human-readable preset rows (preset display). */
  preset?: TourPresetSummary
  /** Hub cases for Signals Explore (optional). */
  cases?: TourExploreCase[]
  /** Primary GreptimeDB documentation page for the capability. */
  docsPath: string
  /** Route + query the tile navigates to. */
  location: { path: string; query: Record<string, string> }
}

/** Shared time window for Signals Explore hub + cases (topbar time is cross-tab). */
export const TOUR_EXPLORE_TIME_LENGTH = '30'

const QUERY_PATH = '/dashboard/query'
const LOGS_BUILDER_FORM_JSON = JSON.stringify(TOUR_LOGS_BUILDER_FORM)
const TRACES_BUILDER_FORM_JSON = JSON.stringify(TOUR_TRACES_BUILDER_FORM)

const sqlExact = (expected: string) => (route: { name?: unknown; query: LocationQuery }) => {
  const raw = route.query.sql
  if (typeof raw !== 'string' || !raw) return false
  return decodeMaybeEncoded(raw).trim() === expected.trim()
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'signals-explore',
    nameKey: 'tour.steps.signals-explore.name',
    titleKey: 'tour.steps.signals-explore.title',
    icon: 'query',
    baseRouteName: 'explore',
    display: 'where',
    docsPath: '/user-guide/concepts/why-greptimedb/#why-one-engine-for-three-signals',
    cases: [
      {
        id: 'metrics',
        titleKey: 'tour.steps.signals-explore.cases.metrics.title',
        detailKey: 'tour.steps.signals-explore.cases.metrics.detail',
        query: { signal: 'metrics' },
      },
      {
        id: 'logs',
        titleKey: 'tour.steps.signals-explore.cases.logs.title',
        detailKey: 'tour.steps.signals-explore.cases.logs.detail',
        query: { signal: 'logs', logsTable: 'opentelemetry_logs' },
      },
      {
        id: 'traces',
        titleKey: 'tour.steps.signals-explore.cases.traces.title',
        detailKey: 'tour.steps.signals-explore.cases.traces.detail',
        query: { signal: 'traces' },
      },
    ],
    location: {
      path: '/dashboard/explore',
      // Hub lands on Metrics; cases switch signal while keeping shared time/filters.
      query: { signal: 'metrics', timeLength: TOUR_EXPLORE_TIME_LENGTH },
    },
  },
  {
    id: 'sql',
    nameKey: 'tour.steps.sql.name',
    titleKey: 'tour.steps.sql.title',
    icon: 'table',
    baseRouteName: 'query',
    matchesExact: sqlExact(TOUR_SQL_QUERY),
    display: 'code',
    code: TOUR_SQL_QUERY,
    docsPath: '/user-guide/query-data/sql/',
    location: { path: QUERY_PATH, query: { sql: encodeURIComponent(TOUR_SQL_QUERY) } },
  },
  {
    id: 'promql',
    nameKey: 'tour.steps.promql.name',
    titleKey: 'tour.steps.promql.title',
    icon: 'metric',
    baseRouteName: 'metrics',
    display: 'code',
    code: TOUR_PROMQL_QUERY,
    docsPath: '/user-guide/query-data/promql/',
    location: {
      path: '/dashboard/metrics-query',
      query: {
        promql: encodeURIComponent(TOUR_PROMQL_QUERY),
        timeLength: '30',
        stepType: 'medium',
        tab: 'graph',
      },
    },
  },
  {
    id: 'tql',
    nameKey: 'tour.steps.tql.name',
    titleKey: 'tour.steps.tql.title',
    icon: 'table',
    baseRouteName: 'query',
    matchesExact: sqlExact(TOUR_TQL_QUERY),
    display: 'code',
    code: TOUR_TQL_QUERY,
    docsPath: '/reference/sql/tql/',
    location: { path: QUERY_PATH, query: { sql: encodeURIComponent(TOUR_TQL_QUERY) } },
  },
  {
    id: 'logs',
    nameKey: 'tour.steps.logs.name',
    titleKey: 'tour.steps.logs.title',
    icon: 'Icon5',
    baseRouteName: 'log-query',
    display: 'preset',
    builderForm: TOUR_LOGS_BUILDER_FORM,
    docsPath: '/user-guide/logs/overview/',
    preset: {
      table: 'opentelemetry_logs',
      filters: ['severity_number >= 17'],
      sort: 'timestamp DESC',
      limit: 1000,
      timeRangeKey: 'tour.presets.last1Hour',
    },
    location: {
      path: '/dashboard/logs-query',
      query: {
        editorType: 'builder',
        timeLength: '60',
        builderForm: encodeURIComponent(LOGS_BUILDER_FORM_JSON),
      },
    },
  },
  {
    id: 'traces',
    nameKey: 'tour.steps.traces.name',
    titleKey: 'tour.steps.traces.title',
    icon: 'Icon7',
    baseRouteName: 'trace-query',
    display: 'preset',
    builderForm: TOUR_TRACES_BUILDER_FORM,
    docsPath: '/user-guide/traces/read-write/',
    preset: {
      table: 'opentelemetry_traces',
      filters: ['service_name = frontend', 'span_status_code = STATUS_CODE_ERROR'],
      sort: 'duration_nano DESC',
      limit: 1000,
      timeRangeKey: 'tour.presets.last1Hour',
    },
    location: {
      path: '/dashboard/traces',
      query: {
        editorType: 'builder',
        timeLength: '60',
        builderForm: encodeURIComponent(TRACES_BUILDER_FORM_JSON),
      },
    },
  },
  {
    id: 'visualization',
    nameKey: 'tour.steps.visualization.name',
    titleKey: 'tour.steps.visualization.title',
    icon: 'visualize',
    baseRouteName: 'perses',
    display: 'where',
    docsPath: '/getting-started/installation/greptimedb-dashboard/',
    location: {
      path: '/dashboard/perses',
      query: { dashboard: 'astronomy-shop-overview' },
    },
  },
]

export const TOUR_STEP_IDS: TourStepId[] = TOUR_STEPS.map((step) => step.id)

export function isTourStepId(value: unknown): value is TourStepId {
  return typeof value === 'string' && TOUR_STEP_IDS.includes(value as TourStepId)
}

export function getTourStep(id: TourStepId): TourStep {
  const step = TOUR_STEPS.find((item) => item.id === id)
  if (!step) throw new Error(`Unknown tour step: ${id}`)
  return step
}

/** Query payload keys that sync/run an example — omitted when only browsing a step. */
const TOUR_PAYLOAD_QUERY_KEYS = new Set(['sql', 'promql', 'builderForm', 'tourApply', 'queryId'])

/** Browse-only query: keep page context (tab, timeLength, …), drop fill/run payloads. */
export function getTourBrowseQuery(step: TourStep): Record<string, string> {
  return Object.fromEntries(Object.entries(step.location.query).filter(([key]) => !TOUR_PAYLOAD_QUERY_KEYS.has(key)))
}

/** Shared explore topbar keys — preserved when switching cases. */
const TOUR_EXPLORE_SHARED_QUERY_KEYS = ['timeLength', 'timeRange', 'filters'] as const

/**
 * Build explore URL query for a hub case: keep current time/filters, apply case signal deltas.
 * Falls back to the step default timeLength when the route has no time yet.
 */
export function getTourExploreCaseQuery(
  step: TourStep,
  caseId: TourExploreCaseId,
  currentQuery: LocationQuery
): Record<string, string> | null {
  const exploreCase = step.cases?.find((item) => item.id === caseId)
  if (!exploreCase) return null

  const shared: Record<string, string> = {}
  TOUR_EXPLORE_SHARED_QUERY_KEYS.forEach((key) => {
    const raw = currentQuery[key]
    const value = Array.isArray(raw) ? raw[0] : raw
    if (typeof value === 'string' && value) {
      shared[key] = value
    }
  })
  if (!shared.timeLength && !shared.timeRange) {
    shared.timeLength = step.location.query.timeLength || TOUR_EXPLORE_TIME_LENGTH
  }

  return { ...shared, ...exploreCase.query }
}

/**
 * Route → step resolution:
 * 1. exact match wins (splits /dashboard/query SQL vs TQL);
 * 2. otherwise the active step is kept when its base route still matches;
 * 3. otherwise the first base-matching step wins.
 */
export function matchTourStepFromRoute(
  route: { name?: unknown; query: LocationQuery },
  activeStepId?: TourStepId | null
): TourStepId | null {
  const routeName = typeof route.name === 'string' ? route.name : ''
  const exact = TOUR_STEPS.find((step) => step.matchesExact?.(route))
  if (exact) return exact.id

  const baseMatches = TOUR_STEPS.filter((step) => step.baseRouteName === routeName)
  if (!baseMatches.length) return null
  if (activeStepId && baseMatches.some((step) => step.id === activeStepId)) {
    return activeStepId
  }
  return baseMatches[0].id
}
