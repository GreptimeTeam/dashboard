<template lang="pug">
.explain-chart(:id="`explain-chart-stage-${index}`")
  .header
    .stage-navigation
      a-radio-group(v-model="localStageIndex" type="button" @change="onStageChange")
        a-radio(v-for="i in totalStages" :key="i - 1" :value="i - 1") Stage {{ i - 1 }}
    ChartControls(
      v-model:highlight-type="highlightType"
      v-model:selected-metric="selectedMetric"
      v-model:metrics-expanded="metricsExpanded"
      :available-nodes="availableNodes"
      :active-node-index="activeNodeIndex"
      :max-rows="maxRows"
      :max-duration="maxDuration"
      :available-metrics="availableMetrics"
      :stage-index="index"
      @node-selected="scrollToNode"
    )
  .chart-scroll-container
    .chart-container.grab-bing(ref="chartContainer")
      TreeView(
        ref="treeView"
        :data="data"
        :active-node-index="activeNodeIndex"
        :highlight-type="highlightType"
        :selected-metric="selectedMetric"
        :metrics-expanded="metricsExpanded"
        :max-rows="maxRows"
        :max-duration="maxDuration"
        :stage-index="index"
        @update:active-node-index="updateActiveNode"
        @node-positions-updated="updateNodePositions"
        @nodes-data-updated="updateNodesData"
      )
    .controls-wrapper
      ZoomControls(@zoom-in="zoomIn" @zoom-out="zoomOut" @reset-zoom="resetZoom")
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
  import { createVNode, render, h } from 'vue'
  import { flextree } from 'd3-flextree'
  import PlanCard from './plan-card.vue'
  import { CARD_DIMENSIONS, NODE_INDEX_CARD, getProgressColor, formatMetricName } from '../utils'

  interface FlexHierarchyPointNode extends d3.HierarchyPointNode<any> {
    xSize: number
    ySize: number
  }

  interface FlexHierarchyPointLink {
    source: FlexHierarchyPointNode
    target: FlexHierarchyPointNode
  }

  const props = defineProps<{
    data: any[] // This is an array of rows from getStages
    index: number
    totalStages: number // Add this prop to know total number of stages
  }>()

  const emit = defineEmits(['changeStage'])

  const chartContainer = ref<HTMLDivElement | null>(null)
  const metricsExpanded = ref(false)
  const selectedMetric = ref<string>('')
  const activeNodeIndex = ref<number>(0)
  const highlightType = ref<string>('DURATION') // Highlight type: NONE, ROWS, DURATION
  const nodesData = ref([])
  const treeView = ref(null)
  const componentId = computed(() => `explain-chart-stage-${props.index}`)

  // Zoom and pan states
  const transform = ref('translate(0,0) scale(1)')
  const scale = ref(1)
  const minScale = 0.1
  const maxScale = 3

  // Node positions for scrolling
  const nodePositions = ref<Map<number, number>>(new Map())

  // Track max values for metrics
  const maxRows = ref(0)
  const maxDuration = ref(0)

  // Check if we have rows and duration metrics
  const hasPlanRows = computed(() => maxRows.value > 0)
  const hasDurationMetrics = computed(() => maxDuration.value > 0)

  const availableMetrics = computed(() => {
    const metricKeys = new Set()

    // Process all nodes from all plans to collect unique metric keys
    nodesData.value.forEach(({ plan }) => {
      function traverseNode(node) {
        // Add metrics from this node
        if (node.metrics) {
          Object.keys(node.metrics).forEach((key) => {
            // Skip the metrics we already show in progress bars
            if (!['output_rows', 'elapsed_compute', 'outputRows', 'elapsedCompute'].includes(key)) {
              metricKeys.add(key)
            }
          })
        }

        // Process children
        if (node.children) {
          node.children.forEach(traverseNode)
        }
      }

      traverseNode(plan)
    })

    return Array.from(metricKeys)
      .sort()
      .map((key) => ({
        value: key,
        label: formatMetricName(key.toString()),
      }))
  })

  // Get all available nodes from the data
  const availableNodes = computed(() => {
    if (!props.data || props.data.length === 0) return []
    return [...new Set(props.data.map((row) => row[1]))].sort((a, b) => a - b)
  })

  // Create the zoom behavior
  const zoomListener = computed(() => {
    return d3
      .zoom()
      .scaleExtent([minScale, maxScale])
      .on('zoom', (event) => {
        const g = d3.select(chartContainer.value).select('svg > g')
        g.attr('transform', event.transform)
        transform.value = event.transform
        scale.value = event.transform.k
      })
  })

  function applyZoom(svg) {
    // Set explicit dimensions first
    svg
      .attr('width', chartContainer.value?.clientWidth || 800)
      .attr('height', chartContainer.value?.clientHeight || 600)
      .attr('viewBox', null)

    // Apply zoom behavior with a reasonable initial scale
    svg.call(zoomListener.value)

    // Set an initial transform with scale 0.7 instead of 0.1
    svg.call(zoomListener.value.transform, d3.zoomIdentity.translate(svg.attr('width') / 4, 50).scale(0.7))
  }

  function getSvgAndGroup() {
    if (!chartContainer.value) return { svg: null, group: null }
    const svg = d3.select(chartContainer.value).select('svg')
    const group = svg.select('g') // Main transform group
    return { svg, group }
  }

  // Zoom in function
  function zoomIn() {
    if (treeView.value) treeView.value.zoomIn()
  }

  // Zoom out function
  function zoomOut() {
    if (treeView.value) treeView.value.zoomOut()
  }

  // Process raw data into node-specific data
  function processNodesData(data) {
    const nodeMap = new Map()

    // Group by node
    data.forEach((row) => {
      const nodeIdx = row[1]
      const planData = JSON.parse(row[2])
      nodeMap.set(nodeIdx, {
        nodeIndex: nodeIdx,
        plan: planData,
      })
    })

    return Array.from(nodeMap.values())
  }

  function toHierarchy(plan, nodeIndex) {
    return {
      name: plan.name || 'Root',
      nodeIndex,
      metrics: {
        ...(plan.metrics || {}),
        // Add both camelCase and snake_case for flexibility
        outputRows: plan.output_rows,
        output_rows: plan.output_rows,
        elapsedCompute: plan.elapsed_compute,
        elapsed_compute: plan.elapsed_compute,
      },
      children: (plan.children || []).map((child) => toHierarchy(child, nodeIndex)),
    }
  }

  // Helper function to calculate metrics lines
  function calculateMetricsLines(nodeMetrics, hasMetrics) {
    if (!metricsExpanded.value || !nodeMetrics) {
      return hasMetrics ? 1 : 0
    }

    return Object.keys(nodeMetrics).filter(
      (k) => !['output_rows', 'elapsed_compute', 'outputRows', 'elapsedCompute'].includes(k)
    ).length
  }

  // Helper function to calculate card height
  function calculateCardHeight(hasProgressBar, hasMetrics, metricsLines) {
    const baseHeight = CARD_DIMENSIONS.minHeight
    const progressHeight = hasProgressBar ? CARD_DIMENSIONS.progressBarHeight : 0

    let metricsHeight = 0
    if (hasMetrics) {
      if (metricsExpanded.value) {
        metricsHeight =
          Math.min(metricsLines * CARD_DIMENSIONS.metricLineHeight, 80) + CARD_DIMENSIONS.expandedBaseHeight
      } else {
        metricsHeight = CARD_DIMENSIONS.singleMetricHeight
      }
    }

    return baseHeight + progressHeight + metricsHeight
  }

  // Update the node size in the hierarchy
  function updateNodeSize(node, width, height) {
    // Store the size in the node data
    if (node) {
      node.size = [width, height]
    }
  }

  function resetZoom() {
    if (treeView.value) treeView.value.resetZoom()
  }

  // Add this function to better handle resize events
  function setContainerDimensions() {
    if (!chartContainer.value) return

    chartContainer.value.getBoundingClientRect()

    // Also update SVG dimensions
    const svg = d3.select(chartContainer.value as HTMLDivElement).select('svg')
    if (!svg.empty()) {
      svg.attr('width', chartContainer.value.clientWidth).attr('height', chartContainer.value.clientHeight)
    }
  }

  // Call this function in the handleResize function
  function handleResize() {
    if (treeView.value) {
      // Let the tree view handle resize operations
      nextTick(() => resetZoom())
    }
  }

  // Add this function to your script section

  function calculateMaxMetrics() {
    if (!props.data || props.data.length === 0) return

    let maxRowsValue = 0
    let maxDurationValue = 0

    // Recursive function to traverse the plan tree
    function traverseNode(node) {
      // Check for rows metric
      const outputRows = node.output_rows || node.outputRows || 0
      maxRowsValue = Math.max(maxRowsValue, outputRows)

      // Check for duration metric
      const elapsedCompute = node.elapsed_compute || node.elapsedCompute || 0
      maxDurationValue = Math.max(maxDurationValue, elapsedCompute)

      // Check metrics object if present
      if (node.metrics) {
        const { metrics } = node
        if (metrics.output_rows || metrics.outputRows) {
          maxRowsValue = Math.max(maxRowsValue, metrics.output_rows || metrics.outputRows)
        }
        if (metrics.elapsed_compute || metrics.elapsedCompute) {
          maxDurationValue = Math.max(maxDurationValue, metrics.elapsed_compute || metrics.elapsedCompute)
        }
      }

      // Process children
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(traverseNode)
      }
    }

    // Process each node's plan data
    props.data.forEach((row) => {
      try {
        const planData = JSON.parse(row[2])
        traverseNode(planData)
      } catch (error) {
        console.error('Error parsing plan data:', error)
      }
    })

    // Update reactive refs
    maxRows.value = maxRowsValue
    maxDuration.value = maxDurationValue
  }

  function scrollToNode(nodeIdx) {
    const previousNodeId = activeNodeIndex.value
    activeNodeIndex.value = nodeIdx

    // Only update what's necessary in the DOM directly
    if (previousNodeId !== null) {
      // Remove highlight from previous node - scoped to this component
      d3.selectAll(`#${componentId.value} .tree-group.node-${previousNodeId} .plan-card`).classed('active-card', false)
      d3.selectAll(`#${componentId.value} .tree-group.node-${previousNodeId}`).classed('active-tree', false)
      d3.selectAll(`#${componentId.value} .tree-group.node-${previousNodeId} .node-index-rect`).classed('active', false)
    }

    // Add highlight to new node - scoped to this component
    d3.selectAll(`#${componentId.value} .tree-group.node-${nodeIdx} .plan-card`).classed('active-card', true)
    d3.selectAll(`#${componentId.value} .tree-group.node-${nodeIdx}`).classed('active-tree', true)
    d3.selectAll(`#${componentId.value} .tree-group.node-${nodeIdx} .node-index-rect`).classed('active', true)

    // Handle scrolling to the node
    const position = nodePositions.value.get(nodeIdx)
    if (position !== undefined && chartContainer.value) {
      const containerRect = chartContainer.value.getBoundingClientRect()
      const svg = d3
        .select(chartContainer.value as HTMLDivElement)
        .select('svg')
        .node()
      const currentTransform = d3.zoomTransform(svg)

      // Calculate the translation needed to center on this node
      const desiredTransX = containerRect.width / 2 - position * currentTransform.k

      // Apply new transform that preserves vertical position and scale
      d3.select(chartContainer.value as HTMLDivElement)
        .select('svg')
        .transition()
        .duration(500)
        .call(
          zoomListener.value.transform,
          d3.zoomIdentity.translate(desiredTransX, currentTransform.y).scale(currentTransform.k)
        )
    }
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

  const areDataArraysEqual = (newData, oldData) => {
    if (!newData || !oldData) return newData === oldData
    if (newData.length !== oldData.length) return false

    return newData.every((newRow, index) => {
      const oldRow = oldData[index]
      if (newRow[0] !== oldRow[0] || newRow[1] !== oldRow[1]) return false

      try {
        return JSON.stringify(JSON.parse(newRow[2])) === JSON.stringify(JSON.parse(oldRow[2]))
      } catch (e) {
        return newRow[2] === oldRow[2]
      }
    })
  }

  // Watch handlers for data changes
  watch(
    () => props.data,
    (newData, oldData) => {
      // Only reset if the data content actually changed
      if (!oldData || !areDataArraysEqual(newData, oldData)) {
        activeNodeIndex.value = 0
        selectedMetric.value = ''
        highlightType.value = 'DURATION'
        metricsExpanded.value = false

        calculateMaxMetrics()

        nextTick(() => {
          if (treeView.value) {
            treeView.value.renderTree()

            setTimeout(() => {
              resetZoom()
            }, 100)
          }
        })
      }
    },
    { immediate: true }
  )

  const localStageIndex = ref(props.index)

  watch(
    () => props.index,
    (newIndex) => {
      localStageIndex.value = newIndex
    }
  )

  function onStageChange(newStageIndex) {
    if (newStageIndex >= 0 && newStageIndex < props.totalStages) {
      emit('changeStage', newStageIndex)
    }
  }

  onMounted(() => {
    calculateMaxMetrics()
    window.addEventListener('resize', handleResize)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize)
    if (chartContainer.value) {
      d3.select(chartContainer.value).selectAll('*').on('*', null)
    }
  })

  // Handle node position updates from TreeView
  function updateNodePositions(positions) {
    nodePositions.value = positions
  }

  // Handle active node updates
  function updateActiveNode(nodeIndex) {
    activeNodeIndex.value = nodeIndex
  }

  const updateNodesData = (data) => {
    nodesData.value = data
  }
</script>

<style lang="less">
  .explain-chart {
    display: flex;
    flex-direction: column;
    height: calc(100% - 32px);
    margin: 16px;
    padding: 16px 16px;
    border-radius: 6px;
    box-shadow: 0 4px 10px 0 var(--border-color);
    .header {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid var(--light-border-color);
      padding-bottom: 6px;
      .arco-radio-group-button {
        border-radius: 6px;
      }
      .arco-radio-button {
        border-radius: 6px;
        &.arco-radio-checked {
          color: var(--brand-color);
          border-color: var(--brand-color);
          background-color: var(--card-bg-color);
        }
      }
    }
    .stage-navigation {
      display: flex;
      justify-content: center;
      align-items: center;

      .arco-radio-group-button {
        font-family: 'Gilroy';
      }
    }

    .controls-wrapper {
      position: absolute;
      bottom: 10px;
      left: 0;
      width: 100%;
      display: flex;
      justify-content: center;
      z-index: 10;
      pointer-events: none; // Allow clicking through wrapper to SVG

      > * {
        pointer-events: auto; // Re-enable pointer events for children
      }
    }

    .chart-scroll-container {
      flex: 1;
      position: relative;
      overflow: hidden;
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
      border-radius: 4px;
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
      display: flex;
      gap: 16px;
      background-color: var(--card-bg-color);
      border-radius: 4px;
      padding: 4px 8px;
      box-shadow: 0 2px 5px var(--box-shadow-color);
      z-index: 10;

      .nav-arrow {
        color: var(--main-font-color);

        &:hover:not(:disabled) {
          color: var(--brand-color);
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }
    }

    .zoom-controls,
    .navigation-arrows {
      pointer-events: auto; // Re-enable pointer events for controls
    }
  }

  .plan-node-container {
    width: 100%;
    margin-bottom: 10px; /* Space below the container */
  }

  .plan-card {
    width: 100%;
    background-color: var(--card-bg-color);
    border: 1px solid var(--border-color);
    border-radius: 4px;
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
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .plan-name {
      font-weight: bold;
      color: var(--main-font-color);
      font-size: 13px;
    }

    .metric-progress-container {
      margin-bottom: 8px;
      border-bottom: 1px dashed var(--border-color);
      padding-bottom: 8px;
    }

    .metric-label {
      font-size: 11px;
      color: var(--small-font-color);
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
    }

    .metric-progress {
      height: 6px;
      background-color: var(--grey-bg-color);
      border-radius: 3px;
      overflow: hidden;
    }

    .metric-progress-bar {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .plan-metrics {
      font-size: 12px;
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
