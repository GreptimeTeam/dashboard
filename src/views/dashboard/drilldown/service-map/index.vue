<template lang="pug">
a-card.drilldown-main-pane.gpt-results-pane.service-map-card(:bordered="false")
  .service-map
    .drilldown-toolbar.service-map-toolbar
      .drilldown-toolbar__left
        span.drilldown-toolbar__group(v-if="scopeFacet")
          span.drilldown-toolbar__label {{ t('drilldown.serviceMap.scopeLabel') }}
          a-select.service-map-scope-select(
            v-model="selectedScopes"
            multiple
            allow-clear
            size="medium"
            :placeholder="t('drilldown.serviceMap.scopePlaceholder')"
            :options="scopeFacet.values.map((value) => ({ label: value, value }))"
          )
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
        a-select.service-map-service-select(
          v-model="selectedServices"
          multiple
          allow-search
          allow-clear
          size="medium"
          :placeholder="t('drilldown.serviceMap.searchPlaceholder')"
        )
          a-option(v-for="option in serviceOptions" :key="option.value" :value="option.value") {{ option.label }}
        span.service-map-counts(v-if="!loading")
          | {{ t('drilldown.serviceMap.counts', { nodes: graphNodes.length, edges: graphEdges.length }) }}
        span.service-map-counts(v-else-if="visibleNodes.length")
          a-spin(:size="18")
          | {{ t('drilldown.serviceMap.loading') }}
      .drilldown-toolbar__right(v-if="inspectedNodeKey && selectedNode")
        span.service-map-active-node {{ t('drilldown.serviceMap.activeNode', { name: selectedNode.label }) }}
        a-button(type="outline" size="medium" @click="backToOverview")
          | {{ t('drilldown.serviceMap.backToOverview') }}

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
      .service-map-canvas(
        ref="canvasRef"
        :class="{ 'service-map-canvas--focused': !!focusCanvasStyle }"
        :style="focusCanvasStyle"
      )
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
        .service-map-legend(v-if="hasInferredEndpoints")
          span.service-map-legend__item
            i.service-map-legend__service(
              :style="{ backgroundColor: graphTheme.palette[0].fill, borderColor: graphTheme.palette[0].stroke }"
            )
            | {{ t('drilldown.serviceMap.serviceNode') }}
          span.service-map-legend__item(v-if="hasDatabaseEndpoints")
            i.service-map-legend__database(
              :style="{ backgroundColor: withAlpha(graphTheme.database, isDark ? 0.22 : 0.12), borderColor: graphTheme.database }"
            )
            | {{ t('drilldown.serviceMap.databaseEndpoint') }}
          span.service-map-legend__item(v-if="hasInferredServiceEndpoints")
            i.service-map-legend__external(
              :style="{ backgroundColor: withAlpha(graphTheme.external, isDark ? 0.2 : 0.1), borderColor: graphTheme.external }"
            )
            | {{ t('drilldown.serviceMap.inferredEndpoint') }}
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { storeToRefs } from 'pinia'
  import { useRoute, useRouter } from 'vue-router'
  import VChart from 'vue-echarts'
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
    buildServiceMapFocusLayout,
    buildServiceMapScopeFacet,
    type ServiceMapFilters,
  } from '@/observability/adapters/service-map-graph'

  defineOptions({ name: 'ExploreServiceMap' })

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const { isDark } = storeToRefs(useAppStore())
  const canvasRef = ref<HTMLElement>()
  const chartRef = ref<InstanceType<typeof VChart>>()
  const route = useRoute()
  const router = useRouter()
  const loading = ref(false)
  const error = ref('')
  const selectedServices = ref<string[]>([])
  const selectedScopes = ref<string[]>([])
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
      ctx.query.time.value,
      ctx.query.rangeTime.value[0],
      ctx.query.rangeTime.value[1],
      ctx.query.refreshKey.value,
    ],
    () => load(),
    { immediate: true }
  )
  const allNodes = computed(() => result.value.nodes)
  const allEdges = computed(() => result.value.edges)
  const nodeMap = computed(() => new Map(allNodes.value.map((node) => [node.key, node])))
  const selectedNode = computed(() => nodeMap.value.get(inspectedNodeKey.value))
  const menuNode = computed(() => nodeMap.value.get(menuNodeKey.value))
  const menuStyle = computed(() => ({ left: `${menuPosition.value.x}px`, top: `${menuPosition.value.y}px` }))
  /** Flow / dimming follows hover only. Inspect layout already centers the focus node. */
  const activeNodeKey = computed(() => hoveredNodeKey.value)
  const logsServiceReady = computed(() =>
    Boolean(ctx.semantics.logs.table.value && ctx.semantics.logs.entityFilterKeys.value.service)
  )
  const emptyDescription = computed(() =>
    selectedServices.value.length ||
    selectedScopes.value.length ||
    Object.values(facetFilters.value).some((values) => values.length > 0)
      ? t('drilldown.serviceMap.noMatches')
      : t('drilldown.serviceMap.noData')
  )
  const scopeFacet = computed(() => buildServiceMapScopeFacet(allNodes.value))
  const facets = computed(() => buildServiceMapFacets(allNodes.value))
  const serviceOptions = computed(() => {
    const labels = new Set<string>()
    const options: Array<{ label: string; value: string }> = []
    allNodes.value.forEach((node) => {
      if (node.type !== 'service' || node.virtual) return
      const label = node.label || node.id
      if (!label || labels.has(label)) return
      labels.add(label)
      options.push({ label, value: label })
    })
    return options.sort((a, b) => a.label.localeCompare(b.label))
  })
  const graphModel = computed(() =>
    buildServiceMapDisplayGraph({
      nodes: allNodes.value,
      edges: allEdges.value,
      selectedServices: selectedServices.value,
      selectedScopes: selectedScopes.value,
      filters: facetFilters.value,
      inspectNodeKey: inspectedNodeKey.value,
      expandedClusters: expandedClusters.value,
      clusterLabel: (count) => t('drilldown.serviceMap.hiddenServices', { count }),
    })
  )
  const graphNodes = computed(() => graphModel.value.nodes)
  const graphEdges = computed(() => graphModel.value.edges)
  /** Keep small neighborhoods compact; expand toward full width as neighbors grow. */
  const focusCanvasStyle = computed(() => {
    if (!inspectedNodeKey.value) return undefined
    const count = Math.max(1, graphNodes.value.length)
    if (count >= 12) return undefined
    const maxWidth = Math.max(480, Math.min(880, 280 + count * 72))
    return { maxWidth: `${maxWidth}px` }
  })
  const communityLayout = computed(() => {
    const { width, height } = chartSize.value
    if (inspectedNodeKey.value) {
      return buildServiceMapFocusLayout(inspectedNodeKey.value, graphNodes.value, graphEdges.value, width, height)
    }
    return buildServiceMapCommunityLayout(graphNodes.value, graphEdges.value, width, height)
  })
  const graphNodeMap = computed(() => new Map(graphNodes.value.map((node) => [node.key, node])))
  const visibleNodes = computed(() => graphNodes.value)
  const hasDatabaseEndpoints = computed(() =>
    graphNodes.value.some((node) => node.virtual && node.connectionType === 'database')
  )
  const hasInferredServiceEndpoints = computed(() =>
    graphNodes.value.some((node) => node.virtual && node.connectionType !== 'database')
  )
  const hasInferredEndpoints = computed(() => hasDatabaseEndpoints.value || hasInferredServiceEndpoints.value)
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
      warn: themeToken('--gpt-warning', '#f59e0b'),
      external: themeToken('--gpt-semantic-tag', '#c478ff'),
      database: themeToken('--gpt-semantic-field', '#3fa4ff'),
      palette: paletteStrokes.map((stroke) => ({
        fill: withAlpha(stroke, dark ? 0.2 : 0.11),
        stroke,
      })),
    }
  })

  function sameStringList(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index])
  }

  function parseServiceMapSearch(raw: unknown): string[] {
    if (typeof raw !== 'string' || !raw) return []
    const candidates = [raw]
    try {
      candidates.unshift(decodeURIComponent(raw))
    } catch {
      // Keep the raw string when it is not URI-encoded.
    }
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate)
        if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')) {
          return parsed.filter(Boolean)
        }
      } catch {
        // Try the next candidate / legacy plain label.
      }
    }
    return [raw]
  }

  function parseServiceMapFilters(raw: unknown): ServiceMapFilters {
    if (typeof raw !== 'string' || !raw) return {}
    const candidates = [raw]
    try {
      candidates.unshift(decodeURIComponent(raw))
    } catch {
      // Keep the raw string when it is not URI-encoded.
    }
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
        return Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).filter(
            ([, values]) => Array.isArray(values) && values.every((value) => typeof value === 'string')
          ) as Array<[string, string[]]>
        )
      } catch {
        // Try the next candidate.
      }
    }
    return {}
  }

  // Hydrate once from the URL. Do not keep a route→state watcher — that loop was
  // clearing selections when drilldown URL sync rewrote the query without our keys.
  selectedServices.value = parseServiceMapSearch(route.query.serviceMapSearch)
  selectedScopes.value = parseServiceMapSearch(route.query.serviceMapScope)
  facetFilters.value = parseServiceMapFilters(route.query.serviceMapFilters)
  // Promote legacy env/scope facet query params into the first-class environment control.
  ;['scope', 'env', 'environment', 'deployment.environment'].forEach((key) => {
    const legacy = facetFilters.value[key]
    if (!legacy?.length) return
    selectedScopes.value = [...new Set([...selectedScopes.value, ...legacy])]
    delete facetFilters.value[key]
  })

  function writeServiceMapQuery() {
    const serviceMapSearch = selectedServices.value.length
      ? encodeURIComponent(JSON.stringify(selectedServices.value))
      : undefined
    const serviceMapScope = selectedScopes.value.length
      ? encodeURIComponent(JSON.stringify(selectedScopes.value))
      : undefined
    const serviceMapFilters = Object.values(facetFilters.value).some((values) => values.length)
      ? encodeURIComponent(JSON.stringify(facetFilters.value))
      : undefined
    if (
      serviceMapSearch === route.query.serviceMapSearch &&
      serviceMapScope === route.query.serviceMapScope &&
      serviceMapFilters === route.query.serviceMapFilters
    ) {
      return
    }
    router
      .replace({
        query: {
          ...route.query,
          serviceMapSearch,
          serviceMapScope,
          serviceMapFilters,
        },
      })
      .catch(() => undefined)
  }

  watch(
    [facets, scopeFacet, serviceOptions, loading],
    ([availableFacets, availableScope, availableServices, isLoading]) => {
      if (isLoading || availableServices.length === 0) return
      const allowed = new Map(availableFacets.map((facet) => [facet.key, new Set(facet.values)]))
      const nextFacets = Object.fromEntries(
        Object.entries(facetFilters.value)
          .map(([key, values]) => [key, values.filter((value) => allowed.get(key)?.has(value))] as const)
          .filter(([key, values]) => allowed.has(key) && values.length)
      )
      if (JSON.stringify(nextFacets) !== JSON.stringify(facetFilters.value)) {
        facetFilters.value = nextFacets
        writeServiceMapQuery()
      }

      const allowedScopes = new Set(availableScope?.values ?? [])
      const nextScopes = selectedScopes.value.filter((value) => allowedScopes.has(value))
      if (!sameStringList(nextScopes, selectedScopes.value)) {
        selectedScopes.value = nextScopes
        writeServiceMapQuery()
      }

      const allowedServices = new Set(availableServices.map((option) => option.value))
      const nextServices = selectedServices.value.filter((value) => allowedServices.has(value))
      if (!sameStringList(nextServices, selectedServices.value)) {
        selectedServices.value = nextServices
        writeServiceMapQuery()
      }
    },
    { deep: true }
  )

  function setFacetFilter(key: string, values: unknown) {
    const nextValues = Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : []
    const next = { ...facetFilters.value }
    if (nextValues.length) next[key] = nextValues
    else delete next[key]
    facetFilters.value = next
    writeServiceMapQuery()
  }

  watch(selectedServices, () => writeServiceMapQuery(), { deep: true })
  watch(selectedScopes, () => writeServiceMapQuery(), { deep: true })

  function escapeHtml(value: string): string {
    const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return value.replace(/[&<>"']/g, (char) => entities[char])
  }

  const chartOption = computed(() => {
    const degree = new Map<string, number>()
    graphEdges.value.forEach((edge) => {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
    })
    const activeKey = activeNodeKey.value
    const nodes = graphNodes.value.map((node) => {
      const isActive = activeKey === node.key
      const connectedToActive = graphEdges.value.some(
        (edge) =>
          (edge.source === activeKey && edge.target === node.key) ||
          (edge.target === activeKey && edge.source === node.key)
      )
      const opacity = activeKey ? (isActive ? 0.78 : connectedToActive ? 1 : 0.18) : 1
      // Real services share one color; call errors are shown on edges, not node chrome.
      const serviceColor = graphTheme.value.palette[0]
      const isDatabase = node.virtual && node.connectionType === 'database'
      // Canvas labels stay name-first (full name). RED / unmatched live in the hover tooltip.
      let canvasLabel = node.label
      if (node.virtual && !node.members) {
        canvasLabel = `${node.label}\n${t(
          isDatabase ? 'drilldown.serviceMap.databaseEndpoint' : 'drilldown.serviceMap.inferredEndpoint'
        )}`
      }
      let itemStyle: Record<string, string | number> = {
        color: serviceColor.fill,
        borderColor: serviceColor.stroke,
        borderWidth: isActive || node.members ? 2 : 1.5,
        opacity,
      }
      if (isDatabase) {
        itemStyle = {
          color: withAlpha(graphTheme.value.database, isDark.value ? 0.22 : 0.12),
          borderColor: graphTheme.value.database,
          borderWidth: isActive ? 2 : 1.5,
          borderType: 'dashed',
          opacity,
        }
      } else if (node.virtual) {
        itemStyle = {
          color: withAlpha(graphTheme.value.external, isDark.value ? 0.2 : 0.1),
          borderColor: graphTheme.value.external,
          borderWidth: isActive ? 2 : 1.5,
          borderType: 'dashed',
          opacity,
        }
      }
      return {
        id: node.key,
        name: node.label,
        nodeKey: node.key,
        x: communityLayout.value.get(node.key)?.x,
        y: communityLayout.value.get(node.key)?.y,
        entityType: node.type,
        virtual: node.virtual,
        connectionType: node.connectionType,
        isCluster: Boolean(node.members),
        symbol: node.members || node.virtual ? 'roundRect' : 'circle',
        symbolSize: node.members ? 40 : node.virtual ? 20 : Math.min(34, 24 + (degree.get(node.key) ?? 0)),
        itemStyle,
        label: {
          show: true,
          position: 'right',
          distance: 8,
          formatter: canvasLabel,
          color: graphTheme.value.text,
          opacity,
          fontSize: isActive ? 13 : 12,
          fontWeight: isActive ? 600 : 400,
          lineHeight: 16,
          width: 160,
          overflow: 'break',
        },
      }
    })
    const links = graphEdges.value.map((edge) => {
      const isFlowing = activeKey === edge.source || activeKey === edge.target
      const traffic = Math.max(edge.requests, edge.unmatched)
      const unmatchedOnly = edge.requests === 0 && edge.unmatched > 0
      return {
        id: edge.key,
        source: edge.source,
        target: edge.target,
        edgeKey: edge.key,
        value: traffic,
        symbol: ['none', 'arrow'],
        symbolSize: [0, 8],
        lineStyle: {
          width: isFlowing ? 1.8 : 0.8 + Math.min(1.1, Math.log2(traffic + 1) * 0.24),
          color: edgeStrokeColor(edge),
          opacity: activeKey ? (isFlowing ? 0.95 : 0.08) : unmatchedOnly ? 0.42 : 0.56,
          curveness: 0.12,
          type: isFlowing || unmatchedOnly ? 'dashed' : 'solid',
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
            const edge = graphEdges.value.find((item) => item.key === params.data?.edgeKey)
            if (!edge) return ''
            return [
              `<strong>${escapeHtml(nodeLabel(edge.source))} → ${escapeHtml(nodeLabel(edge.target))}</strong>`,
              `${escapeHtml(t('drilldown.serviceMap.requests'))}: ${escapeHtml(formatRequests(edge.requests))}`,
              `${escapeHtml(t('drilldown.serviceMap.errors'))}: ${escapeHtml(formatRequests(edge.errors))}`,
              `${escapeHtml(t('drilldown.serviceMap.errorRate'))}: ${escapeHtml(formatPercent(errorRate(edge)))}`,
              `${escapeHtml(t('drilldown.serviceMap.avgDuration'))}: ${escapeHtml(formatDuration(avgDuration(edge)))}`,
              `${escapeHtml(t('drilldown.serviceMap.maxDuration'))}: ${escapeHtml(formatDuration(edge.durationMax))}`,
              edge.unmatched > 0
                ? `${escapeHtml(t('drilldown.serviceMap.unmatched'))}: ${escapeHtml(formatRequests(edge.unmatched))}`
                : '',
            ]
              .filter(Boolean)
              .join('<br/>')
          }
          const node = params.data?.nodeKey ? graphNodeMap.value.get(params.data.nodeKey) : undefined
          if (!node) return ''
          if (node.cluster) {
            return `<strong>${escapeHtml(node.label)}</strong><br/>${escapeHtml(
              t('drilldown.serviceMap.clickToExpand')
            )}`
          }
          if (node.virtual) {
            const unmatched = nodeUnmatchedCount(node.key)
            const isDatabase = node.connectionType === 'database'
            return [
              `<strong>${escapeHtml(node.label)}</strong>`,
              `${escapeHtml(t('drilldown.serviceMap.endpointKind'))}: ${escapeHtml(
                t(isDatabase ? 'drilldown.serviceMap.databaseEndpoint' : 'drilldown.serviceMap.inferredEndpoint')
              )}`,
              `${escapeHtml(t('drilldown.serviceMap.inferredCallRate'))}: ${escapeHtml(
                formatCallRate(unmatched)
              )} call/s`,
              escapeHtml(
                t(isDatabase ? 'drilldown.serviceMap.databaseNodeHint' : 'drilldown.serviceMap.inferredNodeHint')
              ),
            ].join('<br/>')
          }
          const instanceCount = node.service?.instanceCount ?? 0
          const incoming = nodeFlowSummary(node.key, 'incoming')
          const outgoing = nodeFlowSummary(node.key, 'outgoing')
          return [
            `<strong>${escapeHtml(node.label)}</strong>`,
            instanceCount ? escapeHtml(t('drilldown.serviceMap.instanceCount', { count: instanceCount })) : '',
            ...formatNodeDirectionTooltip(t('drilldown.serviceMap.incomingFlow'), incoming),
            ...formatNodeDirectionTooltip(t('drilldown.serviceMap.outgoingFlow'), outgoing),
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
    return connected.reduce(
      (value, edge) => ({
        requests: value.requests + edge.requests,
        errors: value.errors + edge.errors,
        unmatched: value.unmatched + edge.unmatched,
        durationSum: value.durationSum + edge.durationSum,
        durationCount: value.durationCount + edge.durationCount,
      }),
      { requests: 0, errors: 0, unmatched: 0, durationSum: 0, durationCount: 0 }
    )
  }
  function nodeUnmatchedCount(nodeKey: string): number {
    return graphEdges.value.reduce((sum, edge) => {
      if (edge.source !== nodeKey && edge.target !== nodeKey) return sum
      return sum + edge.unmatched
    }, 0)
  }
  function formatCallRate(count: number): string {
    const range = ctx.query.unixTimeRange()
    const rangeSeconds = range.length === 2 ? Math.max(1, range[1] - range[0]) : 1
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(count / rangeSeconds)
  }
  function formatNodeDirectionTooltip(title: string, summary: ReturnType<typeof nodeFlowSummary>): string[] {
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
  function edgeStrokeColor(edge: ServiceMapEdge): string {
    if (edge.requests <= 0) return graphTheme.value.external
    const rate = edge.errors / edge.requests
    if (rate >= 0.05) return graphTheme.value.danger
    if (rate >= 0.01) return graphTheme.value.warn
    return graphTheme.value.edge
  }
  function applyActiveFlow(nodeKey: string) {
    hoveredNodeKey.value = nodeKey
    if (nodeKey) canvasRef.value?.classList.add('service-map-canvas--flow')
    else canvasRef.value?.classList.remove('service-map-canvas--flow')
  }

  function clearChartActiveState() {
    hoveredNodeKey.value = ''
    chartRef.value?.dispatchAction({ type: 'downplay', seriesIndex: 0 })
    chartRef.value?.dispatchAction({ type: 'hideTip' })
    canvasRef.value?.classList.remove('service-map-canvas--flow')
  }

  function dismissTransientUi() {
    selectedEdgeKey.value = ''
    menuNodeKey.value = ''
    menuPosition.value = { x: 0, y: 0 }
  }

  function backToOverview() {
    clearChartActiveState()
    inspectedNodeKey.value = ''
    dismissTransientUi()
  }

  function onEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    if (menuNodeKey.value) {
      menuNodeKey.value = ''
      return
    }
    if (inspectedNodeKey.value) {
      backToOverview()
      return
    }
    dismissTransientUi()
    clearChartActiveState()
  }

  function handleDocumentPointerDown(event: PointerEvent) {
    if (!menuNodeKey.value) return
    const { target } = event
    if (!(target instanceof Element)) return
    if (target.closest('.service-map-context-menu')) return
    menuNodeKey.value = ''
  }

  function updateChartSize() {
    if (!canvasRef.value) return
    chartSize.value = {
      width: canvasRef.value.clientWidth,
      height: canvasRef.value.clientHeight,
    }
  }

  watch([inspectedNodeKey, () => graphNodes.value.length, focusCanvasStyle], async () => {
    await nextTick()
    updateChartSize()
  })

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

  async function inspectNode() {
    const nodeKey = menuNodeKey.value
    const node = nodeMap.value.get(nodeKey)
    inspectedNodeKey.value = nodeKey
    selectedEdgeKey.value = ''
    menuNodeKey.value = ''
    clearChartActiveState()
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

  function onChartClick(params: {
    dataType?: string
    data?: { nodeKey?: string; edgeKey?: string }
    event?: { offsetX?: number; offsetY?: number; event?: MouseEvent }
  }) {
    clearChartActiveState()
    if (params.dataType === 'edge' && params.data?.edgeKey) {
      selectedEdgeKey.value = params.data.edgeKey
      menuNodeKey.value = ''
      return
    }
    if (params.dataType === 'node' && params.data?.nodeKey) {
      const graphNode = graphNodeMap.value.get(params.data.nodeKey)
      if (graphNode?.cluster) {
        const next = new Set(expandedClusters.value)
        if (next.has(graphNode.key)) next.delete(graphNode.key)
        else next.add(graphNode.key)
        expandedClusters.value = next
        selectedEdgeKey.value = ''
        menuNodeKey.value = ''
        return
      }
      menuNodeKey.value = graphNode?.service?.key ?? params.data.nodeKey
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
      return
    }
    if (menuNodeKey.value) {
      menuNodeKey.value = ''
      return
    }
    if (selectedEdgeKey.value) {
      selectedEdgeKey.value = ''
    }
    // Blank canvas: dismiss transient UI only; stay in inspect until Back to overview.
  }

  function onChartMouseOver(params: { dataType?: string; data?: { nodeKey?: string } }) {
    if (menuNodeKey.value) {
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
    applyActiveFlow(params.data?.nodeKey ?? '')
  }

  function onChartMouseOut() {
    hoveredNodeKey.value = ''
    canvasRef.value?.classList.remove('service-map-canvas--flow')
  }

  async function copyServiceName() {
    const node = menuNode.value ?? selectedNode.value
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

  onMounted(() => {
    updateChartSize()
    if (canvasRef.value) {
      chartResizeObserver = new ResizeObserver(updateChartSize)
      chartResizeObserver.observe(canvasRef.value)
    }
    window.addEventListener('keydown', onEscape)
    document.addEventListener('pointerdown', handleDocumentPointerDown)
  })
  onUnmounted(() => {
    requestId += 1
    stop()
    chartResizeObserver?.disconnect()
    window.removeEventListener('keydown', onEscape)
    document.removeEventListener('pointerdown', handleDocumentPointerDown)
  })
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
  .service-map-counts {
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-sm);
  }
  .service-map-active-node {
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-sm);
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .service-map-truncated,
  .service-map-error {
    margin: 0 var(--gpt-page-padding-x) var(--gpt-gap-md);
  }
  .service-map-content {
    display: flex;
    flex: 1 1 0%;
    justify-content: center;
    min-height: 0;
    overflow: hidden;
  }
  .service-map-canvas {
    position: relative;
    flex: 1 1 0%;
    min-width: 0;
    min-height: 360px;
  }
  .service-map-canvas--focused {
    flex: 0 1 auto;
    width: 100%;
    align-self: stretch;
  }
  .service-map-chart {
    width: 100%;
    height: 100%;
    min-height: 360px;
  }
  @keyframes service-map-flow {
    to {
      stroke-dashoffset: -24;
    }
  }
  .service-map-canvas--flow {
    :deep(path[stroke-dasharray]),
    :deep(path[style*='stroke-dasharray']) {
      animation: service-map-flow 2.2s linear infinite;
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
  .service-map-legend__database {
    border: 2px dashed var(--gpt-semantic-field);
  }
</style>
