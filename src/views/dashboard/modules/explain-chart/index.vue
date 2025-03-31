<template lang="pug">
.explain-chart
  ChartControls(
    v-model:highlight-type="highlightType"
    v-model:selected-metric="selectedMetric"
    v-model:metrics-expanded="metricsExpanded"
    :available-nodes="availableNodes"
    :active-node-index="activeNodeIndex"
    :max-rows="maxRows"
    :max-duration="maxDuration"
    :available-metrics="availableMetrics"
    @node-selected="scrollToNode"
  )
  .chart-scroll-container
    .chart-container.grab-bing(ref="chartContainer")
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
  import {
    IconExpand,
    IconShrink,
    IconZoomIn,
    IconZoomOut,
    IconRefresh,
    IconLeft,
    IconRight,
  } from '@arco-design/web-vue/es/icon'
  import PlanCard from './plan-card.vue'
  import NavigationArrows from './navigation-arrows.vue'

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
  }>()

  // Define card dimensions constants
  const CARD_DIMENSIONS = {
    width: 200,
    minHeight: 40,
    progressBarHeight: 30,
    singleMetricHeight: 20,
    expandedBaseHeight: 25,
    metricLineHeight: 18,
    padding: 20, // Padding between nodes
    horizontalPadding: 60, // Add this new parameter for horizontal spacing
  }

  const NODE_INDEX_CARD = {
    width: 70, // Reduced from 100
    height: 30, // Reduced from 40
    fontSize: 12, // Reduced from 14
  }

  const chartContainer = ref<HTMLDivElement | null>(null)
  const metricsExpanded = ref(false)
  const selectedMetric = ref<string>('')
  const activeNodeIndex = ref<number | null>(null)
  const highlightType = ref<string>('NONE') // Highlight type: NONE, ROWS, DURATION
  const nodesData = ref([])

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

  // Define the order of importance for metrics
  const importanceOrder = ['fetch_time', 'elapsed_poll', 'repartition_time', 'send_time', 'mem_used', 'elapsed_await']

  // Check if we have rows and duration metrics
  const hasPlanRows = computed(() => maxRows.value > 0)
  const hasDurationMetrics = computed(() => maxDuration.value > 0)

  // Get available metrics for the dropdown
  // Add this computed property to extract all unique metrics from your plans
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

    // Convert Set to array and sort alphabetically
    console.log('Available metrics:', Array.from(metricKeys).sort())
    return Array.from(metricKeys).sort()
  })

  // Get all available nodes from the data
  const availableNodes = computed(() => {
    if (!props.data || props.data.length === 0) return []
    return [...new Set(props.data.map((row) => row[1]))].sort((a, b) => a - b)
  })

  // Format time value (nanoseconds) to human readable
  function formatTimeValue(nanoseconds) {
    if (nanoseconds === undefined || nanoseconds === null) return '0'

    // Convert to appropriate unit
    if (nanoseconds < 1000) {
      return `${nanoseconds}ns`
    }
    if (nanoseconds < 1000000) {
      return `${(nanoseconds / 1000).toFixed(2)}μs`
    }
    if (nanoseconds < 1000000000) {
      return `${(nanoseconds / 1000000).toFixed(2)}ms`
    }
    return `${(nanoseconds / 1000000000).toFixed(2)}s`
  }

  // Get progress bar color based on percentage using global.less colors
  function getProgressColor(percentage) {
    if (percentage < 20) return 'var(--success-color)'
    if (percentage < 80) return 'var(--warning-color)'
    return 'var(--danger-color)'
  }

  // Create a line generator function similar to plan.vue
  const lineGen = computed(() => {
    return (link: FlexHierarchyPointLink) => {
      const { source, target } = link

      // Calculate the bottom of the source node
      const sourceBottom = source.y + (source.ySize || 40)

      // Calculate a proper curve with enough space
      const k = Math.max(30, Math.abs(target.y - sourceBottom) / 2)

      // Create the path
      const path = d3.path()
      path.moveTo(source.x, sourceBottom)
      path.bezierCurveTo(source.x, sourceBottom + k, target.x, target.y - k, target.x, target.y)
      return path.toString()
    }
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
    const { svg } = getSvgAndGroup()
    if (!svg) return

    // Use the current transform state
    svg.transition().duration(300).call(zoomListener.value.scaleBy, 1.3)
  }

  // Zoom out function
  function zoomOut() {
    const { svg } = getSvgAndGroup()
    if (!svg) return

    // Use the current transform state
    svg
      .transition()
      .duration(300)
      .call(zoomListener.value.scaleBy, 1 / 1.3)
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

  function calculateMaxMetrics() {
    let totalMaxRows = 0
    let totalMaxDuration = 0

    // Process all nodes to find max values
    nodesData.value.forEach(({ plan }) => {
      function traversePlan(node) {
        // Fix: Look for metrics in both places
        const outputRows = node.output_rows || (node.metrics && node.metrics.output_rows) || 0
        const elapsedCompute = node.elapsed_compute || (node.metrics && node.metrics.elapsed_compute) || 0

        totalMaxRows = Math.max(totalMaxRows, outputRows)
        totalMaxDuration = Math.max(totalMaxDuration, elapsedCompute)

        // Process children
        if (node.children) {
          node.children.forEach(traversePlan)
        }
      }

      traversePlan(plan)
    })

    maxRows.value = totalMaxRows
    maxDuration.value = totalMaxDuration
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
    if (!chartContainer.value || activeNodeIndex.value === null || activeNodeIndex.value === undefined) return

    // Get current container dimensions
    const containerWidth = chartContainer.value.clientWidth
    const containerHeight = chartContainer.value.clientHeight

    // Get SVG selections
    const { svg, group } = getSvgAndGroup()
    if (!svg || !group) return

    // Update SVG dimensions
    svg.attr('width', containerWidth).attr('height', containerHeight)

    // Find the active tree group
    const activeNodeGroup = svg.select(`g .tree-group.node-${activeNodeIndex.value}`)
    if (activeNodeGroup.empty()) return

    // Get the bounding box
    const groupNode = activeNodeGroup.node()
    if (!groupNode) return
    const groupBBox = groupNode.getBBox()

    // Use minimal padding - just enough for visual clarity
    const padding = 20 // Reduced from 50

    // Calculate scale to fit tree
    const scaleX = containerWidth / (groupBBox.width + padding * 2)
    const scaleY = containerHeight / (groupBBox.height + padding * 2)

    // Use a reasonable scale that fits but isn't too small
    // Use Math.min but with a reasonable minimum scale to prevent tiny charts
    const newScale = Math.min(scaleX, scaleY, maxScale) // Remove Math.max(..., 0.7) to allow smaller scales

    // Calculate translation to center the tree precisely
    const tx = containerWidth / 2 - (groupBBox.x + groupBBox.width / 2) * newScale
    const ty = containerHeight / 2 - (groupBBox.y + groupBBox.height / 2) * newScale

    // Create a proper transform object and apply it
    const transform2 = d3.zoomIdentity.translate(tx, ty).scale(newScale)

    // Apply transform through the zoom behavior to keep state consistent
    svg.transition().duration(750).call(zoomListener.value.transform, transform2)

    // Scale is updated automatically by the zoom event listener
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
    if (chartContainer.value) {
      setContainerDimensions()
      resetZoom()
    }
  }

  onMounted(() => {
    window.addEventListener('resize', handleResize)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize)
  })

  function scrollToNode(nodeIdx) {
    const previousNodeId = activeNodeIndex.value
    activeNodeIndex.value = nodeIdx

    // Only update what's necessary in the DOM directly
    if (previousNodeId !== null) {
      // Remove highlight from previous node
      d3.selectAll(`.tree-group.node-${previousNodeId} .plan-card`).classed('active-card', false)
      d3.selectAll(`.tree-group.node-${previousNodeId}`).classed('active-tree', false)
      d3.selectAll(`.tree-group.node-${previousNodeId} .node-index-rect`).classed('active', false)
    }

    // Add highlight to new node
    d3.selectAll(`.tree-group.node-${nodeIdx} .plan-card`).classed('active-card', true)
    d3.selectAll(`.tree-group.node-${nodeIdx}`).classed('active-tree', true)
    d3.selectAll(`.tree-group.node-${nodeIdx} .node-index-rect`).classed('active', true)

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

  function renderNode(d, nodeIdx) {
    const isNodeSelected = activeNodeIndex.value === nodeIdx
    const nodeMetrics = d.data.metrics || {}

    // Extract key metrics
    const outputRows = nodeMetrics.output_rows || 0
    const elapsedCompute = nodeMetrics.elapsed_compute || 0

    // Calculate metrics count and determine if they should be shown
    const hasMetrics =
      metricsExpanded.value || (selectedMetric.value && nodeMetrics[selectedMetric.value] !== undefined)
    const hasProgressBar = highlightType.value !== 'NONE'

    // Calculate metrics lines
    const metricsLines = calculateMetricsLines(nodeMetrics, hasMetrics)

    // Calculate height based on content
    const cardHeight = calculateCardHeight(hasProgressBar, hasMetrics, metricsLines)

    // Update the node's size in the hierarchy
    updateNodeSize(d.data, CARD_DIMENSIONS.width, cardHeight)

    // Create the card header
    const header = `
      <div class="plan-header">
        <div class="plan-name">${d.data.name}</div>
      </div>
    `

    // Add progress bar based on highlight type
    let progressBarHtml = ''
    if (hasProgressBar) {
      if (highlightType.value === 'ROWS' && maxRows.value > 0) {
        const rowsPercentage = Math.round((outputRows / maxRows.value) * 100)
        const progressColor = getProgressColor(rowsPercentage)
        progressBarHtml = `
          <div class="metric-progress-container">
            <div class="metric-label">
              <span>Rows: ${outputRows}</span>
            </div>
            <div class="metric-progress">
              <div class="metric-progress-bar" style="width: ${rowsPercentage}%; background-color: ${progressColor}"></div>
            </div>
          </div>
        `
      } else if (highlightType.value === 'DURATION' && maxDuration.value > 0) {
        const durationPercentage = Math.round((elapsedCompute / maxDuration.value) * 100)
        const progressColor = getProgressColor(durationPercentage)
        progressBarHtml = `
          <div class="metric-progress-container">
            <div class="metric-label">
              <span>Duration: ${formatTimeValue(elapsedCompute)}</span>
            </div>
            <div class="metric-progress">
              <div class="metric-progress-bar" style="width: ${durationPercentage}%; background-color: ${progressColor}"></div>
            </div>
          </div>
        `
      }
    }

    // Create metrics section based on expanded state
    let metricsHtml = ''
    if (hasMetrics) {
      if (metricsExpanded.value) {
        // Show all metrics when expanded
        if (nodeMetrics && Object.keys(nodeMetrics).length > 0) {
          const sortedMetrics = {}

          // First add metrics in our importance order (excluding outputRows/elapsedCompute)
          importanceOrder.forEach((key) => {
            if (nodeMetrics[key] !== undefined && !['outputRows', 'elapsedCompute'].includes(key)) {
              // Format time metrics
              const isTimeMetric = key.includes('time') || key.includes('elapsed')
              sortedMetrics[key] = isTimeMetric ? formatTimeValue(nodeMetrics[key]) : nodeMetrics[key]
            }
          })

          // Then add any remaining metrics
          Object.keys(nodeMetrics).forEach((key) => {
            if (
              sortedMetrics[key] === undefined &&
              !['output_rows', 'elapsed_compute', 'outputRows', 'elapsedCompute'].includes(key)
            ) {
              // Format time metrics
              const isTimeMetric = key.includes('time') || key.includes('elapsed')
              sortedMetrics[key] = isTimeMetric ? formatTimeValue(nodeMetrics[key]) : nodeMetrics[key]
            }
          })

          if (Object.keys(sortedMetrics).length > 0) {
            metricsHtml = `
              <div class="plan-metrics">
                ${Object.entries(sortedMetrics)
                  .map(
                    ([key, value]) => `
                    <div class="metric-item">
                      <span class="metric-key">${key}:</span>
                      <span class="metric-value">${value}</span>
                    </div>
                  `
                  )
                  .join('')}
              </div>
            `
          }
        }
      } else if (selectedMetric.value && nodeMetrics[selectedMetric.value] !== undefined) {
        // Format time metric if needed
        const isTimeMetric = selectedMetric.value.includes('time') || selectedMetric.value.includes('elapsed')
        const displayValue = isTimeMetric
          ? formatTimeValue(nodeMetrics[selectedMetric.value])
          : nodeMetrics[selectedMetric.value]

        metricsHtml = `
          <div class="plan-metrics">
            <div class="metric-item">
              <span class="metric-key">${selectedMetric.value}:</span>
              <span class="metric-value">${displayValue}</span>
            </div>
          </div>
        `
      }
    }

    return `
      <div class="plan-node-container">
        <div class="plan-card ${isNodeSelected ? 'active-card' : ''}" 
             style="height: ${cardHeight}px; width: ${CARD_DIMENSIONS.width}px">
          ${header}
          ${progressBarHtml}
          ${metricsHtml}
        </div>
      </div>
    `
  }

  function updateTreeLayout() {
    // Get each tree group
    availableNodes.value.forEach((nodeIdx) => {
      const treeGroup = d3.select(chartContainer.value).select(`svg g .tree-group.node-${nodeIdx}`)
      if (treeGroup.empty()) return

      // Get the tree container
      const treeContainer = treeGroup.select('g:last-of-type')
      if (treeContainer.empty()) return

      // Get all nodes
      const nodes = treeContainer.selectAll('.node').data()
      if (!nodes.length) return

      // Re-compute the layout with updated node sizes
      const rootData = nodes[0]?.data
      if (!rootData) return

      // Create a new tree layout
      const treeLayout = flextree({
        nodeSize: (node) => {
          if (node.data && node.data.size) {
            return [node.data.size[0] + CARD_DIMENSIONS.horizontalPadding, node.data.size[1] + CARD_DIMENSIONS.padding]
          }
          return [
            CARD_DIMENSIONS.width + CARD_DIMENSIONS.horizontalPadding,
            CARD_DIMENSIONS.minHeight + CARD_DIMENSIONS.padding,
          ]
        },
      })

      // Create a hierarchy from the current data
      const hierarchy = d3.hierarchy(rootData, (d) => d.children || [])
      const root = treeLayout(hierarchy)

      // Update node positions
      treeContainer.selectAll('.node').each(function (d, i) {
        if (i >= root.descendants().length) return

        const newPos = root.descendants()[i]
        if (!newPos) return

        const xSize = (newPos as unknown as FlexHierarchyPointNode).xSize || CARD_DIMENSIONS.width
        d3.select(this).attr('transform', `translate(${newPos.x - xSize / 2},${newPos.y})`)
      })

      // Update links with the new positions
      treeContainer.selectAll('.link').each(function (d, i) {
        if (i >= root.links().length) return

        const links = root.links()
        if (links[i]) {
          d3.select(this).attr('d', lineGen.value(links[i] as unknown as FlexHierarchyPointLink))
        }
      })
    })
  }
  function updateProgressBars(currentHighlightType) {
    if (!chartContainer.value) return

    // Since we're using Vue components, we need to re-render them with updated props
    d3.selectAll('.node foreignObject').each(function () {
      const nodeData = d3.select(this.parentNode).datum()
      if (!nodeData || !nodeData.data) return

      // Get the container div where the Vue component is mounted
      const container = this.querySelector('div')
      if (!container) return

      // Get the node index from the tree group - FIX HERE
      // Use DOM closest() method instead of D3's selection.closest()
      const treeGroupElement = this.parentNode.closest('.tree-group')
      if (!treeGroupElement) return

      const nodeIdxMatch = treeGroupElement.className.baseVal.match(/node-(\d+)/)
      const nodeIndex = nodeIdxMatch ? parseInt(nodeIdxMatch[1], 10) : null

      // Re-render the PlanCard component with updated props
      render(
        h(PlanCard, {
          nodeData: nodeData.data,
          highlightType: currentHighlightType,
          maxRows: maxRows.value,
          maxDuration: maxDuration.value,
          selectedMetric: selectedMetric.value,
          metricsExpanded: metricsExpanded.value,
          isActive: activeNodeIndex.value === nodeIndex,
        }),
        container
      )

      // Calculate new height
      const hasMetrics =
        metricsExpanded.value ||
        (selectedMetric.value && nodeData.data.metrics && nodeData.data.metrics[selectedMetric.value] !== undefined)
      const hasProgressBar = currentHighlightType !== 'NONE'
      const metricsLines = calculateMetricsLines(nodeData.data.metrics || {}, hasMetrics)
      const cardHeight = calculateCardHeight(hasProgressBar, hasMetrics, metricsLines)

      // Update the node's size in the hierarchy
      updateNodeSize(nodeData.data, CARD_DIMENSIONS.width, cardHeight)

      // Update foreignObject height
      d3.select(this).attr('height', cardHeight + 10)
    })

    // Update the tree layout
    if (chartContainer.value) {
      updateTreeLayout()
    }
  }

  function updateMetricsDisplay() {
    if (!chartContainer.value) return

    // Use the same approach as updateProgressBars - rerender the Vue components
    d3.selectAll('.node foreignObject').each(function () {
      const nodeData = d3.select(this.parentNode).datum()
      if (!nodeData || !nodeData.data) return

      // Get the container div where the Vue component is mounted
      const container = this.querySelector('div')
      if (!container) return

      // Get the node index from the tree group
      const treeGroupElement = this.parentNode.closest('.tree-group')
      if (!treeGroupElement) return

      const nodeIdxMatch = treeGroupElement.className.baseVal.match(/node-(\d+)/)
      const nodeIndex = nodeIdxMatch ? parseInt(nodeIdxMatch[1], 10) : null

      // Re-render the PlanCard component with updated props
      render(
        h(PlanCard, {
          nodeData: nodeData.data,
          highlightType: highlightType.value,
          maxRows: maxRows.value,
          maxDuration: maxDuration.value,
          selectedMetric: selectedMetric.value,
          metricsExpanded: metricsExpanded.value,
          isActive: activeNodeIndex.value === nodeIndex,
        }),
        container
      )

      // Calculate new height
      const hasMetrics =
        metricsExpanded.value ||
        (selectedMetric.value && nodeData.data.metrics && nodeData.data.metrics[selectedMetric.value] !== undefined)
      const hasProgressBar = highlightType.value !== 'NONE'
      const metricsLines = calculateMetricsLines(nodeData.data.metrics || {}, hasMetrics)
      const cardHeight = calculateCardHeight(hasProgressBar, hasMetrics, metricsLines)

      // Update the node's size in the hierarchy
      updateNodeSize(nodeData.data, CARD_DIMENSIONS.width, cardHeight)

      // Update foreignObject height
      d3.select(this).attr('height', cardHeight + 10)
    })

    // Update the tree layout
    updateTreeLayout()
  }

  function renderTree() {
    if (!chartContainer.value || !props.data || props.data.length === 0) return

    // Clear previous content
    chartContainer.value.innerHTML = ''

    // Create container for zoomable content with explicit dimensions
    const svg = d3
      .select(chartContainer.value)
      .append('svg')
      .attr('width', chartContainer.value.clientWidth)
      .attr('height', chartContainer.value.clientHeight) // Remove the "|| 600" fallback
      .attr('class', 'explain-svg')
      .attr('viewBox', `0 0 ${chartContainer.value.clientWidth} ${chartContainer.value.clientHeight}`)

    // Apply zoom behavior safely
    applyZoom(svg)

    // Add main group for transformation during zoom/pan
    const mainGroup = svg.append('g')

    // Process all node data - we need one tree per node
    nodesData.value = processNodesData(props.data)

    // If no nodes, return early
    if (!nodesData.value.length) return

    // Calculate max metrics
    calculateMaxMetrics()

    // Calculate total width based on number of trees
    const treeWidth = 250 // Smaller width per tree (was 300)
    const spacing = 50 // Smaller spacing (was 100)

    // Clear node positions map
    nodePositions.value.clear()

    // Render each node's tree
    nodesData.value.forEach((nodeData, index) => {
      const { nodeIndex, plan } = nodeData

      // Convert plan data to hierarchy-friendly format
      const rootData = toHierarchy(plan, nodeIndex)

      // Ensure nodeIndex is valid
      if (Number.isNaN(nodeIndex)) return

      // Store node position for scrolling
      const xPosition = index * (treeWidth + spacing) + treeWidth / 2
      nodePositions.value.set(nodeIndex, xPosition)

      // Create a group for this tree
      const treeGroup = mainGroup
        .append('g')
        .attr('class', `tree-group node-${nodeIndex} ${activeNodeIndex.value === nodeIndex ? 'active-tree' : ''}`)
        .attr('transform', `translate(${index * (treeWidth + spacing)}, 0)`)
        .style('overflow', 'visible')

      // Add node index card
      const nodeIndexCard = treeGroup
        .append('g')
        .attr('class', `node-index-card ${activeNodeIndex.value === nodeIndex ? 'active-node-index' : ''}`)
        .attr('transform', `translate(${treeWidth / 2 - NODE_INDEX_CARD.width / 2}, 20)`) // Centered with new width

      // Card rectangle
      nodeIndexCard
        .append('rect')
        .attr('width', NODE_INDEX_CARD.width)
        .attr('height', NODE_INDEX_CARD.height)
        .attr('rx', 4) // Slightly smaller corner radius
        .attr('ry', 4)
        .attr('class', activeNodeIndex.value === nodeIndex ? 'node-index-rect active' : 'node-index-rect')
        .style('fill', 'var(--card-bg-color)')

      // Card text
      nodeIndexCard
        .append('text')
        .attr('x', NODE_INDEX_CARD.width / 2)
        .attr('y', NODE_INDEX_CARD.height / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', NODE_INDEX_CARD.fontSize)
        .attr('font-weight', 'bold')
        .attr('fill', 'var(--main-font-color)')
        .text(`Node ${nodeIndex}`)

      // Make card clickable
      nodeIndexCard.style('cursor', 'pointer').on('click', () => {
        scrollToNode(nodeIndex)
      })

      // Create hierarchy with precomputed node sizes
      // Precompute sizes for nodes in the hierarchy
      const hierarchy = d3.hierarchy(rootData, (d) => d.children || [])
      hierarchy.each((d) => {
        const nodeMetrics = d.data.metrics || {}
        const hasMetrics =
          metricsExpanded.value || (selectedMetric.value && nodeMetrics[selectedMetric.value] !== undefined)
        const hasProgressBar = highlightType.value !== 'NONE'
        const metricsLines = calculateMetricsLines(nodeMetrics, hasMetrics)
        const cardHeight = calculateCardHeight(hasProgressBar, hasMetrics, metricsLines)

        // Set size in node data for layout
        d.data.size = [CARD_DIMENSIONS.width, cardHeight]
      })

      // Create the tree layout
      const treeLayout = flextree({
        nodeSize: (node) => {
          if (node.data && node.data.size) {
            // Increase the horizontal size by adding horizontalPadding
            return [node.data.size[0] + CARD_DIMENSIONS.horizontalPadding, node.data.size[1] + CARD_DIMENSIONS.padding]
          }
          return [
            CARD_DIMENSIONS.width + CARD_DIMENSIONS.horizontalPadding,
            CARD_DIMENSIONS.minHeight + CARD_DIMENSIONS.padding,
          ]
        },
      })
      // Apply layout
      const layoutRoot = treeLayout(hierarchy)

      // Find boundaries for centering
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      layoutRoot.each((d) => {
        const nodeWidth = d.data.size ? d.data.size[0] : CARD_DIMENSIONS.width
        minX = Math.min(minX, d.x - nodeWidth / 2)
        maxX = Math.max(maxX, d.x + nodeWidth / 2)
        minY = Math.min(minY, d.y)
        maxY = Math.max(maxY, d.y + (d.data.size ? d.data.size[1] : CARD_DIMENSIONS.minHeight))
      })

      // Calculate center offset
      const centerX = treeWidth / 2
      const offsetX = centerX - (maxX - minX) / 2 - minX

      // Create tree container with offset
      const treeContainer = treeGroup
        .append('g')
        .attr('transform', `translate(${offsetX}, 60)`)
        .style('overflow', 'visible')

      const rootNodeX = layoutRoot.x + offsetX
      const rootNodeY = layoutRoot.y

      // Calculate the bottom of the node index card
      const cardBottom = 20 + NODE_INDEX_CARD.height
      // 3. Add connection between node index card and tree root
      treeGroup
        .append('path')
        .attr(
          'd',
          `M${treeWidth / 2},${cardBottom}C${treeWidth / 2},${(cardBottom + rootNodeY + 60) / 2} ${rootNodeX},${
            (cardBottom + rootNodeY + 60) / 2
          } ${rootNodeX},${rootNodeY + 60}`
        )
        .attr('fill', 'none')
        .attr('stroke', 'var(--border-color)')
        .attr('stroke-width', 1)
        .attr('class', 'node-index-link')
      // Add links between nodes
      treeContainer
        .selectAll('.link')
        .data(layoutRoot.links())
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('fill', 'none')
        .attr('stroke', 'var(--border-color)')
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'square')
        .attr('stroke-linejoin', 'round')
        .attr('d', (d) => lineGen.value(d as unknown as FlexHierarchyPointLink))

      // Add nodes
      const nodeElements = treeContainer
        .selectAll('.node')
        .data(layoutRoot.descendants())
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('transform', (d) => {
          const nodeWidth = d.data.size ? d.data.size[0] : CARD_DIMENSIONS.width
          return `translate(${d.x - nodeWidth / 2},${d.y})`
        })

      // Add node content using foreignObject
      nodeElements
        .append('foreignObject')
        .attr('width', CARD_DIMENSIONS.width + 10)
        .attr('height', (d) => {
          const nodeMetrics = d.data.metrics || {}
          const hasMetrics =
            metricsExpanded.value || (selectedMetric.value && nodeMetrics[selectedMetric.value] !== undefined)
          const hasProgressBar = highlightType.value !== 'NONE'
          const metricsLines = calculateMetricsLines(nodeMetrics, hasMetrics)
          const cardHeight = calculateCardHeight(hasProgressBar, hasMetrics, metricsLines)
          return cardHeight + 10
        })
        .each(function (d) {
          // Create a div to mount the Vue component
          const container = document.createElement('div')
          this.appendChild(container)

          // Mount the NodeCard component
          render(
            h(PlanCard, {
              nodeData: d.data,
              highlightType: highlightType.value,
              maxRows: maxRows.value,
              maxDuration: maxDuration.value,
              selectedMetric: selectedMetric.value,
              metricsExpanded: metricsExpanded.value,
              isActive: activeNodeIndex.value === nodeIndex,
            }),
            container
          )
        })
    })

    const zoomControlsDiv = document.createElement('div')
    zoomControlsDiv.className = 'zoom-controls'
    chartContainer.value.appendChild(zoomControlsDiv)

    // Set initial active node
    if (activeNodeIndex.value === null && availableNodes.value.length > 0) {
      activeNodeIndex.value = availableNodes.value[0]
      nextTick(() => resetZoom())
    } else if (activeNodeIndex.value !== null) {
      nextTick(() => {
        // Highlight active node
        const nodeIdx = activeNodeIndex.value
        d3.selectAll(`.tree-group.node-${nodeIdx}`).classed('active-tree', true)
        d3.selectAll(`.tree-group.node-${nodeIdx} .node-index-rect`).classed('active', true)
        d3.selectAll(`.tree-group.node-${nodeIdx} .plan-card`).classed('active-card', true)
        resetZoom()
      })
    }
  }

  function toggleMetricsExpanded() {
    metricsExpanded.value = !metricsExpanded.value
    updateMetricsDisplay()
  }

  onMounted(() => {
    // Give the container enough time to be properly sized
    setTimeout(() => {
      if (chartContainer.value) {
        // Ensure the container has adequate height
        const parentHeight = chartContainer.value.parentElement?.clientHeight
        if (chartContainer.value.clientHeight < 300) {
          chartContainer.value.style.height = `${parentHeight || 600}px`
        }

        // Force layout reflow before rendering
        chartContainer.value.getBoundingClientRect()

        renderTree()

        // Reset zoom after rendering to ensure everything is visible
        if (activeNodeIndex.value === null && availableNodes.value.length > 0) {
          activeNodeIndex.value = availableNodes.value[0]
        }

        if (activeNodeIndex.value !== null) {
          setTimeout(() => resetZoom(), 100)
        }
      }
    }, 100)
  })

  // Watch handlers for data changes
  watch(
    () => props.data,
    () => renderTree()
  )

  watch(selectedMetric, () => {
    if (!chartContainer.value) return
    updateMetricsDisplay()
  })

  watch(
    () => metricsExpanded.value,
    () => {
      if (!chartContainer.value) return
      updateMetricsDisplay()
    }
  )

  watch(highlightType, (newType) => {
    if (!chartContainer.value) return
    updateProgressBars(newType)
  })
</script>

<style lang="less">
  .explain-chart {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;

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

    .chart-controls {
      display: flex;
      align-items: center;
      padding: 8px;
      border-bottom: 1px solid var(--border-color);

      .node-selector {
        display: flex;
        align-items: center;
        margin-right: 16px;

        .node-label {
          margin-right: 8px;
          font-size: 13px;
          color: var(--small-font-color);
        }

        .node-buttons {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          max-width: 300px;
        }
      }

      .highlight-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
        margin-right: 16px;

        .control-label {
          font-size: 13px;
          color: var(--small-font-color);
        }
      }

      .flex-spacer {
        flex: 1;
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
      border: 1px solid var(--brand-color);
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
      font-family: monospace;
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

  .node-index-rect {
    fill: var(--card-bg-color);
    stroke: var(--border-color);
    stroke-width: 1px;

    &.active {
      fill: var(--light-brand-color);
      stroke: var(--brand-color);
    }
  }

  .node-index-link {
    stroke-linecap: round;
    stroke-dasharray: 4 2;
  }

  .link {
    stroke: var(--border-color);
    stroke-width: 2px !important;
    stroke-linecap: square;
    stroke-linejoin: round;
    pointer-events: none;
    z-index: 1;
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
