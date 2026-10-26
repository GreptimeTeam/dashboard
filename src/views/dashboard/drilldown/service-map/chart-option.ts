import {
  buildServiceMapNodeSymbolDataUrl,
  escapeHtml,
  formatServiceMapCompactPercent,
  formatServiceMapCompactRate,
  healthFromNodeCallStats,
  mapTrafficToSymbolSize,
  nodeDisplayCallStats,
  nodeFlowSummary,
  nodeUnmatchedCount,
  SERVICE_MAP_ERROR_RATE_THRESHOLD,
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
  if (health === 'danger') return theme.danger
  if (health === 'ok') return theme.ok
  return theme.edge
}

/** Soften edge chroma by default; full saturation when the edge is in the active flow. */
function edgeStrokeColor(theme: ServiceMapTheme, edge: ServiceMapEdge, emphasize = false): string {
  if (edge.requests <= 0) {
    return emphasize ? theme.external : withAlpha(theme.external, 0.55)
  }
  if (edge.errors / edge.requests >= SERVICE_MAP_ERROR_RATE_THRESHOLD) {
    return emphasize ? theme.danger : withAlpha(theme.danger, 0.45)
  }
  return theme.edge
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
    let opacity = 1
    if (activeKey) {
      if (isActive) opacity = 0.78
      else if (connectedToActive) opacity = 1
      else opacity = 0.18
    }
    const serviceColor = theme.palette[0]
    const isDatabase = node.virtual && node.connectionType === 'database'
    const nodeStats = stats.get(node.key)
    const symbolSize = mapTrafficToSymbolSize(nodeStats?.traffic ?? 0, trafficMin, trafficMax, {
      virtual: node.virtual,
      cluster: Boolean(node.members),
    })
    const isServiceGlyph = !node.virtual && !node.members
    let symbol: string = node.members || node.virtual ? 'roundRect' : 'circle'
    let health: ServiceMapNodeHealth = 'neutral'
    if (!node.virtual && !isServiceGlyph && nodeStats) health = healthFromNodeCallStats(nodeStats)
    let itemStyle: Record<string, string | number> = {
      color: serviceColor.fill,
      borderColor: healthBorderColor(theme, health),
      borderWidth: isActive || node.members ? 3 : 2.5,
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
      symbol = buildServiceMapNodeSymbolDataUrl({
        size: symbolSize,
        fill: serviceColor.fill,
        okColor: theme.ok,
        dangerColor: theme.danger,
        trackColor: theme.edge,
        textColor: theme.text,
        errorRatio: display.errorRatio,
        mainStat: formatServiceMapCompactRate(rate),
        secondaryStat: formatServiceMapCompactPercent(display.errorRatio),
        emphasized: isActive,
      })
      itemStyle = { opacity, borderWidth: 0, color: 'transparent' }
    } else if (isDatabase) {
      itemStyle = {
        color: withAlpha(theme.database, isDark ? 0.22 : 0.12),
        borderColor: theme.database,
        borderWidth: isActive ? 2.5 : 2,
        borderType: 'dashed',
        opacity,
      }
    } else if (node.virtual) {
      itemStyle = {
        color: withAlpha(theme.external, isDark ? 0.2 : 0.1),
        borderColor: theme.external,
        borderWidth: isActive ? 2.5 : 2,
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
        distance: isServiceGlyph ? 12 : 10,
        formatter: node.label,
        color: theme.text,
        opacity,
        fontSize: isActive ? 12 : 11,
        fontWeight: isActive ? 600 : 400,
        lineHeight: 15,
        // Max width only — short names stay natural; long names wrap.
        width: 120,
        overflow: 'break',
        // Draw above edges so titles stay readable when lines cross.
        z2: 10,
      },
    }
  })
  const links = input.edges.map((edge) => {
    const isFlowing = Boolean(activeKey) && (activeKey === edge.source || activeKey === edge.target)
    const traffic = Math.max(edge.requests, edge.unmatched)
    const unmatchedOnly = edge.requests === 0 && edge.unmatched > 0
    const sourceCommunity = layout.get(edge.source)?.community
    const targetCommunity = layout.get(edge.target)?.community
    const sameGroup =
      sourceCommunity !== undefined && targetCommunity !== undefined && sourceCommunity === targetCommunity
    // Cross-heap edges stay quieter so community clusters read first (Datadog-like).
    let opacity = sameGroup ? 0.55 : 0.24
    if (unmatchedOnly) opacity = 0.32
    if (activeKey) opacity = isFlowing ? 0.95 : 0.08
    // Keep curveness stable under node-hover flow — changing it jumps the edge path.
    const curveness = sameGroup ? 0.03 : 0.16
    let width = 0.55 + Math.min(0.75, Math.log2(traffic + 1) * 0.15)
    if (sameGroup) width = 1 + Math.min(1.2, Math.log2(traffic + 1) * 0.22)
    if (isFlowing) width = 1.8
    return {
      id: edge.key,
      source: edge.source,
      target: edge.target,
      edgeKey: edge.key,
      value: traffic,
      // Non-none fromSymbol is required for ECharts adjustEdge to clip at the source border
      // (otherwise lines leave the node center and look reverse-directed).
      symbol: ['circle', 'arrow'],
      symbolSize: [0, isFlowing ? 10 : 8],
      lineStyle: {
        width,
        color: edgeStrokeColor(theme, edge, isFlowing),
        opacity,
        curveness,
        type: isFlowing || unmatchedOnly ? 'dashed' : 'solid',
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
      const errorRate = edge.requests > 0 ? edge.errors / edge.requests : 0
      const avgDuration = edge.durationCount > 0 ? edge.durationSum / edge.durationCount : 0
      return [
        `<strong>${escapeHtml(labelFor(edge.source))} → ${escapeHtml(labelFor(edge.target))}</strong>`,
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
    if (node.virtual) {
      const unmatched = nodeUnmatchedCount(input.edges, node.key)
      const isDatabase = node.connectionType === 'database'
      return [
        `<strong>${escapeHtml(node.label)}</strong>`,
        `${escapeHtml(t('drilldown.serviceMap.endpointKind'))}: ${escapeHtml(
          t(isDatabase ? 'drilldown.serviceMap.databaseEndpoint' : 'drilldown.serviceMap.inferredEndpoint')
        )}`,
        `${escapeHtml(t('drilldown.serviceMap.inferredCallRate'))}: ${escapeHtml(formatCallRate(unmatched))} call/s`,
        escapeHtml(t(isDatabase ? 'drilldown.serviceMap.databaseNodeHint' : 'drilldown.serviceMap.inferredNodeHint')),
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
