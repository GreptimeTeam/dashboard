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
        span.drilldown-toolbar__group
          a-checkbox(v-model="showTopologyNodes") {{ t('drilldown.serviceMap.topologyNodes') }}
        span.service-map-counts(v-if="!loading")
          | {{ t('drilldown.serviceMap.counts', { nodes: callGraphCounts.nodes, edges: callGraphCounts.edges }) }}
        span.service-map-counts(v-else-if="graphNodes.length")
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
        .service-map-state(v-if="loading && !graphNodes.length")
          a-spin(:size="32")
          span {{ t('drilldown.serviceMap.loading') }}
        a-empty.service-map-state(v-else-if="!loading && !graphNodes.length" :description="emptyDescription")
        VChart.service-map-chart(
          v-if="graphNodes.length"
          ref="chartRef"
          :option="chartOption"
          :autoresize="true"
          :init-options="{ renderer: 'svg' }"
          @click="onChartClick"
          @mouseover="onChartMouseOver"
          @mouseout="onChartMouseOut"
          @globalout="onChartGlobalOut"
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
            v-if="!menuNode.virtual && menuNode.type === 'service'"
            type="button"
            role="menuitem"
            @click="openSignal('traces')"
          )
            | {{ t('drilldown.serviceMap.viewTraces') }}
          button.service-map-node-action(
            v-if="!menuNode.virtual && menuNode.type === 'service' && logsServiceReady"
            type="button"
            role="menuitem"
            @click="openSignal('logs')"
          )
            | {{ t('drilldown.serviceMap.viewLogs') }}
        .service-map-legend(v-if="graphNodes.length")
          .service-map-legend__group
            span.service-map-legend__item
              i.service-map-legend__service(
                :style="{ backgroundColor: graphTheme.palette[0].fill, borderColor: graphTheme.ok }"
              )
              | {{ t('drilldown.serviceMap.serviceNode') }}
            span.service-map-legend__item(v-if="hasDatabaseEndpoints")
              i.service-map-legend__database(
                :style="{ backgroundColor: withAlpha(graphTheme.database, isDark ? 0.22 : 0.12), borderColor: graphTheme.database }"
              )
              | {{ t('drilldown.serviceMap.databaseEndpoint') }}
            span.service-map-legend__item(v-if="hasVirtualServiceEndpoints")
              i.service-map-legend__external(
                :style="{ backgroundColor: withAlpha(graphTheme.external, isDark ? 0.2 : 0.1), borderColor: graphTheme.external }"
              )
              | {{ t('drilldown.serviceMap.virtualEndpoint') }}
            span.service-map-legend__item(v-if="hasInstanceSatellites")
              i.service-map-legend__instance(
                :style="{ backgroundColor: withAlpha(graphTheme.instance, isDark ? 0.28 : 0.14), borderColor: graphTheme.instance }"
              )
              | {{ t('drilldown.serviceMap.instanceNode') }}
            span.service-map-legend__item(v-if="hasContainerSatellites")
              i.service-map-legend__container(
                :style="{ backgroundColor: withAlpha(graphTheme.container, isDark ? 0.28 : 0.14), borderColor: graphTheme.container }"
              )
              | {{ t('drilldown.serviceMap.containerNode') }}
          .service-map-legend__group.service-map-legend__group--health
            span.service-map-legend__group-label {{ t('drilldown.serviceMap.healthLegend') }}
            span.service-map-legend__item
              i.service-map-legend__health(:style="{ borderColor: graphTheme.ok }")
              | {{ t('drilldown.serviceMap.healthOk') }}
            span.service-map-legend__item
              i.service-map-legend__health(:style="{ borderColor: graphTheme.danger }")
              | {{ t('drilldown.serviceMap.healthDanger') }}
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
  import { fetchServiceMap, fetchServiceMapInstanceCount } from '@/observability/adapters/service-map/fetch'
  import {
    buildServiceMapDisplayGraph,
    buildServiceMapFacets,
    buildServiceMapScopeFacet,
  } from '@/observability/adapters/service-map/graph'
  import { buildServiceMapOverviewLayout } from '@/observability/adapters/service-map/layout'
  import { aggregateNodeCallStats, isCallEdge } from '@/observability/adapters/service-map/metrics'
  import type { ServiceMapFilters, ServiceMapResult } from '@/observability/adapters/service-map/types'
  import { isStructuralEntityType } from '@/observability/traces/service-map-queries'
  import { buildServiceMapChartOption, buildServiceMapSeries, type ServiceMapChartInput } from './chart-option'
  import { resolveServiceMapTheme, withAlpha } from './chart-theme'
  import { parseServiceMapUrlQuery, serializeServiceMapUrlQuery } from './url-state'

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
  const menuNodeKey = ref('')
  const menuPosition = ref({ x: 0, y: 0 })
  const facetFilters = ref<ServiceMapFilters>({})
  const expandedClusters = ref<Set<string>>(new Set())
  /** When on, show instance/container satellites for all real services. Default off. */
  const showTopologyNodes = ref(false)
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
      const next = await fetchServiceMap(
        ctx,
        (partial) => {
          if (currentRequest === requestId) result.value = partial
        },
        { showTopology: showTopologyNodes.value }
      )
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
      showTopologyNodes.value,
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
  /** Toolbar counts are call-graph only — exclude topology satellites and structural edges. */
  const callGraphCounts = computed(() => ({
    nodes: graphNodes.value.filter((node) => !isStructuralEntityType(node.type)).length,
    edges: graphEdges.value.filter(isCallEdge).length,
  }))
  /** Keep small neighborhoods compact; expand toward full width as neighbors grow. */
  const focusCanvasStyle = computed(() => {
    if (!inspectedNodeKey.value) return undefined
    const count = Math.max(1, graphNodes.value.length)
    if (count >= 12) return undefined
    const maxWidth = Math.max(480, Math.min(880, 280 + count * 72))
    return { maxWidth: `${maxWidth}px` }
  })
  // Inspect and overview share one layout rule; neighborhood filtering is in display-graph.
  const communityLayout = computed(() => {
    const { width, height } = chartSize.value
    return buildServiceMapOverviewLayout(graphNodes.value, graphEdges.value, width, height)
  })
  const graphNodeMap = computed(() => new Map(graphNodes.value.map((node) => [node.key, node])))
  const hasDatabaseEndpoints = computed(() =>
    graphNodes.value.some((node) => node.virtual && node.connectionType === 'database')
  )
  const hasVirtualServiceEndpoints = computed(() =>
    graphNodes.value.some((node) => node.virtual && node.connectionType !== 'database')
  )
  const hasInstanceSatellites = computed(() =>
    graphNodes.value.some((node) => !node.virtual && (node.type === 'service.instance' || node.type === 'k8s.pod'))
  )
  const hasContainerSatellites = computed(() =>
    graphNodes.value.some(
      (node) =>
        !node.virtual &&
        isStructuralEntityType(node.type) &&
        node.type !== 'service.instance' &&
        node.type !== 'k8s.pod'
    )
  )
  const nodeCallStats = computed(() => aggregateNodeCallStats(graphEdges.value))
  const trafficLegend = computed(() => {
    const traffics = [...nodeCallStats.value.values()].map((stats) => stats.traffic)
    return {
      min: traffics.length ? Math.min(...traffics) : 0,
      max: traffics.length ? Math.max(...traffics) : 0,
    }
  })
  const truncated = computed(() => result.value.truncated)
  function themeToken(name: string, fallback: string): string {
    const styles = getComputedStyle(canvasRef.value ?? document.documentElement)
    return styles.getPropertyValue(name).trim() || fallback
  }

  const graphTheme = computed(() => resolveServiceMapTheme(themeToken, isDark.value))

  function sameStringList(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index])
  }

  // Hydrate once from the URL. Do not keep a route→state watcher — that loop was
  // clearing selections when drilldown URL sync rewrote the query without our keys.
  const hydrated = parseServiceMapUrlQuery(route.query)
  selectedServices.value = hydrated.services
  selectedScopes.value = hydrated.scopes
  facetFilters.value = hydrated.filters

  function writeServiceMapQuery() {
    const { serviceMapSearch, serviceMapScope, serviceMapFilters } = serializeServiceMapUrlQuery({
      services: selectedServices.value,
      scopes: selectedScopes.value,
      filters: facetFilters.value,
    })
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

  function nodeLabel(key: string): string {
    return graphNodeMap.value.get(key)?.label ?? nodeMap.value.get(key)?.label ?? key
  }
  function queryRangeSeconds(): number {
    const range = ctx.query.unixTimeRange()
    return range.length === 2 ? Math.max(1, range[1] - range[0]) : 1
  }
  function chartInput(): ServiceMapChartInput {
    return {
      nodes: graphNodes.value,
      edges: graphEdges.value,
      layout: communityLayout.value,
      stats: nodeCallStats.value,
      trafficRange: trafficLegend.value,
      theme: graphTheme.value,
      isDark: isDark.value,
      rangeSeconds: queryRangeSeconds,
    }
  }

  /**
   * Base option must NOT depend on hoveredNodeKey — rebuilding option while the pointer is
   * over a graphic remounts it and drops mouseout (edge hover stuck). Node flow is patched
   * via setOption in syncNodeFlowOverlay instead.
   */
  const chartOption = computed(() => buildServiceMapChartOption(chartInput(), { t, labelFor: nodeLabel }))

  function syncNodeFlowOverlay() {
    const chart = chartRef.value
    if (!chart?.setOption) return
    const { nodes, links } = buildServiceMapSeries(chartInput(), hoveredNodeKey.value)
    chart.setOption({ series: [{ data: nodes, links }] }, { lazyUpdate: true })
  }

  watch(hoveredNodeKey, () => {
    nextTick(syncNodeFlowOverlay)
  })
  // Base option updates wipe the overlay; re-apply while a node is still hovered.
  watch(chartOption, () => {
    if (!hoveredNodeKey.value) return
    nextTick(syncNodeFlowOverlay)
  })

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
    const width = canvasRef.value.clientWidth
    const height = canvasRef.value.clientHeight
    // ResizeObserver can fire without a real size change; avoid layout/option churn.
    if (chartSize.value.width === width && chartSize.value.height === height) return
    chartSize.value = { width, height }
  }

  watch([inspectedNodeKey, () => graphNodes.value.length, focusCanvasStyle], async () => {
    await nextTick()
    updateChartSize()
  })

  function positionMenu(anchor: { x: number; y: number }) {
    const width = canvasRef.value?.clientWidth ?? 0
    const height = canvasRef.value?.clientHeight ?? 0
    const menuWidth = 240
    const menuHeight = 180
    const gap = 18
    const preferredX = anchor.x + gap
    const x = preferredX + menuWidth <= width - 8 ? preferredX : anchor.x - menuWidth - gap
    menuPosition.value = {
      x: Math.max(8, Math.min(x, Math.max(8, width - menuWidth - 8))),
      y: Math.max(8, Math.min(anchor.y - 16, Math.max(8, height - menuHeight - 8))),
    }
  }

  function canvasOffsetFromEvent(params: { event?: { offsetX?: number; offsetY?: number; event?: MouseEvent } }): {
    x: number
    y: number
  } {
    const nativeEvent = params.event?.event
    const canvasBounds = canvasRef.value?.getBoundingClientRect()
    if (nativeEvent && canvasBounds) {
      return { x: nativeEvent.clientX - canvasBounds.left, y: nativeEvent.clientY - canvasBounds.top }
    }
    return {
      x: params.event?.offsetX ?? nativeEvent?.offsetX ?? 0,
      y: params.event?.offsetY ?? nativeEvent?.offsetY ?? 0,
    }
  }

  async function inspectNodeByKey(nodeKey: string) {
    const node = nodeMap.value.get(nodeKey)
    inspectedNodeKey.value = nodeKey
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

  async function inspectNode() {
    if (!menuNodeKey.value) return
    await inspectNodeByKey(menuNodeKey.value)
  }

  function onChartClick(params: {
    dataType?: string
    data?: { nodeKey?: string; edgeKey?: string }
    event?: { offsetX?: number; offsetY?: number; event?: MouseEvent }
  }) {
    clearChartActiveState()
    if (params.dataType === 'edge') {
      // Edges only expose RED via hover tooltip — no click menu.
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
        menuNodeKey.value = ''
        return
      }
      // Left-click opens the action menu (Datadog Service Map). Leave right-click to the browser.
      menuNodeKey.value = graphNode?.service?.key ?? params.data.nodeKey
      positionMenu(canvasOffsetFromEvent(params))
      return
    }
    if (menuNodeKey.value) {
      menuNodeKey.value = ''
    }
    // Blank canvas: dismiss transient UI only; stay in inspect until Back to overview.
  }

  function onChartMouseOver(params: { dataType?: string; data?: { nodeKey?: string; edgeKey?: string } }) {
    if (menuNodeKey.value) {
      chartRef.value?.dispatchAction({ type: 'downplay', seriesIndex: 0 })
      return
    }
    if (params.dataType === 'node') {
      applyActiveFlow(params.data?.nodeKey ?? '')
      return
    }
    // Leaving a node onto an edge/blank: drop flow dimming. Edge highlight is native emphasis.
    if (hoveredNodeKey.value) {
      hoveredNodeKey.value = ''
      canvasRef.value?.classList.remove('service-map-canvas--flow')
    }
  }

  function onChartMouseOut(params?: { dataType?: string }) {
    // Only clear node flow when leaving a node; edge emphasis is cleared by ECharts itself.
    if (!params || params.dataType === 'node') {
      hoveredNodeKey.value = ''
      canvasRef.value?.classList.remove('service-map-canvas--flow')
    }
  }

  function onChartGlobalOut() {
    clearChartActiveState()
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
        serviceMapScope: undefined,
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
  // Only animate edge polylines (fill none). Dashed node borders also use
  // stroke-dasharray and must stay static.
  .service-map-canvas--flow {
    :deep(path[stroke-dasharray][fill='none']),
    :deep(path[stroke-dasharray][fill='NONE']),
    :deep(path[style*='stroke-dasharray'][fill='none']),
    :deep(path[style*='stroke-dasharray'][style*='fill:none']),
    :deep(path[style*='stroke-dasharray'][style*='fill: none']) {
      animation: service-map-flow 2.2s linear infinite;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .service-map-canvas--flow {
      :deep(path[stroke-dasharray][fill='none']),
      :deep(path[stroke-dasharray][fill='NONE']),
      :deep(path[style*='stroke-dasharray'][fill='none']),
      :deep(path[style*='stroke-dasharray'][style*='fill:none']),
      :deep(path[style*='stroke-dasharray'][style*='fill: none']) {
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
    align-items: center;
    gap: var(--gpt-gap-md) var(--gpt-gap-lg);
    padding: var(--gpt-gap-sm) var(--gpt-gap-md);
    border: 1px solid var(--gpt-border-primary);
    border-radius: var(--gpt-radius-md);
    background: var(--gpt-bg-primary);
    box-shadow: var(--gpt-shadow-sm);
  }
  .service-map-legend__group {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--gpt-gap-md);
  }
  .service-map-legend__group--health {
    padding-left: var(--gpt-gap-md);
    border-left: 1px solid var(--gpt-border-primary);
  }
  .service-map-legend__group-label {
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-xs);
    font-weight: 500;
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
    border: 2px solid var(--gpt-success, #22c55e);
  }
  .service-map-legend__external {
    border: 2px dashed var(--gpt-semantic-tag);
  }
  .service-map-legend__database {
    border: 2px dashed var(--gpt-semantic-field);
  }
  .service-map-legend__instance {
    width: 9px;
    height: 9px;
    border: 1.5px dashed var(--gpt-brand-700, #5a4a70);
    border-radius: 1px;
    transform: rotate(45deg);
  }
  .service-map-legend__container {
    width: 10px;
    height: 8px;
    border: 1.5px dashed var(--gpt-accent-ts, #00bbb2);
    border-radius: 2px;
  }
  .service-map-legend__health {
    border: 2.5px solid var(--gpt-success, #22c55e);
    background: transparent;
  }
</style>
