import { isStructuralEntityType, isStructuralRelType } from '@/observability/traces/service-map-queries'
import {
  buildServiceMapNodeSymbolDataUrl,
  escapeHtml,
  formatServiceMapCompactPercent,
  formatServiceMapCompactRate,
  healthFromEdge,
  healthFromNodeCallStats,
  isCallEdge,
  mapTrafficToSymbolSize,
  nodeDisplayCallStats,
  nodeFlowSummary,
  nodeUnmatchedCount,
  type ServiceMapFlowSummary,
} from '@/observability/adapters/service-map/metrics'
import type {
  ServiceMapDisplayNode,
  ServiceMapEdge,
  ServiceMapNodeCallStats,
  ServiceMapNodeHealth,
  ServiceMapNodeLayout,
} from '@/observability/adapters/service-map/types'
import { withAlpha, type ServiceMapTheme } from './chart-theme'

export interface ServiceMapChartInput {
  nodes: ServiceMapDisplayNode[]
  edges: ServiceMapEdge[]
  layout: Map<string, ServiceMapNodeLayout>
  stats: Map<string, ServiceMapNodeCallStats>
  trafficRange: { min: number; max: number }
  theme: ServiceMapTheme
  isDark: boolean
  /** Length of the queried window in seconds (≥ 1); read lazily so tooltips see the current range. */
  rangeSeconds: () => number
}

export interface ServiceMapTooltipContext {
  t: (key: string, named?: Record<string, unknown>) => string
  /** Label for any node key, including keys hidden from the display graph. */
  labelFor: (key: string) => string
}

function healthBorderColor(theme: ServiceMapTheme, health: ServiceMapNodeHealth): string {
  if (health === 'critical') return theme.danger
  if (health === 'warning') return theme.warn
  if (health === 'ok') return theme.ok
  // low-traffic / no-data — never green
  return theme.edge
}

/** Soften edge chroma by default; full saturation when the edge is in the active flow. */
function edgeStrokeColor(theme: ServiceMapTheme, edge: ServiceMapEdge, emphasize = false): string {
  if (isStructuralRelType(edge.relType || 'calls')) {
    return emphasize ? theme.structural : withAlpha(theme.structural, 0.85)
  }
  if (edge.declared) {
    return emphasize ? theme.structural : withAlpha(theme.structural, 0.75)
  }
  const health = healthFromEdge(edge)
  if (health === 'critical') {
    return emphasize ? theme.danger : withAlpha(theme.danger, 0.55)
  }
  if (health === 'warning') {
    return emphasize ? theme.warn : withAlpha(theme.warn, 0.55)
  }
  if (health === 'low-traffic' || health === 'no-data') {
    return emphasize ? theme.external : withAlpha(theme.external, 0.65)
  }
  return theme.edge
}

function isStructuralSatellite(node: ServiceMapDisplayNode): boolean {
  return !node.virtual && !node.members && isStructuralEntityType(node.type)
}

/** Build graph series. activeKey dims unrelated nodes/edges for node-hover flow. */
export function buildServiceMapSeries(input: ServiceMapChartInput, activeKey = '') {
  const { theme, layout, stats, isDark } = input
  const trafficMin = input.trafficRange.min
  const trafficMax = input.trafficRange.max
  // Grafana-style: title under the node, no chip — pills competed with the glyphs.
  const nodes = input.nodes.map((node) => {
    const isActive = activeKey === node.key
    const connectedToActive = input.edges.some(
      (edge) =>
        (edge.source === activeKey && edge.target === node.key) ||
        (edge.target === activeKey && edge.source === node.key)
    )
    // Active + neighbors stay fully opaque; only the rest of the graph dims.
    let opacity = 1
    if (activeKey && !isActive && !connectedToActive) opacity = 0.22
    const serviceColor = theme.palette[0]
    const isDatabase = node.virtual && node.connectionType === 'database'
    const isSatellite = isStructuralSatellite(node)
    const isInstance = isSatellite && (node.type === 'service.instance' || node.type === 'k8s.pod')
    const nodeStats = stats.get(node.key)
    let symbolSize = mapTrafficToSymbolSize(nodeStats?.traffic ?? 0, trafficMin, trafficMax, {
      virtual: node.virtual,
      cluster: Boolean(node.members),
    })
    if (isSatellite) symbolSize = isInstance ? 22 : 18
    const isServiceGlyph = !node.virtual && !node.members && !isSatellite
    let symbol: string = node.members || node.virtual ? 'roundRect' : 'circle'
    if (isInstance) symbol = 'diamond'
    else if (isSatellite) symbol = 'roundRect'
    let health: ServiceMapNodeHealth = 'no-data'
    if (!node.virtual && !isServiceGlyph && !isSatellite && nodeStats) health = healthFromNodeCallStats(nodeStats)
    let itemStyle: Record<string, string | number> = {
      color: serviceColor.fill,
      borderColor: healthBorderColor(theme, health),
      borderWidth: isActive || node.members ? 2.5 : 2,
      opacity,
    }
    if (isServiceGlyph) {
      const display = nodeDisplayCallStats(
        nodeStats ?? {
          traffic: 0,
          requests: 0,
          errors: 0,
          inRequests: 0,
          inErrors: 0,
          outRequests: 0,
          outErrors: 0,
        }
      )
      const rate = display.requests / input.rangeSeconds()
      const glyphHealth = nodeStats ? healthFromNodeCallStats(nodeStats) : ('no-data' as ServiceMapNodeHealth)
      symbol = buildServiceMapNodeSymbolDataUrl({
        size: symbolSize,
        fill: serviceColor.fill,
        okColor: theme.ok,
        dangerColor: glyphHealth === 'warning' ? theme.warn : theme.danger,
        trackColor: theme.edge,
        textColor: theme.text,
        errorRatio: display.errorRatio,
        mainStat: formatServiceMapCompactRate(rate),
        secondaryStat: formatServiceMapCompactPercent(display.errorRatio),
        emphasized: isActive,
        health: glyphHealth,
      })
      itemStyle = { opacity, borderWidth: 0, color: 'transparent' }
    } else if (isSatellite) {
      const satelliteColor = isInstance ? theme.instance : theme.container
      itemStyle = {
        color: withAlpha(satelliteColor, isDark ? 0.28 : 0.14),
        borderColor: satelliteColor,
        borderWidth: isActive ? 2 : 1.5,
        borderType: 'dashed',
        opacity,
      }
    } else if (isDatabase) {
      itemStyle = {
        color: withAlpha(theme.database, isDark ? 0.22 : 0.12),
        borderColor: theme.database,
        borderWidth: isActive ? 2 : 1.5,
        borderType: 'dashed',
        opacity,
      }
    } else if (node.virtual) {
      itemStyle = {
        color: withAlpha(theme.external, isDark ? 0.2 : 0.1),
        borderColor: theme.external,
        borderWidth: isActive ? 2 : 1.5,
        borderType: 'dashed',
        opacity,
      }
    }
    return {
      id: node.key,
      name: node.label,
      nodeKey: node.key,
      x: layout.get(node.key)?.x,
      y: layout.get(node.key)?.y,
      entityType: node.type,
      virtual: node.virtual,
      connectionType: node.connectionType,
      isCluster: Boolean(node.members),
      symbol,
      symbolSize,
      itemStyle,
      label: {
        show: true,
        position: 'bottom',
        distance: isServiceGlyph ? 10 : 8,
        formatter: node.label,
        color: theme.text,
        opacity,
        // Name is primary identity — heavier than on-disk rates.
        fontSize: isActive ? 13 : 12,
        fontWeight: isActive ? 600 : 500,
        lineHeight: 16,
        // Max width only — short names stay natural; long names wrap.
        width: 128,
        overflow: 'break',
        // Draw above edges so titles stay readable when lines cross.
        z2: 10,
      },
    }
  })
  const links = input.edges.map((edge) => {
    const structural = isStructuralRelType(edge.relType || 'calls')
    const declared = Boolean(edge.declared)
    const callLike = isCallEdge(edge)
    const isFlowing = Boolean(activeKey) && (activeKey === edge.source || activeKey === edge.target)
    const traffic = Math.max(edge.requests, edge.unmatched)
    const unmatchedOnly = callLike && edge.requests === 0 && edge.unmatched > 0
    const sourceCommunity = layout.get(edge.source)?.community
    const targetCommunity = layout.get(edge.target)?.community
    const sameGroup =
      sourceCommunity !== undefined && targetCommunity !== undefined && sourceCommunity === targetCommunity
    // Cross-heap edges stay quieter so communities read first, but stay visible on light panels.
    let opacity = 0.42
    if (structural || declared) opacity = 0.7
    else if (sameGroup) opacity = 0.72
    if (unmatchedOnly) opacity = 0.5
    if (activeKey) opacity = isFlowing ? 1 : 0.12
    // Keep curveness stable under node-hover flow — changing it jumps the edge path.
    let curveness = 0.16
    if (structural || declared) curveness = 0.08
    else if (sameGroup) curveness = 0.03
    let width = structural || declared ? 1.15 : 1 + Math.min(1.1, Math.log2(traffic + 1) * 0.18)
    if (callLike && sameGroup) width = 1.25 + Math.min(1.35, Math.log2(traffic + 1) * 0.24)
    if (isFlowing) width = structural || declared ? 1.8 : 2.2
    let arrowSize = 9
    if (isFlowing) arrowSize = 11
    else if (structural || declared) arrowSize = 8
    let lineType = 'solid'
    if (declared) lineType = 'dotted'
    else if (structural || isFlowing || unmatchedOnly) lineType = 'dashed'
    return {
      id: edge.key,
      source: edge.source,
      target: edge.target,
      edgeKey: edge.key,
      relType: edge.relType || 'calls',
      value: traffic,
      // Non-none fromSymbol is required for ECharts adjustEdge to clip at the source border
      // (otherwise lines leave the node center and look reverse-directed).
      symbol: ['circle', 'arrow'],
      symbolSize: [0, arrowSize],
      lineStyle: {
        width,
        color: edgeStrokeColor(theme, edge, isFlowing),
        opacity,
        curveness,
        type: lineType,
      },
    }
  })
  return { nodes, links }
}

function formatRequests(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)
}
function formatPercent(value: number): string {
  return new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 }).format(value)
}
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  return seconds < 1
    ? `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(seconds * 1000)} ms`
    : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(seconds)} s`
}

interface TooltipParams {
  dataType?: string
  data?: { edgeKey?: string; nodeKey?: string }
}

export function buildServiceMapTooltipFormatter(input: ServiceMapChartInput, context: ServiceMapTooltipContext) {
  const { t, labelFor } = context
  const nodeMap = new Map(input.nodes.map((node) => [node.key, node]))
  const formatCallRate = (count: number) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(count / input.rangeSeconds())
  const formatDirection = (title: string, summary: ServiceMapFlowSummary): string[] => {
    const errorRatio = summary.requests ? summary.errors / summary.requests : 0
    const averageDuration = summary.durationCount ? summary.durationSum / summary.durationCount : 0
    return [
      `<strong>${escapeHtml(title)}</strong>`,
      `${escapeHtml(t('drilldown.serviceMap.requestRate'))}: ${escapeHtml(formatCallRate(summary.requests))} req/s`,
      `${escapeHtml(t('drilldown.serviceMap.errorRate'))}: ${escapeHtml(formatPercent(errorRatio))}`,
      `${escapeHtml(t('drilldown.serviceMap.avgDuration'))}: ${escapeHtml(formatDuration(averageDuration))}`,
      summary.unmatched > 0
        ? `${escapeHtml(t('drilldown.serviceMap.unmatched'))}: ${escapeHtml(formatCallRate(summary.unmatched))} call/s`
        : '',
    ].filter(Boolean)
  }

  return (params: TooltipParams): string => {
    if (params.dataType === 'edge' && params.data?.edgeKey) {
      const edge = input.edges.find((item) => item.key === params.data?.edgeKey)
      if (!edge) return ''
      const relType = edge.relType || 'calls'
      if (isStructuralRelType(relType) || edge.declared) {
        let relationLabel = relType
        if (relType === 'part_of') relationLabel = t('drilldown.serviceMap.relPartOf')
        else if (relType === 'runs_on') relationLabel = t('drilldown.serviceMap.relRunsOn')
        else if (relType === 'depends_on') relationLabel = t('drilldown.serviceMap.relDependsOn')
        else if (relType === 'owns') relationLabel = t('drilldown.serviceMap.relOwns')
        return [
          `<strong>${escapeHtml(labelFor(edge.source))} → ${escapeHtml(labelFor(edge.target))}</strong>`,
          escapeHtml(relationLabel),
          `${escapeHtml(t('drilldown.serviceMap.provenance'))}: ${escapeHtml(String(edge.provenance || 'declared'))}`,
          edge.declared || !edge.hasTelemetry ? escapeHtml(t('drilldown.serviceMap.noTelemetry')) : '',
        ]
          .filter(Boolean)
          .join('<br/>')
      }
      const health = healthFromEdge(edge)
      const errorRate = edge.requests > 0 ? edge.errors / edge.requests : 0
      const avgDuration = edge.durationCount > 0 ? edge.durationSum / edge.durationCount : 0
      return [
        `<strong>${escapeHtml(labelFor(edge.source))} → ${escapeHtml(labelFor(edge.target))}</strong>`,
        `${escapeHtml(t('drilldown.serviceMap.healthStatus'))}: ${escapeHtml(
          t(`drilldown.serviceMap.health.${health}`)
        )}`,
        `${escapeHtml(t('drilldown.serviceMap.provenance'))}: ${escapeHtml(String(edge.provenance || 'trace'))}`,
        edge.mixedScope ? escapeHtml(t('drilldown.serviceMap.mixedScopeHint')) : '',
        `${escapeHtml(t('drilldown.serviceMap.requests'))}: ${escapeHtml(formatRequests(edge.requests))}`,
        `${escapeHtml(t('drilldown.serviceMap.errors'))}: ${escapeHtml(formatRequests(edge.errors))}`,
        `${escapeHtml(t('drilldown.serviceMap.errorRate'))}: ${escapeHtml(formatPercent(errorRate))}`,
        `${escapeHtml(t('drilldown.serviceMap.avgDuration'))}: ${escapeHtml(formatDuration(avgDuration))}`,
        `${escapeHtml(t('drilldown.serviceMap.maxDuration'))}: ${escapeHtml(formatDuration(edge.durationMax))}`,
        edge.unmatched > 0
          ? `${escapeHtml(t('drilldown.serviceMap.unmatched'))}: ${escapeHtml(formatRequests(edge.unmatched))}`
          : '',
      ]
        .filter(Boolean)
        .join('<br/>')
    }
    const node = params.data?.nodeKey ? nodeMap.get(params.data.nodeKey) : undefined
    if (!node) return ''
    if (node.cluster) {
      return `<strong>${escapeHtml(node.label)}</strong><br/>${escapeHtml(t('drilldown.serviceMap.clickToExpand'))}`
    }
    if (isStructuralSatellite(node)) {
      let typeLabel = node.type
      if (node.type === 'service.instance' || node.type === 'k8s.pod') {
        typeLabel = t('drilldown.serviceMap.instanceNode')
      } else if (node.type === 'container' || node.type === 'k8s.container') {
        typeLabel = t('drilldown.serviceMap.containerNode')
      }
      return [
        `<strong>${escapeHtml(node.label)}</strong>`,
        `${escapeHtml(t('drilldown.serviceMap.endpointKind'))}: ${escapeHtml(typeLabel)}`,
      ].join('<br/>')
    }
    if (node.virtual) {
      const unmatched = nodeUnmatchedCount(input.edges, node.key)
      const isDatabase = node.connectionType === 'database'
      return [
        `<strong>${escapeHtml(node.label)}</strong>`,
        `${escapeHtml(t('drilldown.serviceMap.endpointKind'))}: ${escapeHtml(
          t(isDatabase ? 'drilldown.serviceMap.databaseEndpoint' : 'drilldown.serviceMap.virtualEndpoint')
        )}`,
        `${escapeHtml(t('drilldown.serviceMap.unmatchedCallRate'))}: ${escapeHtml(formatCallRate(unmatched))} call/s`,
        escapeHtml(t(isDatabase ? 'drilldown.serviceMap.databaseNodeHint' : 'drilldown.serviceMap.virtualNodeHint')),
      ].join('<br/>')
    }
    const instanceCount = node.service?.instanceCount ?? 0
    const incoming = nodeFlowSummary(input.edges, node.key, 'incoming')
    const outgoing = nodeFlowSummary(input.edges, node.key, 'outgoing')
    return [
      `<strong>${escapeHtml(node.label)}</strong>`,
      instanceCount ? escapeHtml(t('drilldown.serviceMap.instanceCount', { count: instanceCount })) : '',
      ...formatDirection(t('drilldown.serviceMap.incomingFlow'), incoming),
      ...formatDirection(t('drilldown.serviceMap.outgoingFlow'), outgoing),
    ]
      .filter(Boolean)
      .join('<br/>')
  }
}

/**
 * Base option must NOT depend on the hovered node — rebuilding the option while the pointer
 * is over a graphic remounts it and drops mouseout (edge hover stuck). Node flow is patched
 * via setOption with buildServiceMapSeries(input, hoveredKey) instead.
 */
export function buildServiceMapChartOption(input: ServiceMapChartInput, context: ServiceMapTooltipContext) {
  const { nodes, links } = buildServiceMapSeries(input, '')
  const { theme } = input
  return {
    animation: false,
    tooltip: {
      trigger: 'item',
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      textStyle: { color: theme.text },
      formatter: buildServiceMapTooltipFormatter(input, context),
    },
    series: [
      {
        type: 'graph',
        layout: 'none',
        data: nodes,
        links,
        roam: true,
        scaleLimit: { min: 0.4, max: 4 },
        // Keep on-disk SVG stats (and symbol size) stable under roam/detail zoom.
        // Default 0.6 shrinks inner fonts when layoutNaturalZoom < 1.
        nodeScaleRatio: 0,
        draggable: false,
        edgeSymbol: ['circle', 'arrow'],
        edgeSymbolSize: [0, 8],
        label: { show: true, color: theme.text, fontSize: 12 },
        // Drop colliding titles rather than stacking glyphs on top of each other.
        labelLayout: { hideOverlap: true },
        lineStyle: { opacity: 0.56, width: 1 },
        // Edge hover highlight via ECharts (must not rebuild option, or mouseout is lost).
        // focus:none keeps the rest of the graph unchanged.
        emphasis: {
          focus: 'none',
          scale: false,
          lineStyle: { width: 2.8, opacity: 1 },
          itemStyle: {},
          label: { show: true },
        },
      },
    ],
  }
}
