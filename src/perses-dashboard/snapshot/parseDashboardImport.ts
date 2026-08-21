import type { DashboardResource } from '@perses-dev/core'
import {
  annotateDashboardCategory,
  DASHBOARD_CATEGORY_ANNOTATION,
  DASHBOARD_CATEGORY_DASHBOARD,
  DASHBOARD_CATEGORY_SNAPSHOT,
  type DashboardCategory,
} from './dashboardCategory'
import {
  EMBEDDED_SNAPSHOT_LOG_KIND,
  EMBEDDED_SNAPSHOT_TIME_SERIES_KIND,
  EMBEDDED_SNAPSHOT_TRACE_KIND,
  SNAPSHOT_VERSION,
  type SnapshotDashboardResource,
  type SnapshotEmbed,
} from './types'

const EMBEDDED_SNAPSHOT_KINDS = new Set([
  EMBEDDED_SNAPSHOT_TIME_SERIES_KIND,
  EMBEDDED_SNAPSHOT_LOG_KIND,
  EMBEDDED_SNAPSHOT_TRACE_KIND,
])

const MAX_UNWRAP_DEPTH = 5

export type ImportParseErrorCode =
  | 'invalid_json'
  | 'invalid_kind'
  | 'missing_spec'
  | 'missing_name'
  | 'embedded_without_snapshot'

export type ImportParseWarningCode = 'empty_panel_data' | 'skipped_panel_data'

export interface ImportParseSuccess {
  ok: true
  dashboard: DashboardResource
  category: DashboardCategory
  panelCount: number
  warnings: ImportParseWarningCode[]
}

export interface ImportParseFailure {
  ok: false
  errors: ImportParseErrorCode[]
}

export type ImportParseResult = ImportParseSuccess | ImportParseFailure

export interface ParseDashboardImportOptions {
  nameOverride?: string
  defaultName?: string
}

function stripJsonExtension(name: string): string {
  return name.endsWith('.json') ? name.slice(0, -5) : name
}

function tryParseJsonString(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>
    }
  } catch {
    // fall through
  }
  return null
}

function unwrapDashboardPayload(input: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > MAX_UNWRAP_DEPTH) return null

  let parsed: Record<string, unknown> | null = null
  if (typeof input === 'string') {
    parsed = tryParseJsonString(input)
  } else if (input && typeof input === 'object') {
    parsed = input as Record<string, unknown>
  }

  if (!parsed) return null

  if (parsed.kind === 'Dashboard') {
    return parsed
  }

  if (parsed.kind === 'PersesDashboard' && parsed.spec && typeof parsed.spec === 'object') {
    const crSpec = parsed.spec as { config?: Record<string, unknown> }
    if (crSpec.config && typeof crSpec.config === 'object') {
      const metadata = parsed.metadata as { name?: string; namespace?: string } | undefined
      return {
        kind: 'Dashboard',
        metadata: {
          name: metadata?.name ?? 'imported-dashboard',
          project: metadata?.namespace ?? 'default',
          version: 0,
        },
        spec: crSpec.config,
      }
    }
  }

  if (typeof parsed.content === 'string') {
    const inner = unwrapDashboardPayload(parsed.content, depth + 1)
    if (inner) return inner
  }

  if (parsed.definition) {
    const inner = unwrapDashboardPayload(parsed.definition, depth + 1)
    if (inner) return inner
  }

  if (parsed.dashboard && typeof parsed.dashboard === 'object') {
    const inner = unwrapDashboardPayload(parsed.dashboard, depth + 1)
    if (inner) return inner
  }

  return null
}

export function getDashboardNameFromParsed(dashboard: Record<string, unknown>): string | null {
  const metadata = dashboard.metadata as { name?: string } | undefined
  if (typeof metadata?.name === 'string') {
    const name = metadata.name.trim()
    if (name) return stripJsonExtension(name)
  }

  const spec = dashboard.spec as { display?: { name?: string } } | undefined
  if (typeof spec?.display?.name === 'string') {
    const name = spec.display.name.trim()
    if (name) return stripJsonExtension(name)
  }

  return null
}

function hasEmbeddedSnapshotQueries(dashboard: Record<string, unknown>): boolean {
  const panels = (dashboard.spec as { panels?: Record<string, { spec?: { queries?: unknown[] } }> } | undefined)?.panels
  if (!panels) return false

  return Object.values(panels).some((panel) => {
    const queries = panel?.spec?.queries
    if (!Array.isArray(queries)) return false
    return queries.some((queryDef) => {
      const kind = (queryDef as { spec?: { plugin?: { kind?: string } } })?.spec?.plugin?.kind
      return typeof kind === 'string' && EMBEDDED_SNAPSHOT_KINDS.has(kind)
    })
  })
}

function hasSnapshotAnnotation(dashboard: Record<string, unknown>): boolean {
  const annotations = (dashboard.metadata as { annotations?: Record<string, string> } | undefined)?.annotations
  return annotations?.[DASHBOARD_CATEGORY_ANNOTATION] === DASHBOARD_CATEGORY_SNAPSHOT
}

function getSnapshotEmbedRaw(dashboard: Record<string, unknown>): Record<string, unknown> | undefined {
  const snapshot = (dashboard.spec as { snapshot?: unknown } | undefined)?.snapshot
  if (!snapshot || typeof snapshot !== 'object') return undefined
  return snapshot as Record<string, unknown>
}

function hasSnapshotEmbedContent(embed: Record<string, unknown>): boolean {
  return Boolean(embed.panelData || embed.timeRange || embed.capturedAt || embed.variables)
}

function isValidSnapshotVersion(version: unknown): boolean {
  return version === SNAPSHOT_VERSION || version === '1'
}

function isImportableSnapshot(dashboard: Record<string, unknown>): boolean {
  if (hasSnapshotAnnotation(dashboard)) return true

  const embed = getSnapshotEmbedRaw(dashboard)
  if (!embed) return false

  if (isValidSnapshotVersion(embed.version)) return true
  if (hasSnapshotEmbedContent(embed)) return true

  return hasEmbeddedSnapshotQueries(dashboard)
}

function normalizeSnapshotEmbed(dashboard: Record<string, unknown>): void {
  const spec = dashboard.spec as SnapshotDashboardResource['spec']
  const existing = getSnapshotEmbedRaw(dashboard)

  const panelData =
    existing?.panelData && typeof existing.panelData === 'object'
      ? (existing.panelData as SnapshotEmbed['panelData'])
      : {}
  const variables =
    existing?.variables && typeof existing.variables === 'object'
      ? (existing.variables as SnapshotEmbed['variables'])
      : {}
  const timeRange =
    existing?.timeRange && typeof existing.timeRange === 'object'
      ? (existing.timeRange as SnapshotEmbed['timeRange'])
      : {}

  spec.snapshot = {
    version: SNAPSHOT_VERSION,
    capturedAt: typeof existing?.capturedAt === 'string' ? existing.capturedAt : new Date().toISOString(),
    sourceDashboard: typeof existing?.sourceDashboard === 'string' ? existing.sourceDashboard : undefined,
    timeRange,
    variables,
    panelData,
  }
}

function countPanels(dashboard: Record<string, unknown>): number {
  const panels = (dashboard.spec as { panels?: Record<string, unknown> } | undefined)?.panels
  return panels ? Object.keys(panels).length : 0
}

function collectSnapshotWarnings(dashboard: SnapshotDashboardResource): ImportParseWarningCode[] {
  const warnings: ImportParseWarningCode[] = []
  const snapshot = dashboard.spec?.snapshot
  if (!snapshot) return warnings

  const panelData = snapshot.panelData ?? {}
  const panelIds = Object.keys(panelData)
  if (panelIds.length === 0) {
    warnings.push('empty_panel_data')
    return warnings
  }

  const hasSkipped = panelIds.some((panelId) => (panelData[panelId] ?? []).some((entry) => entry.skipped))
  if (hasSkipped) {
    warnings.push('skipped_panel_data')
  }

  return warnings
}

function applyDashboardName(dashboard: DashboardResource, saveName: string): DashboardResource {
  const next = structuredClone(dashboard) as DashboardResource
  const normalizedName = stripJsonExtension(saveName)

  next.metadata = {
    ...(next.metadata ?? { project: 'default' }),
    name: normalizedName,
    version: 0,
  }

  if (next.spec?.display) {
    next.spec.display.name = normalizedName
  } else if (next.spec) {
    next.spec.display = { name: normalizedName }
  }

  return next
}

export function parseDashboardImport(raw: string, options: ParseDashboardImportOptions = {}): ImportParseResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, errors: ['invalid_json'] }
  }

  const parsed = unwrapDashboardPayload(trimmed)
  if (!parsed) {
    return { ok: false, errors: ['invalid_json'] }
  }

  if (parsed.kind !== 'Dashboard') {
    return { ok: false, errors: ['invalid_kind'] }
  }

  if (!parsed.spec || typeof parsed.spec !== 'object') {
    return { ok: false, errors: ['missing_spec'] }
  }

  const embeddedQueries = hasEmbeddedSnapshotQueries(parsed)
  const importableSnapshot = isImportableSnapshot(parsed)

  if (embeddedQueries && !importableSnapshot) {
    return { ok: false, errors: ['embedded_without_snapshot'] }
  }

  if (importableSnapshot) {
    normalizeSnapshotEmbed(parsed)
  }

  const resolvedName =
    options.nameOverride?.trim() || getDashboardNameFromParsed(parsed) || options.defaultName?.trim() || ''

  if (!resolvedName) {
    return { ok: false, errors: ['missing_name'] }
  }

  let dashboard = applyDashboardName(parsed as DashboardResource, resolvedName)
  const category = importableSnapshot ? DASHBOARD_CATEGORY_SNAPSHOT : DASHBOARD_CATEGORY_DASHBOARD
  dashboard = annotateDashboardCategory(dashboard, category) as DashboardResource

  const warnings = importableSnapshot ? collectSnapshotWarnings(dashboard as SnapshotDashboardResource) : []

  return {
    ok: true,
    dashboard,
    category,
    panelCount: countPanels(parsed),
    warnings,
  }
}
