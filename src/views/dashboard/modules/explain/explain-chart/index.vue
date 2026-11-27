<template lang="pug">
.explain-chart(:id="`explain-chart-stage-${index}`")
  .chart-main
    .chart-scroll-container
      .chart-container.grab-bing(ref="chartContainer")
        TreeView(
          ref="treeView"
          :data="filteredData"
          :scale-data="data"
          :active-node-index="activeNodeIndex"
          :selected-metric="selectedMetric"
          :metrics-expanded="metricsExpanded"
          :stage-index="index"
          @update:active-node-index="updateActiveNode"
          @svgCreated="handleSvgCreated"
        )
      .controls-wrapper
        ZoomControls(ref="zoomControls" :tree-container="treeContainerRef")
        NavigationArrows(
          v-if="availableNodes.length > 1"
          :available-nodes="availableNodes"
          :active-node-index="activeNodeIndex"
          @prev="navigateToPrevNode"
          @next="navigateToNextNode"
        )
</template>

<script lang="ts" setup name="ExplainChart">
  import * as d3 from 'd3'

  const props = withDefaults(
    defineProps<{
      data: any[] // This is an array of rows from getStages
      index: number
      // Root operator to draw when the stage has several roots; empty draws all plans.
      rootPlan?: string
      // Node ids to draw; empty draws all nodes.
      selectedNodes?: number[]
      selectedMetric?: string
      metricsExpanded?: boolean
    }>(),
    { rootPlan: '', selectedNodes: () => [], selectedMetric: '', metricsExpanded: false }
  )

  const chartContainer = ref<HTMLDivElement | null>(null)
  const activeNodeIndex = ref<number>(0)
  const treeView = ref<{
    treeContainer: HTMLDivElement | null
    getNodeTreeRect: (nodeIndex: number) => { minX: number; maxX: number; width: number } | null
  } | null>(null)
  const zoomControls = ref<{
    applyZoom: (svg: any, preservedTransform: any) => void
    getLastTransform: () => any
    handleResetZoom: () => void
    scrollToTransform: (transform: d3.ZoomTransform) => void
  } | null>(null)
  const componentId = computed(() => `explain-chart-stage-${props.index}`)

  // Computed property for treeContainer to pass to zoom controls
  const treeContainerRef = computed(() => treeView.value?.treeContainer || null)

  // Draw only the selected root plan / nodes (parent owns the selection).
  const filteredData = computed(() => {
    if (!props.data || props.data.length === 0) return []
    const nodeFilter = props.selectedNodes.length ? new Set(props.selectedNodes) : null
    return props.data.filter((row) => {
      const [, nodeIndex, planStr] = row
      if (nodeFilter && !nodeFilter.has(nodeIndex)) return false
      if (!props.rootPlan) return true
      if (!planStr || typeof planStr !== 'string' || !planStr.startsWith('{')) return false
      try {
        return JSON.parse(planStr)?.name === props.rootPlan
      } catch {
        return false
      }
    })
  })

  // Get all available nodes from the filtered data
  const availableNodes = computed(() => {
    if (!filteredData.value || filteredData.value.length === 0) return []
    return [...new Set(filteredData.value.map((row) => row[1]))].sort((a, b) => a - b)
  })

  // Handle SVG created event from tree-view
  function handleSvgCreated({ svg }: { svg: any }) {
    if (zoomControls.value) {
      // Get preserved transform from zoom controls
      const preservedTransform = zoomControls.value.getLastTransform()
      zoomControls.value.applyZoom(svg, preservedTransform)
    }
  }

  // Calculate and apply scroll transform to navigate to a node tree
  function scrollToNodeTree(nodeIndex: number) {
    if (!treeView.value?.treeContainer || !zoomControls.value) return

    const svg = d3.select(treeView.value.treeContainer).select('svg').node() as SVGSVGElement | null
    if (!svg) return

    const currentTransform = d3.zoomTransform(svg)

    // Get the target nodeTree's rect (coordinates are in SVG space)
    const targetTreeRect = treeView.value.getNodeTreeRect(nodeIndex)
    if (!targetTreeRect) return

    // Calculate where the target tree's left edge should be positioned
    // We want it to appear at 20px from the left edge of the viewport
    const targetLeftInViewport = 20

    // targetTreeRect.minX is already in SVG coordinate space
    // In viewport space: targetLeftInViewport = targetTreeRect.minX * scale + transform.x
    // Solving for transform.x: transform.x = targetLeftInViewport - targetTreeRect.minX * scale
    const newX = targetLeftInViewport - targetTreeRect.minX * currentTransform.k

    // Apply the transform via zoom-controls
    const newTransform = d3.zoomIdentity.translate(newX, currentTransform.y).scale(currentTransform.k)
    zoomControls.value.scrollToTransform(newTransform)
  }

  function scrollToNode(nodeIdx) {
    const root = `#${componentId.value}`
    const previousNodeId = activeNodeIndex.value
    activeNodeIndex.value = nodeIdx

    // foreignObject card HTML is static until re-render — toggle active classes in DOM.
    if (previousNodeId !== null && previousNodeId !== nodeIdx) {
      d3.selectAll(`${root} .node.node-${previousNodeId} .plan-card`).classed('active-card', false)
      d3.selectAll(`${root} .node-label-group.node-${previousNodeId} .node-label-rect`).classed('active', false)
      d3.selectAll(`${root} .node-label-group.node-${previousNodeId}`).classed('active-node-label', false)
    }

    d3.selectAll(`${root} .node.node-${nodeIdx} .plan-card`).classed('active-card', true)
    d3.selectAll(`${root} .node-label-group.node-${nodeIdx} .node-label-rect`).classed('active', true)
    d3.selectAll(`${root} .node-label-group.node-${nodeIdx}`).classed('active-node-label', true)

    scrollToNodeTree(nodeIdx)
  }

  function navigateToPrevNode() {
    if (activeNodeIndex.value === null || activeNodeIndex.value === undefined) return

    const currentIndex = availableNodes.value.indexOf(activeNodeIndex.value)
    if (currentIndex > 0) {
      scrollToNode(availableNodes.value[currentIndex - 1])
    }
  }

  function navigateToNextNode() {
    if (activeNodeIndex.value === null || activeNodeIndex.value === undefined) return

    const currentIndex = availableNodes.value.indexOf(activeNodeIndex.value)
    if (currentIndex < availableNodes.value.length - 1) {
      scrollToNode(availableNodes.value[currentIndex + 1])
    }
  }

  const getPlanNameTree = (planStr: string) => {
    try {
      const walk = (node: any): { name?: string; children: any[] } => ({
        name: node?.name,
        children: Array.isArray(node?.children) ? node.children.map(walk) : [],
      })
      return JSON.stringify(walk(JSON.parse(planStr)))
    } catch {
      return typeof planStr === 'string' ? planStr : ''
    }
  }

  // Same stage/node/operator topology (ignore live metric value changes).
  const isSamePlanStructure = (newData: any[], oldData: any[]) => {
    if (!newData || !oldData) return newData === oldData
    if (newData.length !== oldData.length) return false
    return newData.every((newRow, index) => {
      const oldRow = oldData[index]
      return (
        newRow[0] === oldRow[0] && newRow[1] === oldRow[1] && getPlanNameTree(newRow[2]) === getPlanNameTree(oldRow[2])
      )
    })
  }

  // Live metrics refresh rebuilds the tree but must keep pan/zoom.
  // Only reset the camera when this stage's plan topology changes
  // (e.g. root plan or node filter change). Stage tabs keep separate chart instances, so
  // switching stages no longer remounts or resets this state.
  watch(
    () => filteredData.value,
    (newData, oldData) => {
      const nodes = availableNodes.value
      if (!nodes.includes(activeNodeIndex.value)) {
        activeNodeIndex.value = nodes[0] ?? 0
      }

      const structureChanged = !oldData || !isSamePlanStructure(newData, oldData)
      if (!structureChanged) return

      if (oldData) {
        zoomControls.value?.handleResetZoom()
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    if (chartContainer.value) {
      d3.select(chartContainer.value).selectAll('*').on('*', null)
    }
  })

  // Handle active node updates
  function updateActiveNode(nodeIndex) {
    activeNodeIndex.value = nodeIndex
    // Also perform scrolling/highlighting to mirror direct scroll actions
    scrollToNode(nodeIndex)
  }
</script>

<style lang="less">
  .explain-chart {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-md);
    background: var(--gpt-bg-panel);
    box-shadow: var(--gpt-shadow-sm);

    .chart-main {
      flex: 1;
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .controls-wrapper {
      position: absolute;
      bottom: 10px;
      left: 0;
      width: 100%;
      display: flex;
      justify-content: center;
      z-index: 10;
      pointer-events: none;

      > * {
        pointer-events: auto;
      }
    }

    .chart-scroll-container {
      flex: 1;
      position: relative;
      overflow: hidden;
      min-height: 0;
    }

    .chart-container {
      flex: 1;
      position: relative;
      height: 100%;
      cursor: grab;
      display: flex;
      justify-content: center;
      align-items: center;

      &:active {
        cursor: grabbing;
      }

      .explain-svg {
        width: 100%;
        height: 100%;
      }
    }

    .zoom-controls {
      position: absolute;
      bottom: 10px;
      right: 10px;
      background-color: var(--card-bg-color);
      border-radius: var(--gpt-radius-sm);
      padding: 4px;
      box-shadow: 0 2px 5px var(--box-shadow-color);
      z-index: 10;
      display: flex;
      gap: 4px;
    }

    .navigation-arrows {
      position: absolute;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
    }

    .zoom-controls,
    .navigation-arrows {
      pointer-events: auto;
    }
  }

  .plan-node-container {
    width: 100%;
    margin-bottom: 10px; /* Space below the container */
  }

  .plan-card {
    width: auto;
    min-width: 200px;
    // A root param can be long; cap the card so it does not stretch the whole tree layout.
    max-width: 320px;
    background-color: var(--card-bg-color);
    border: 1px solid var(--border-color);
    border-radius: var(--gpt-radius-sm);
    padding: 8px;
    box-shadow: 0 2px 5px var(--box-shadow-color);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: height 0.3s ease;

    &.active-card {
      box-shadow: 0 0 10px var(--box-shadow-color);
    }

    .plan-header {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      min-width: 0;
      margin-bottom: 8px;
    }

    .plan-name {
      font-weight: bold;
      color: var(--main-font-color);
      font-size: var(--gpt-font-md);
    }

    .plan-ordinal {
      margin-left: 6px;
      color: var(--third-font-color);
      font-weight: normal;
    }

    .plan-param {
      max-width: 100%;
      min-width: 0;
      color: var(--small-font-color);
      font-size: var(--gpt-font-md);
      word-break: break-all;
      // Two lines at most; the full text is in the title attribute.
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .key-metrics {
      margin-bottom: 8px;
      border-bottom: 1px dashed var(--border-color);
      padding-bottom: 8px;
    }

    .key-duration {
      font-family: var(--font-mono);
      font-size: var(--gpt-font-md);
      font-weight: 600;
      color: var(--main-font-color);
      white-space: nowrap;
    }

    .key-rows {
      margin-top: 2px;
      font-family: var(--font-mono);
      font-size: var(--gpt-font-sm);
      color: var(--third-font-color);
      white-space: nowrap;
    }

    .key-metrics-bar {
      height: 3px;
      margin-top: 4px;
      background-color: var(--grey-bg-color);
      border-radius: 2px;
      overflow: hidden;
    }

    .key-metrics-bar-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .plan-metrics {
      font-size: var(--gpt-font-md);
      color: var(--small-font-color);
      overflow-y: auto;
      flex: 1;
    }

    .metric-item {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
    }

    .metric-key {
      color: var(--third-font-color);
      margin-right: 8px;
    }

    .metric-value {
      font-family: var(--font-mono);
      color: var(--main-font-color);
      flex-shrink: 0;
    }
  }

  .tree-group {
    opacity: 0.9;
    transition: opacity 0.3s;
    overflow: visible !important;

    &:hover {
      opacity: 1;
    }

    &.active-tree {
      opacity: 1;
    }

    g {
      overflow: visible !important;
    }
  }

  .node {
    z-index: 2;
    overflow: visible !important;
  }

  /* Ensure SVG container is properly handling overflow */
  svg {
    overflow: visible !important;
  }

  /* Add missing styles */
  .node-index-card {
    cursor: pointer;
  }

  foreignObject {
    overflow: visible !important;
  }
</style>
