<template lang="pug">
a-card.drilldown-main-pane.gpt-results-pane.service-map-card(:bordered="false")
  .service-map
    .service-map-toolbar
      .service-map-toolbar__left
        span.drilldown-toolbar__group
          span.drilldown-toolbar__label {{ t('dashboard.database') }}
          SignalDatabaseSelect(v-model="tracesDatabase")
        span.drilldown-toolbar__group(v-for="facet in facets" :key="facet.key")
          span.drilldown-toolbar__label {{ facet.label }}
          a-select(
            mode="multiple"
            allow-clear
            size="medium"
            :model-value="facetFilters[facet.key] || []"
            :options="facet.values.map((value) => ({ label: value, value }))"
            :placeholder="t('drilldown.serviceMap.filterBy', { name: facet.label })"
            @change="(values) => setFacetFilter(facet.key, values)"
          )
        a-input.service-map-search(
          v-model="search"
          allow-clear
          size="medium"
          :placeholder="t('drilldown.serviceMap.searchPlaceholder')"
        )
          template(#prefix)
            icon-search
      .service-map-toolbar__right
        span.service-map-counts(v-if="!loading")
          | {{ t('drilldown.serviceMap.counts', { nodes: graphNodes.length, edges: graphEdges.length }) }}
        span.service-map-counts(v-else-if="visibleNodes.length")
          a-spin(:size="18")
          | {{ t('drilldown.serviceMap.loading') }}
        a-button(
          type="outline"
          size="medium"
          :disabled="!inspectedNodeKey && !selectedEdgeKey && !menuNodeKey"
          @click="clearSelection"
        )
          | {{ t('drilldown.serviceMap.resetView') }}

    a-alert.service-map-truncated(
      v-if="truncated"
      type="warning"
      show-icon
      :title="t('drilldown.serviceMap.truncated')"
    )
    a-alert.service-map-error(
      v-if="error"
      type="error"
      show-icon
      :title="t('drilldown.serviceMap.unavailable')"
      :description="error"
    )

    .service-map-content
      .service-map-canvas(ref="canvasRef")
        .service-map-state(v-if="loading && !visibleNodes.length")
          a-spin(:size="32")
          span {{ t('drilldown.serviceMap.loading') }}
        a-empty.service-map-state(v-else-if="!loading && !visibleNodes.length" :description="emptyDescription")
        VChart.service-map-chart(
          v-if="visibleNodes.length"
          ref="chartRef"
          :option="chartOption"
          :autoresize="true"
          :init-options="{ renderer: 'svg' }"
          @click="onChartClick"
          @mouseover="onChartMouseOver"
          @mouseout="onChartMouseOut"
        )
        .service-map-context-menu(
          v-if="menuNode"
          role="menu"
          :style="menuStyle"
          @click.stop
        )
          .service-map-context-menu__title {{ menuNode.label }}
          button.service-map-node-action(type="button" role="menuitem" @click="inspectNode")
            | {{ t('drilldown.serviceMap.inspect') }}
          button.service-map-node-action(
            v-if="!menuNode.virtual"
            type="button"
            role="menuitem"
            @click="openSignal('traces')"
          )
            | {{ t('drilldown.serviceMap.viewTraces') }}
          button.service-map-node-action(
            v-if="!menuNode.virtual && logsServiceReady"
            type="button"
            role="menuitem"
            @click="openSignal('logs')"
          )
            | {{ t('drilldown.serviceMap.viewLogs') }}
          button.service-map-node-action(type="button" role="menuitem" @click="copyServiceName")
            | {{ t('drilldown.serviceMap.copyService') }}
        .service-map-legend(v-if="visibleNodes.length")
          span.service-map-legend__item
            i.service-map-legend__service(
              :style="{ backgroundColor: graphTheme.palette[0].fill, borderColor: graphTheme.palette[0].stroke }"
            )
            | {{ t('drilldown.serviceMap.serviceNode') }}
          span.service-map-legend__item
            i.service-map-legend__external(
              :style="{ backgroundColor: withAlpha(graphTheme.external, isDark ? 0.2 : 0.1), borderColor: graphTheme.external }"
            )
            | {{ t('drilldown.serviceMap.externalNode') }}
          span.service-map-legend__item
            i.service-map-legend__matched(:style="{ backgroundColor: graphTheme.edge }")
            | {{ t('drilldown.serviceMap.matchedEdge') }}
          span.service-map-legend__item
            i.service-map-legend__unmatched(:style="{ borderTopColor: graphTheme.external }")
            | {{ t('drilldown.serviceMap.unmatchedEdge') }}

      aside.service-map-details(v-if="selectedNode || selectedEdge")
        template(v-if="selectedNode")
          .service-map-details__header
            .service-map-node-type {{ selectedNode.virtual ? selectedNode.type : t('drilldown.serviceMap.serviceNode') }}
            a-button.service-map-close(type="text" size="mini" @click="clearSelection")
              icon-close
          h3.service-map-details__title {{ selectedNode.label }}
          p.service-map-details__subline(v-if="selectedNode.scope") {{ selectedNode.scope }}
          p.service-map-details__subline(v-if="selectedNode.instanceCount")
            | {{ t('drilldown.serviceMap.instanceCount', { count: selectedNode.instanceCount }) }}
          p.service-map-details__subline(v-for="(value, key) in selectedNode.groupAttributes" :key="key") {{ key }}: {{ value }}
          p.service-map-details__subline(v-if="selectedNode.virtual") {{ t('drilldown.serviceMap.virtualNodeHint') }}
          .service-map-details__section
            h4 {{ t('drilldown.serviceMap.incoming') }}
            .service-map-dependency-list(v-if="selectedIncoming.length")
              button.service-map-dependency(v-for="edge in selectedIncoming" :key="edge.key" @click="selectEdge(edge)")
                span {{ nodeLabel(edge.source) }}
                span.service-map-dependency__metrics {{ formatRequests(edge.requests) }}
            p.service-map-empty(v-else) {{ t('drilldown.serviceMap.noDependencies') }}
          .service-map-details__section
            h4 {{ t('drilldown.serviceMap.outgoing') }}
            .service-map-dependency-list(v-if="selectedOutgoing.length")
              button.service-map-dependency(v-for="edge in selectedOutgoing" :key="edge.key" @click="selectEdge(edge)")
                span {{ nodeLabel(edge.target) }}
                span.service-map-dependency__metrics {{ formatRequests(edge.requests) }}
            p.service-map-empty(v-else) {{ t('drilldown.serviceMap.noDependencies') }}
          .service-map-details__actions(v-if="!selectedNode.virtual")
            a-button(type="primary" size="medium" @click="openSignal('traces')")
              | {{ t('drilldown.serviceMap.viewTraces') }}
            a-button(
              v-if="logsServiceReady"
              type="outline"
              size="medium"
              @click="openSignal('logs')"
            )
              | {{ t('drilldown.serviceMap.viewLogs') }}

        template(v-else-if="selectedEdge")
          .service-map-details__header
            .service-map-node-type {{ t('drilldown.serviceMap.callEdge') }}
            a-button.service-map-close(type="text" size="mini" @click="clearSelection")
              icon-close
          h3.service-map-details__title {{ nodeLabel(selectedEdge.source) }} → {{ nodeLabel(selectedEdge.target) }}
          dl.service-map-red
            dt {{ t('drilldown.serviceMap.requests') }}
            dd {{ formatRequests(selectedEdge.requests) }}
            dt {{ t('drilldown.serviceMap.errors') }}
            dd {{ formatRequests(selectedEdge.errors) }}
            dt {{ t('drilldown.serviceMap.errorRate') }}
            dd {{ formatPercent(errorRate(selectedEdge)) }}
            dt {{ t('drilldown.serviceMap.avgDuration') }}
            dd {{ formatDuration(avgDuration(selectedEdge)) }}
            dt {{ t('drilldown.serviceMap.maxDuration') }}
            dd {{ formatDuration(selectedEdge.durationMax) }}
            dt {{ t('drilldown.serviceMap.unmatched') }}
            dd {{ formatRequests(selectedEdge.unmatched) }}
          p.service-map-details__subline {{ t('drilldown.serviceMap.pairedPopulationHint') }}
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { storeToRefs } from 'pinia'
  import { useRoute, useRouter } from 'vue-router'
  import VChart from 'vue-echarts'
  import { IconClose, IconSearch } from '@arco-design/web-vue/es/icon'
  import { useDrilldownContext } from '@/observability/context'
  import { useAppStore } from '@/store'
  import type { DrilldownFilter } from '@/observability/types'
  import {
    fetchServiceMap,
    fetchServiceMapInstanceCount,
    type ServiceMapEdge,
    type ServiceMapResult,
  } from '@/observability/adapters/service-map'
  import {
    buildServiceMapCommunityLayout,
    buildServiceMapDisplayGraph,
    buildServiceMapFacets,
    type ServiceMapFilters,
  } from '@/observability/adapters/service-map-graph'
  import SignalDatabaseSelect from '../components/signal-database-select.vue'

  defineOptions({ name: 'ExploreServiceMap' })

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const { isDark } = storeToRefs(useAppStore())
  const canvasRef = ref<HTMLElement>()
  const chartRef = ref<InstanceType<typeof VChart>>()
  const route = useRoute()
  const router = useRouter()
  const { tracesDatabase } = ctx.connection
  const loading = ref(false)
  const error = ref('')
  const search = ref('')
  const result = ref<ServiceMapResult>({ nodes: [], edges: [], truncated: false })
  const chartSize = ref({ width: 1200, height: 640 })
  const inspectedNodeKey = ref('')
  const hoveredNodeKey = ref('')
  const selectedEdgeKey = ref('')
  const menuNodeKey = ref('')
  const menuPosition = ref({ x: 0, y: 0 })
  const facetFilters = ref<ServiceMapFilters>({})
  const expandedClusters = ref<Set<string>>(new Set())
  let chartResizeObserver: ResizeObserver | undefined
  const loadedInstanceCounts = new Set<string>()
  const pendingInstanceCounts = new Map<string, Promise<number>>()
  let requestId = 0

  const load = async () => {
    requestId += 1
    const currentRequest = requestId
    loading.value = true
    error.value = ''
    try {
      const next = await fetchServiceMap(ctx, (partial) => {
        if (currentRequest === requestId) result.value = partial
      })
      if (currentRequest === requestId) result.value = next
    } catch (reason) {
      if (currentRequest === requestId) {
        error.value = reason instanceof Error ? reason.message : String(reason)
        result.value = { nodes: [], edges: [], truncated: false }
      }
    } finally {
      if (currentRequest === requestId) loading.value = false
    }
  }

  const stop = watch(
    () => [
      tracesDatabase.value,
      ctx.query.time.value,
      ctx.query.rangeTime.value[0],
      ctx.query.rangeTime.value[1],
      ctx.query.refreshKey.value,
    ],
    () => load(),
    { immediate: true }
  )
  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') menuNodeKey.value = ''
  }
  const handleDocumentPointerDown = (event: PointerEvent) => {
    if (!menuNodeKey.value) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('.service-map-context-menu')) return
    menuNodeKey.value = ''
  }
  onMounted(() => {
    updateChartSize()
    if (canvasRef.value) {
      chartResizeObserver = new ResizeObserver(updateChartSize)
      chartResizeObserver.observe(canvasRef.value)
    }
    window.addEventListener('keydown', handleEscape)
    document.addEventListener('pointerdown', handleDocumentPointerDown)
  })
  onUnmounted(() => {
    requestId += 1
    stop()
    chartResizeObserver?.disconnect()
    window.removeEventListener('keydown', handleEscape)
    document.removeEventListener('pointerdown', handleDocumentPointerDown)
  })

  const allNodes = computed(() => result.value.nodes)
  const allEdges = computed(() => result.value.edges)
  const nodeMap = computed(() => new Map(allNodes.value.map((node) => [node.key, node])))
  const selectedNode = computed(() => nodeMap.value.get(inspectedNodeKey.value))
  const menuNode = computed(() => nodeMap.value.get(menuNodeKey.value))
  const menuStyle = computed(() => ({ left: `${menuPosition.value.x}px`, top: `${menuPosition.value.y}px` }))
  const selectedEdge = computed(() => graphEdges.value.find((edge) => edge.key === selectedEdgeKey.value))
  const selectedIncoming = computed(() => graphEdges.value.filter((edge) => edge.target === inspectedNodeKey.value))
  const selectedOutgoing = computed(() => graphEdges.value.filter((edge) => edge.source === inspectedNodeKey.value))
  const logsServiceReady = computed(() =>
    Boolean(ctx.semantics.logs.table.value && ctx.semantics.logs.entityFilterKeys.value.service)
  )
  const emptyDescription = computed(() =>
    search.value.trim() || Object.values(facetFilters.value).some((values) => values.length > 0)
      ? t('drilldown.serviceMap.noMatches')
      : t('drilldown.serviceMap.noData')
  )
  const facets = computed(() => buildServiceMapFacets(allNodes.value))
  const graphModel = computed(() =>
    buildServiceMapDisplayGraph({
      nodes: allNodes.value,
      edges: allEdges.value,
      search: search.value,
      filters: facetFilters.value,
      inspectNodeKey: inspectedNodeKey.value,
      expandedClusters: expandedClusters.value,
      clusterLabel: (count) => t('drilldown.serviceMap.hiddenServices', { count }),
    })
  )
  const graphNodes = computed(() => graphModel.value.nodes)
  const graphEdges = computed(() => graphModel.value.edges)
  const communityLayout = computed(() =>
    buildServiceMapCommunityLayout(graphNodes.value, graphEdges.value, chartSize.value.width, chartSize.value.height)
  )
  const graphNodeMap = computed(() => new Map(graphNodes.value.map((node) => [node.key, node])))
  const visibleNodes = computed(() => graphNodes.value)
  const truncated = computed(() => result.value.truncated)
  function themeToken(name: string, fallback: string): string {
    const styles = getComputedStyle(canvasRef.value ?? document.documentElement)
    return styles.getPropertyValue(name).trim() || fallback
  }

  function withAlpha(color: string, alpha: number): string {
    const hex = color.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1]
    if (!hex) return color
    const fullHex = hex.length === 3 ? [...hex].map((part) => part + part).join('') : hex
    const [red, green, blue] = [0, 2, 4].map((index) => Number.parseInt(fullHex.slice(index, index + 2), 16))
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`
  }

  const graphTheme = computed(() => {
    const dark = isDark.value
    const primary = themeToken('--gpt-main-purple', '#702fed')
    const paletteStrokes = [
      themeToken('--gpt-brand-600', primary),
      themeToken('--gpt-semantic-field', '#3fa4ff'),
      themeToken('--gpt-accent-ts', '#00bbb2'),
      themeToken('--gpt-semantic-tag', '#c478ff'),
      themeToken('--gpt-brand-700', '#5a4a70'),
      themeToken('--gpt-brand-300', '#c4a8f0'),
    ]
    return {
      text: dark ? '#f4f0fa' : themeToken('--gpt-text-primary', '#473460'),
      surface: dark ? '#25212b' : themeToken('--gpt-bg-panel', '#ffffff'),
      border: dark ? 'rgba(255,255,255,.24)' : themeToken('--gpt-border-strong', 'rgba(71,52,96,.15)'),
      edge: dark ? 'rgba(205, 196, 218, 0.62)' : 'rgba(71, 52, 96, 0.42)',
      danger: themeToken('--gpt-danger', '#ef4444'),
      external: themeToken('--gpt-semantic-tag', '#c478ff'),
      palette: paletteStrokes.map((stroke) => ({
        fill: withAlpha(stroke, dark ? 0.2 : 0.11),
        stroke,
      })),
    }
  })

  watch(
    () => [route.query.serviceMapSearch, route.query.serviceMapFilters],
    ([searchValue, filtersValue]) => {
      search.value = typeof searchValue === 'string' ? searchValue : ''
      try {
        const parsed = typeof filtersValue === 'string' ? JSON.parse(filtersValue) : {}
        facetFilters.value = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).filter(
            ([, values]) => Array.isArray(values) && values.every((value) => typeof value === 'string')
          ) as Array<[string, string[]]>
        )
      } catch {
        facetFilters.value = {}
      }
    },
    { immediate: true }
  )

  watch(
    [search, facetFilters],
    () => {
      const query = {
        ...route.query,
        serviceMapSearch: search.value || undefined,
        serviceMapFilters: Object.values(facetFilters.value).some((values) => values.length)
          ? JSON.stringify(facetFilters.value)
          : undefined,
      }
      if (
        query.serviceMapSearch === route.query.serviceMapSearch &&
        query.serviceMapFilters === route.query.serviceMapFilters
      ) {
        return
      }
      void router.replace({ query })
    },
    { deep: true }
  )

  watch(
    [facets, loading],
    ([availableFacets, isLoading]) => {
      if (isLoading) return
      const allowed = new Map(availableFacets.map((facet) => [facet.key, new Set(facet.values)]))
      const next = Object.fromEntries(
        Object.entries(facetFilters.value)
          .map(([key, values]) => [key, values.filter((value) => allowed.get(key)?.has(value))] as const)
          .filter(([key, values]) => allowed.has(key) && values.length)
      )
      if (JSON.stringify(next) !== JSON.stringify(facetFilters.value)) facetFilters.value = next
    },
    { deep: true }
  )

  function setFacetFilter(key: string, values: unknown) {
    const nextValues = Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : []
    const next = { ...facetFilters.value }
    if (nextValues.length) next[key] = nextValues
    else delete next[key]
    facetFilters.value = next
  }

  function escapeHtml(value: string): string {
    const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return value.replace(/[&<>"']/g, (char) => entities[char])
  }

  const chartOption = computed(() => {
    const degree = new Map<string, number>()
    const nodeRequests = new Map<string, number>()
    const nodeErrors = new Map<string, number>()
    graphEdges.value.forEach((edge) => {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
      for (const key of [edge.source, edge.target]) {
        nodeRequests.set(key, (nodeRequests.get(key) ?? 0) + edge.requests)
        nodeErrors.set(key, (nodeErrors.get(key) ?? 0) + edge.errors)
      }
    })
    const nodes = graphNodes.value.map((node) => {
      const isHovered = hoveredNodeKey.value === node.key
      const connectedToHovered = graphEdges.value.some(
        (edge) =>
          (edge.source === hoveredNodeKey.value && edge.target === node.key) ||
          (edge.target === hoveredNodeKey.value && edge.source === node.key)
      )
      const opacity = hoveredNodeKey.value ? (isHovered ? 0.78 : connectedToHovered ? 1 : 0.18) : 1
      const community = communityLayout.value.get(node.key)?.community ?? 0
      const communityColor = graphTheme.value.palette[community % graphTheme.value.palette.length]
      const hasElevatedErrors = (nodeErrors.get(node.key) ?? 0) / Math.max(1, nodeRequests.get(node.key) ?? 0) >= 0.05
      const nodeStroke = hasElevatedErrors ? graphTheme.value.danger : communityColor.stroke
      const nodeFill = hasElevatedErrors
        ? withAlpha(graphTheme.value.danger, isDark.value ? 0.28 : 0.14)
        : communityColor.fill
      return {
        id: node.key,
        name: node.label,
        nodeKey: node.key,
        x: communityLayout.value.get(node.key)?.x,
        y: communityLayout.value.get(node.key)?.y,
        entityType: node.type,
        virtual: node.virtual,
        isCluster: Boolean(node.members),
        symbol: node.members || node.virtual ? 'roundRect' : 'circle',
        symbolSize: node.members ? 40 : node.virtual ? 20 : Math.min(34, 24 + (degree.get(node.key) ?? 0)),
        itemStyle: node.members
          ? {
              color: nodeFill,
              borderColor: nodeStroke,
              borderWidth: 2,
              opacity,
            }
          : node.virtual
          ? {
              color: withAlpha(graphTheme.value.external, isDark.value ? 0.2 : 0.1),
              borderColor: graphTheme.value.external,
              borderWidth: 1.5,
              borderType: 'dashed',
              opacity,
            }
          : {
              color: nodeFill,
              borderColor: nodeStroke,
              borderWidth: hasElevatedErrors ? 2.5 : 1.5,
              opacity,
            },
        label: { show: true, position: 'right', formatter: node.label, color: graphTheme.value.text, opacity },
      }
    })
    const links = graphEdges.value.map((edge) => {
      const isFlowing = hoveredNodeKey.value === edge.source || hoveredNodeKey.value === edge.target
      return {
        id: edge.key,
        source: edge.source,
        target: edge.target,
        edgeKey: edge.key,
        value: edge.requests,
        symbol: ['none', 'arrow'],
        symbolSize: [0, 8],
        lineStyle: {
          width: isFlowing ? 1.8 : 0.8 + Math.min(1.1, Math.log2(edge.requests + 1) * 0.24),
          color: graphTheme.value.edge,
          opacity: hoveredNodeKey.value
            ? isFlowing
              ? 0.95
              : 0.08
            : edge.requests === 0 && edge.unmatched > 0
            ? 0.42
            : 0.56,
          curveness: 0.12,
          type: isFlowing || (edge.requests === 0 && edge.unmatched > 0) ? 'dashed' : 'solid',
        },
      }
    })
    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        backgroundColor: graphTheme.value.surface,
        borderColor: graphTheme.value.border,
        borderWidth: 1,
        textStyle: { color: graphTheme.value.text },
        formatter: (params: { dataType?: string; data?: { edgeKey?: string; nodeKey?: string } }) => {
          if (params.dataType === 'edge' && params.data?.edgeKey) {
            return ''
          }
          const node = params.data?.nodeKey ? graphNodeMap.value.get(params.data.nodeKey) : undefined
          if (!node) return ''
          if (node.cluster) {
            return `<strong>${escapeHtml(node.label)}</strong><br/>${escapeHtml(
              t('drilldown.serviceMap.clickToExpand')
            )}`
          }
          const instanceCount = node.service?.instanceCount ?? 0
          const incoming = nodeFlowSummary(node.key, 'incoming')
          const outgoing = nodeFlowSummary(node.key, 'outgoing')
          return [
            `<strong>${escapeHtml(node.label)}</strong>`,
            escapeHtml(node.type),
            instanceCount ? escapeHtml(t('drilldown.serviceMap.instanceCount', { count: instanceCount })) : '',
            `${escapeHtml(t('drilldown.serviceMap.incomingFlow'))}: ${escapeHtml(formatFlowSummary(incoming))}`,
            `${escapeHtml(t('drilldown.serviceMap.outgoingFlow'))}: ${escapeHtml(formatFlowSummary(outgoing))}`,
          ]
            .filter(Boolean)
            .join('<br/>')
        },
      },
      series: [
        {
          type: 'graph',
          layout: 'none',
          data: nodes,
          links,
          roam: true,
          draggable: true,
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: 8,
          label: { show: true, color: graphTheme.value.text, fontSize: 12 },
          lineStyle: { opacity: 0.56, width: 1 },
          emphasis: { disabled: true },
        },
      ],
    }
  })

  function nodeLabel(key: string): string {
    return graphNodeMap.value.get(key)?.label ?? nodeMap.value.get(key)?.label ?? key
  }
  function errorRate(edge: ServiceMapEdge): number {
    return edge.requests > 0 ? edge.errors / edge.requests : 0
  }
  function avgDuration(edge: ServiceMapEdge): number {
    return edge.durationCount > 0 ? edge.durationSum / edge.durationCount : 0
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
  function nodeFlowSummary(nodeKey: string, direction: 'incoming' | 'outgoing') {
    const connected = graphEdges.value.filter((edge) =>
      direction === 'incoming' ? edge.target === nodeKey : edge.source === nodeKey
    )
    const summary = connected.reduce(
      (value, edge) => ({
        requests: value.requests + edge.requests,
        errors: value.errors + edge.errors,
        durationSum: value.durationSum + edge.durationSum,
        durationCount: value.durationCount + edge.durationCount,
      }),
      { requests: 0, errors: 0, durationSum: 0, durationCount: 0 }
    )
    return summary
  }
  function formatFlowSummary(summary: ReturnType<typeof nodeFlowSummary>): string {
    const range = ctx.query.unixTimeRange()
    const rangeSeconds = range.length === 2 ? Math.max(1, range[1] - range[0]) : 1
    const rate = summary.requests / rangeSeconds
    const errorRatio = summary.requests ? summary.errors / summary.requests : 0
    const averageDuration = summary.durationCount ? summary.durationSum / summary.durationCount : 0
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(rate)} req/s · ${formatPercent(
      errorRatio
    )} · ${formatDuration(averageDuration)}`
  }
  function clearSelection() {
    hoveredNodeKey.value = ''
    inspectedNodeKey.value = ''
    selectedEdgeKey.value = ''
    menuNodeKey.value = ''
    menuPosition.value = { x: 0, y: 0 }
  }

  function updateChartSize() {
    if (!canvasRef.value) return
    chartSize.value = {
      width: canvasRef.value.clientWidth,
      height: canvasRef.value.clientHeight,
    }
  }

  function positionMenu(anchor: { x: number; y: number }) {
    const width = canvasRef.value?.clientWidth ?? 0
    const height = canvasRef.value?.clientHeight ?? 0
    const menuWidth = 240
    const menuHeight = 224
    const gap = 18
    const preferredX = anchor.x + gap
    const x = preferredX + menuWidth <= width - 8 ? preferredX : anchor.x - menuWidth - gap
    menuPosition.value = {
      x: Math.max(8, Math.min(x, Math.max(8, width - menuWidth - 8))),
      y: Math.max(8, Math.min(anchor.y - 16, Math.max(8, height - menuHeight - 8))),
    }
  }

  function clearChartActiveState() {
    hoveredNodeKey.value = ''
    chartRef.value?.dispatchAction({ type: 'downplay', seriesIndex: 0 })
    chartRef.value?.dispatchAction({ type: 'hideTip' })
    canvasRef.value?.classList.remove('service-map-canvas--flow')
  }

  function selectEdge(edge: ServiceMapEdge) {
    clearChartActiveState()
    inspectedNodeKey.value = ''
    menuNodeKey.value = ''
    selectedEdgeKey.value = edge.key
  }
  function onChartClick(params: {
    dataType?: string
    data?: { nodeKey?: string; edgeKey?: string }
    event?: { offsetX?: number; offsetY?: number; event?: MouseEvent }
  }) {
    clearChartActiveState()
    if (params.dataType === 'edge' && params.data?.edgeKey) {
      selectedEdgeKey.value = params.data.edgeKey
      inspectedNodeKey.value = ''
      menuNodeKey.value = ''
    } else if (params.dataType === 'node' && params.data?.nodeKey) {
      const graphNode = graphNodeMap.value.get(params.data.nodeKey)
      if (graphNode?.cluster) {
        const next = new Set(expandedClusters.value)
        if (next.has(graphNode.key)) next.delete(graphNode.key)
        else next.add(graphNode.key)
        expandedClusters.value = next
        inspectedNodeKey.value = ''
        selectedEdgeKey.value = ''
        menuNodeKey.value = ''
        return
      }
      menuNodeKey.value = graphNode?.service?.key ?? params.data.nodeKey
      inspectedNodeKey.value = ''
      selectedEdgeKey.value = ''
      const nativeEvent = params.event?.event
      const canvasBounds = canvasRef.value?.getBoundingClientRect()
      const clickPosition =
        nativeEvent && canvasBounds
          ? { x: nativeEvent.clientX - canvasBounds.left, y: nativeEvent.clientY - canvasBounds.top }
          : {
              x: params.event?.offsetX ?? nativeEvent?.offsetX ?? 0,
              y: params.event?.offsetY ?? nativeEvent?.offsetY ?? 0,
            }
      positionMenu(clickPosition)
    } else {
      menuNodeKey.value = ''
    }
  }

  async function inspectNode() {
    const nodeKey = menuNodeKey.value
    const node = nodeMap.value.get(nodeKey)
    inspectedNodeKey.value = nodeKey
    selectedEdgeKey.value = ''
    menuNodeKey.value = ''
    if (!node || node.virtual || node.type !== 'service' || node.instanceCount > 0) return

    const range = ctx.query.unixTimeRange()
    if (range.length !== 2) return
    const rangeKey = `${range[0]}:${range[1]}`
    const lookupKey = `${rangeKey}:${node.key}`
    if (loadedInstanceCounts.has(lookupKey)) return
    const lookup = pendingInstanceCounts.get(lookupKey) ?? fetchServiceMapInstanceCount(ctx, node.id)
    pendingInstanceCounts.set(lookupKey, lookup)
    try {
      const instanceCount = await lookup
      if (ctx.query.unixTimeRange().join(':') !== rangeKey) return
      loadedInstanceCounts.add(lookupKey)
      result.value = {
        ...result.value,
        nodes: result.value.nodes.map((item) => (item.key === node.key ? { ...item, instanceCount } : item)),
      }
    } catch {
      // Service details stay usable if the optional instance count query fails.
    } finally {
      pendingInstanceCounts.delete(lookupKey)
    }
  }

  function onChartMouseOver(params: { dataType?: string; data?: { nodeKey?: string } }) {
    if (menuNodeKey.value) {
      hoveredNodeKey.value = ''
      chartRef.value?.dispatchAction({ type: 'downplay', seriesIndex: 0 })
      return
    }
    if (params.dataType !== 'node') {
      hoveredNodeKey.value = ''
      chartRef.value?.dispatchAction({ type: 'downplay', seriesIndex: 0 })
      chartRef.value?.dispatchAction({ type: 'hideTip' })
      canvasRef.value?.classList.remove('service-map-canvas--flow')
      return
    }
    hoveredNodeKey.value = params.data?.nodeKey ?? ''
    canvasRef.value?.classList.add('service-map-canvas--flow')
  }

  function onChartMouseOut() {
    hoveredNodeKey.value = ''
    canvasRef.value?.classList.remove('service-map-canvas--flow')
  }

  async function copyServiceName() {
    const node = menuNode.value
    if (node) await navigator.clipboard.writeText(node.serviceValue || node.label)
  }

  async function openSignal(signal: 'logs' | 'traces') {
    const node = menuNode.value ?? selectedNode.value
    const serviceValue = node?.serviceValue || node?.label
    if (!node || node.virtual || !serviceValue) return
    const serviceFilter: DrilldownFilter = { key: 'service', op: '=', value: serviceValue }
    const filters = [...ctx.query.filters.value.filter((filter) => filter.key !== 'service'), serviceFilter]
    const encodedFilters = encodeURIComponent(JSON.stringify(filters))
    menuNodeKey.value = ''
    clearChartActiveState()
    await router.push({
      query: {
        ...route.query,
        view: undefined,
        signal,
        metric: undefined,
        filters: encodedFilters,
        serviceMapSearch: undefined,
        serviceMapFilters: undefined,
      },
    })
  }
</script>

<style scoped lang="less">
  .service-map-card {
    flex: 1 1 0%;
    min-height: 0;
  }
  .service-map {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .service-map-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--gpt-gap-md);
    padding: 0 var(--gpt-page-padding-x) var(--gpt-gap-md);
  }
  .service-map-toolbar__left,
  .service-map-toolbar__right {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--gpt-gap-md);
  }
  .service-map-search {
    width: 260px;
  }
  .service-map-counts,
  .service-map-node-type,
  .service-map-details__subline,
  .service-map-empty {
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-sm);
  }
  .service-map-truncated,
  .service-map-error {
    margin: 0 var(--gpt-page-padding-x) var(--gpt-gap-md);
  }
  .service-map-content {
    display: flex;
    flex: 1 1 0%;
    min-height: 0;
    overflow: hidden;
    border-top: 1px solid var(--gpt-border-primary);
  }
  .service-map-canvas {
    position: relative;
    flex: 1 1 0%;
    min-width: 0;
    min-height: 360px;
  }
  .service-map-chart {
    width: 100%;
    height: 100%;
    min-height: 360px;
  }
  @keyframes service-map-flow {
    to {
      stroke-dashoffset: -18;
    }
  }
  .service-map-canvas--flow {
    :deep(path[stroke-dasharray]),
    :deep(path[style*='stroke-dasharray']) {
      animation: service-map-flow 700ms linear infinite;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .service-map-canvas--flow {
      :deep(path[stroke-dasharray]),
      :deep(path[style*='stroke-dasharray']) {
        animation: none;
      }
    }
  }
  .service-map-state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--gpt-gap-md);
  }
  .service-map-context-menu {
    position: absolute;
    z-index: 10;
    display: flex;
    width: 232px;
    max-height: calc(100% - 16px);
    flex-direction: column;
    gap: var(--gpt-gap-2xs);
    overflow: auto;
    padding: var(--gpt-gap-sm);
    border: 1px solid var(--gpt-border-strong);
    border-radius: var(--gpt-radius-md);
    background: var(--gpt-bg-panel);
    box-shadow: 0 8px 24px rgba(25, 31, 40, 0.2);
    isolation: isolate;
  }
  .service-map-context-menu__title {
    overflow: hidden;
    padding: var(--gpt-gap-xs) var(--gpt-gap-sm);
    color: var(--gpt-text-primary);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .service-map-legend {
    position: absolute;
    bottom: var(--gpt-gap-md);
    left: var(--gpt-gap-md);
    display: flex;
    flex-wrap: wrap;
    gap: var(--gpt-gap-md);
    padding: var(--gpt-gap-sm) var(--gpt-gap-md);
    border: 1px solid var(--gpt-border-primary);
    border-radius: var(--gpt-radius-md);
    background: var(--gpt-bg-primary);
    box-shadow: var(--gpt-shadow-sm);
  }
  .service-map-legend__item {
    display: inline-flex;
    align-items: center;
    gap: var(--gpt-gap-xs);
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-xs);
  }
  .service-map-legend__item i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .service-map-legend__service {
    border: 2px solid var(--gpt-brand-600);
  }
  .service-map-legend__external {
    border: 2px dashed var(--gpt-semantic-tag);
  }
  .service-map-legend__matched {
    height: 2px !important;
    border-radius: 0 !important;
  }
  .service-map-legend__unmatched {
    width: 18px !important;
    height: 0 !important;
    border-top: 2px dashed var(--gpt-semantic-tag);
    border-radius: 0 !important;
  }
  .service-map-details {
    display: flex;
    flex: 0 0 320px;
    flex-direction: column;
    gap: var(--gpt-gap-md);
    overflow: auto;
    padding: var(--gpt-gap-lg);
    border-left: 1px solid var(--gpt-border-primary);
    background: var(--gpt-bg-primary);
  }
  .service-map-details__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .service-map-details__title {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: var(--gpt-font-lg);
  }
  .service-map-node-action {
    width: 100%;
    padding: var(--gpt-gap-sm) var(--gpt-gap-md);
    border: 1px solid transparent;
    border-radius: var(--gpt-radius-md);
    background: var(--gpt-bg-primary);
    color: var(--gpt-text-primary);
    text-align: left;
    cursor: pointer;
    transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
  }
  .service-map-node-action:hover {
    background: var(--gpt-bg-secondary);
    border-color: var(--gpt-border-strong);
    color: var(--gpt-main-purple);
  }
  .service-map-node-action:focus-visible {
    outline: 2px solid var(--gpt-main-purple);
    outline-offset: 1px;
  }
  .service-map-details__section h4 {
    margin: 0 0 var(--gpt-gap-xs);
    font-size: var(--gpt-font-sm);
  }
  .service-map-dependency-list {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-2xs);
  }
  .service-map-dependency {
    display: flex;
    justify-content: space-between;
    gap: var(--gpt-gap-md);
    padding: var(--gpt-gap-xs) 0;
    border: 0;
    background: transparent;
    color: var(--gpt-text-primary);
    text-align: left;
    cursor: pointer;
  }
  .service-map-dependency:hover {
    color: var(--gpt-main-purple);
  }
  .service-map-dependency__metrics {
    color: var(--gpt-text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .service-map-details__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--gpt-gap-sm);
    margin-top: auto;
  }
  .service-map-red {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--gpt-gap-sm) var(--gpt-gap-md);
    margin: 0;
  }
  .service-map-red dt {
    color: var(--gpt-text-secondary);
  }
  .service-map-red dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  @media (max-width: 760px) {
    .service-map-content {
      flex-direction: column;
    }
    .service-map-canvas {
      flex: 1 1 0%;
      min-height: 320px;
    }
    .service-map-chart {
      min-height: 320px;
    }
    .service-map-details {
      flex: 0 0 auto;
      max-height: 40%;
      border-top: 1px solid var(--gpt-border-primary);
      border-left: 0;
    }
  }
</style>
