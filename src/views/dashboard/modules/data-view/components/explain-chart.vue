<template>
  <div class="explain-chart">
    <div class="chart-controls">
      <div class="node-selector">
        <span class="node-label">Nodes:</span>
        <div class="node-buttons">
          <a-button
            v-for="node in availableNodes"
            :key="node"
            size="mini"
            :type="activeNodeIndex === node ? 'primary' : 'outline'"
            @click="scrollToNode(node)"
          >
            {{ node }}
          </a-button>
        </div>
      </div>
      <div class="flex-spacer"></div>

      <!-- Highlight type radio group -->
      <div class="highlight-controls">
        <span class="control-label">Highlight:</span>
        <a-radio-group v-model="highlightType" type="button" size="mini">
          <a-radio value="NONE">none</a-radio>
          <a-radio value="ROWS" :disabled="!hasPlanRows">rows</a-radio>
          <a-radio value="DURATION" :disabled="!hasDurationMetrics">duration</a-radio>
        </a-radio-group>
      </div>

      <a-select
        v-model="selectedMetric"
        size="mini"
        style="width: 150px; margin-left: 16px; margin-right: 8px"
        placeholder="Select metric"
        allow-clear
      >
        <a-option v-for="metric in availableMetrics" :key="metric.value" :value="metric.value">{{
          metric.label
        }}</a-option>
      </a-select>
      <a-button type="text" size="mini" @click="toggleMetricsExpanded">
        <template #icon>
          <icon-expand v-if="!metricsExpanded" />
          <icon-shrink v-else />
        </template>
        {{ metricsExpanded ? 'Collapse' : 'Expand' }}
      </a-button>
    </div>
    <div class="chart-scroll-container">
      <div ref="chartContainer" class="chart-container grab-bing">
        <!-- Zoom controls -->
        <div class="zoom-controls">
          <a-button type="text" size="mini" @click="zoomIn">
            <icon-zoom-in />
          </a-button>
          <a-button type="text" size="mini" @click="resetZoom">
            <icon-refresh />
          </a-button>
          <a-button type="text" size="mini" @click="zoomOut">
            <icon-zoom-out />
          </a-button>
        </div>

        <!-- Navigation arrows -->
        <div v-if="availableNodes.length > 1" class="navigation-arrows">
          <a-button
            type="text"
            size="large"
            class="nav-arrow left"
            :disabled="activeNodeIndex === availableNodes[0]"
            @click="navigateToPrevNode"
          >
            <icon-left />
          </a-button>
          <a-button
            type="text"
            size="large"
            class="nav-arrow right"
            :disabled="activeNodeIndex === availableNodes[availableNodes.length - 1]"
            @click="navigateToNextNode"
          >
            <icon-right />
          </a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, ref, watch, computed, nextTick } from 'vue'
  import * as d3 from 'd3'
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
    padding: 60, // Padding between nodes
  }

  const chartContainer = ref<HTMLDivElement | null>(null)
  const metricsExpanded = ref(false)
  const selectedMetric = ref<string>('fetch_time')
  const activeNodeIndex = ref<number | null>(null)
  const highlightType = ref<string>('NONE') // Highlight type: NONE, ROWS, DURATION

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
  const availableMetrics = computed(() => {
    return importanceOrder
      .filter((metric) => !['outputRows', 'elapsedCompute'].includes(metric))
      .map((metric) => ({
        label: metric,
        value: metric,
      }))
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

  // Zoom in function
  function zoomIn() {
    if (!chartContainer.value) return
    d3.select(chartContainer.value).select('svg').transition().duration(300).call(zoomListener.value.scaleBy, 1.3)
  }

  // Zoom out function
  function zoomOut() {
    if (!chartContainer.value) return
    d3.select(chartContainer.value)
      .select('svg')
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

  // Calculate max metrics for the entire plan
  function calculateMaxMetrics(nodesData) {
    let totalMaxRows = 0
    let totalMaxDuration = 0

    // Process all nodes to find max values
    nodesData.forEach(({ plan }) => {
      function traversePlan(node) {
        // Check for metrics
        if (node.metrics) {
          // Check for output_rows
          if (node.output_rows) {
            totalMaxRows = Math.max(totalMaxRows, node.output_rows)
          }
          // Check for elapsed_compute
          if (node.elapsed_compute) {
            totalMaxDuration = Math.max(totalMaxDuration, node.elapsed_compute)
          }
        }

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

  // Reset zoom to fit current node
  function resetZoom() {
    if (!chartContainer.value || activeNodeIndex.value === null) return

    // Get current node tree group
    const nodeGroup = d3.select(chartContainer.value).select(`svg g .tree-group.node-${activeNodeIndex.value}`)

    if (!nodeGroup.empty()) {
      const nodeGroupElement = nodeGroup.node()
      if (nodeGroupElement) {
        const bbox = nodeGroupElement.getBBox()
        const containerRect = chartContainer.value.getBoundingClientRect()

        // Calculate appropriate scale
        const scaleValue = Math.min(0.9, Math.min(containerRect.width / bbox.width, containerRect.height / bbox.height))

        // Position to center this node's tree
        const transX = (containerRect.width - bbox.width * scaleValue) / 2 - bbox.x * scaleValue
        const transY = (containerRect.height - bbox.height * scaleValue) / 2 - bbox.y * scaleValue

        // Apply transform
        d3.select(chartContainer.value)
          .select('svg')
          .transition()
          .duration(750)
          .call(zoomListener.value.transform, d3.zoomIdentity.translate(transX, transY).scale(scaleValue))
      }
    }
  }

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
      const svg = d3.select(chartContainer.value).select('svg').node()
      const currentTransform = d3.zoomTransform(svg)

      // Calculate the translation needed to center on this node
      const desiredTransX = containerRect.width / 2 - position * currentTransform.k

      // Apply new transform that preserves vertical position and scale
      d3.select(chartContainer.value)
        .select('svg')
        .transition()
        .duration(500)
        .call(
          zoomListener.value.transform,
          d3.zoomIdentity.translate(desiredTransX, currentTransform.y).scale(currentTransform.k)
        )
    }
  }

  // Navigate to previous node
  function navigateToPrevNode() {
    if (!activeNodeIndex.value) return

    const currentIndex = availableNodes.value.indexOf(activeNodeIndex.value)
    if (currentIndex > 0) {
      scrollToNode(availableNodes.value[currentIndex - 1])
    }
  }

  // Navigate to next node
  function navigateToNextNode() {
    if (!activeNodeIndex.value) return

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
              <span>Rows: ${outputRows} (${rowsPercentage}%)</span>
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
              <span>Duration: ${formatTimeValue(elapsedCompute)} (${durationPercentage}%)</span>
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
            return [node.data.size[0], node.data.size[1] + CARD_DIMENSIONS.padding]
          }
          return [CARD_DIMENSIONS.width, CARD_DIMENSIONS.minHeight + CARD_DIMENSIONS.padding]
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

    // Select all plan cards by foreignObject
    d3.selectAll('.node foreignObject').each(function updateCardWithProgressBar() {
      const nodeData = d3.select(this.parentNode).datum()
      if (!nodeData || !nodeData.data) return

      // Get the HTML content inside the foreignObject
      const cardContainer = d3.select(this).select('.plan-node-container')
      const card = cardContainer.select('.plan-card')

      // Remove existing progress bar
      card.select('.metric-progress-container').remove()

      // Add progress bar if needed
      if (currentHighlightType !== 'NONE') {
        const nodeMetrics = nodeData.data.metrics || {}
        const outputRows = nodeMetrics.output_rows || 0
        const elapsedCompute = nodeMetrics.elapsed_compute || 0

        // Create progress bar container
        const progressContainer = card.append('div').attr('class', 'metric-progress-container')

        if (currentHighlightType === 'ROWS' && maxRows.value > 0) {
          const rowsPercentage = Math.round((outputRows / maxRows.value) * 100)
          const progressColor = getProgressColor(rowsPercentage)

          progressContainer.html(`
            <div class="metric-label">
              <span>Rows: ${outputRows} (${rowsPercentage}%)</span>
            </div>
            <div class="metric-progress">
              <div class="metric-progress-bar" style="width: ${rowsPercentage}%; background-color: ${progressColor}"></div>
            </div>
          `)
        } else if (currentHighlightType === 'DURATION' && maxDuration.value > 0) {
          const durationPercentage = Math.round((elapsedCompute / maxDuration.value) * 100)
          const progressColor = getProgressColor(durationPercentage)

          progressContainer.html(`
            <div class="metric-label">
              <span>Duration: ${formatTimeValue(elapsedCompute)} (${durationPercentage}%)</span>
            </div>
            <div class="metric-progress">
              <div class="metric-progress-bar" style="width: ${durationPercentage}%; background-color: ${progressColor}"></div>
            </div>
          `)
        }
      }

      // Calculate new height
      const hasMetrics =
        metricsExpanded.value ||
        (selectedMetric.value && nodeData.data.metrics && nodeData.data.metrics[selectedMetric.value] !== undefined)
      const hasProgressBar = currentHighlightType !== 'NONE'
      const metricsLines = calculateMetricsLines(nodeData.data.metrics || {}, hasMetrics)
      const cardHeight = calculateCardHeight(hasProgressBar, hasMetrics, metricsLines)

      // Update the node's size in the hierarchy
      updateNodeSize(nodeData.data, CARD_DIMENSIONS.width, cardHeight)

      // Apply new height to DOM
      card.style('height', `${cardHeight}px`)
      d3.select(this).attr('height', cardHeight + 10)
    })

    // Update the tree layout
    if (chartContainer.value) {
      updateTreeLayout()
    }
  }

  function updateMetricsDisplay() {
    if (!chartContainer.value) return

    // Update metrics in the DOM
    d3.selectAll('.node foreignObject').each(function updateCardMetrics() {
      const nodeData = d3.select(this.parentNode).datum()
      if (!nodeData || !nodeData.data) return

      // Get the HTML content inside the foreignObject
      const cardContainer = d3.select(this).select('.plan-node-container')
      const card = cardContainer.select('.plan-card')

      // Clear existing metrics and keep progress bar temporarily
      const progressBar = card.select('.metric-progress-container').remove()
      card.select('.plan-metrics').remove()

      // Re-add metrics with updated content
      const nodeMetrics = nodeData.data.metrics || {}
      const hasMetrics =
        metricsExpanded.value || (selectedMetric.value && nodeMetrics[selectedMetric.value] !== undefined)

      if (hasMetrics) {
        if (metricsExpanded.value) {
          // Generate expanded metrics HTML
          const sortedMetrics = {}
          importanceOrder.forEach((key) => {
            if (nodeMetrics[key] !== undefined && !['outputRows', 'elapsedCompute'].includes(key)) {
              const isTimeMetric = key.includes('time') || key.includes('elapsed')
              sortedMetrics[key] = isTimeMetric ? formatTimeValue(nodeMetrics[key]) : nodeMetrics[key]
            }
          })

          Object.keys(nodeMetrics).forEach((key) => {
            if (
              sortedMetrics[key] === undefined &&
              !['output_rows', 'elapsed_compute', 'outputRows', 'elapsedCompute'].includes(key)
            ) {
              const isTimeMetric = key.includes('time') || key.includes('elapsed')
              sortedMetrics[key] = isTimeMetric ? formatTimeValue(nodeMetrics[key]) : nodeMetrics[key]
            }
          })

          // Insert new metrics HTML
          if (Object.keys(sortedMetrics).length > 0) {
            const metricsDiv = card.append('div').attr('class', 'plan-metrics')

            Object.entries(sortedMetrics).forEach(([key, value]) => {
              metricsDiv
                .append('div')
                .attr('class', 'metric-item')
                .html(`<span class="metric-key">${key}:</span><span class="metric-value">${value}</span>`)
            })
          }
        } else if (selectedMetric.value && nodeMetrics[selectedMetric.value] !== undefined) {
          // Add single selected metric
          const isTimeMetric = selectedMetric.value.includes('time') || selectedMetric.value.includes('elapsed')
          const displayValue = isTimeMetric
            ? formatTimeValue(nodeMetrics[selectedMetric.value])
            : nodeMetrics[selectedMetric.value]

          card.append('div').attr('class', 'plan-metrics')
            .html(`<div class="metric-item"><span class="metric-key">${selectedMetric.value}:</span>
                  <span class="metric-value">${displayValue}</span></div>`)
        }
      }

      // Re-add progress bar if needed
      if (highlightType.value !== 'NONE') {
        if (progressBar && progressBar.node()) {
          card.node().appendChild(progressBar.node())
        } else {
          // Add progress bar if it wasn't there before
          const nodeMetrics2 = nodeData.data.metrics || {}
          const outputRows = nodeMetrics2.output_rows || 0
          const elapsedCompute = nodeMetrics2.elapsed_compute || 0

          // Create progress bar container
          const progressContainer = card.append('div').attr('class', 'metric-progress-container')

          if (highlightType.value === 'ROWS' && maxRows.value > 0) {
            const rowsPercentage = Math.round((outputRows / maxRows.value) * 100)
            const progressColor = getProgressColor(rowsPercentage)

            progressContainer.html(`
              <div class="metric-label">
                <span>Rows: ${outputRows} (${rowsPercentage}%)</span>
              </div>
              <div class="metric-progress">
                <div class="metric-progress-bar" style="width: ${rowsPercentage}%; background-color: ${progressColor}"></div>
              </div>
            `)
          } else if (highlightType.value === 'DURATION' && maxDuration.value > 0) {
            const durationPercentage = Math.round((elapsedCompute / maxDuration.value) * 100)
            const progressColor = getProgressColor(durationPercentage)

            progressContainer.html(`
              <div class="metric-label">
                <span>Duration: ${formatTimeValue(elapsedCompute)} (${durationPercentage}%)</span>
              </div>
              <div class="metric-progress">
                <div class="metric-progress-bar" style="width: ${durationPercentage}%; background-color: ${progressColor}"></div>
              </div>
            `)
          }
        }
      }

      // Calculate new height
      const metricsLines = calculateMetricsLines(nodeMetrics, hasMetrics)
      const cardHeight = calculateCardHeight(highlightType.value !== 'NONE', hasMetrics, metricsLines)

      // Update the node's size in the hierarchy
      updateNodeSize(nodeData.data, CARD_DIMENSIONS.width, cardHeight)

      // Apply new height directly to DOM
      card.style('height', `${cardHeight}px`)
      d3.select(this).attr('height', cardHeight + 10)
    })

    // Update the tree layout
    if (chartContainer.value) {
      updateTreeLayout()
    }
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
      .attr('height', chartContainer.value.clientHeight || 600) // Set minimum height
      .attr('class', 'explain-svg')

    // Apply zoom behavior safely
    applyZoom(svg)

    // Add main group for transformation during zoom/pan
    const mainGroup = svg.append('g')

    // Process all node data - we need one tree per node
    const nodesData = processNodesData(props.data)

    // If no nodes, return early
    if (!nodesData.length) return

    // Calculate max metrics
    calculateMaxMetrics(nodesData)

    // Calculate total width based on number of trees
    const treeWidth = 300 // Width per tree
    const spacing = 100 // Spacing between trees

    // Clear node positions map
    nodePositions.value.clear()

    // Render each node's tree
    nodesData.forEach((nodeData, index) => {
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
        .attr('transform', `translate(${treeWidth / 2 - 50}, 25)`)

      // Card rectangle
      nodeIndexCard
        .append('rect')
        .attr('width', 100)
        .attr('height', 40)
        .attr('rx', 5)
        .attr('ry', 5)
        .attr('class', activeNodeIndex.value === nodeIndex ? 'node-index-rect active' : 'node-index-rect')
        .style('fill', 'var(--card-bg-color)')
        .style('stroke', activeNodeIndex.value === nodeIndex ? 'var(--brand-color)' : 'var(--border-color)')
        .style('stroke-width', activeNodeIndex.value === nodeIndex ? 2 : 1)

      // Card text
      nodeIndexCard
        .append('text')
        .attr('x', 50)
        .attr('y', 25)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 14)
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
            return [node.data.size[0], node.data.size[1] + CARD_DIMENSIONS.padding]
          }
          return [CARD_DIMENSIONS.width, CARD_DIMENSIONS.minHeight + CARD_DIMENSIONS.padding]
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
        .attr('transform', `translate(${offsetX}, 90)`)
        .style('overflow', 'visible')

      // Get root node position for connecting line
      const rootNodeX = layoutRoot.x + offsetX
      const rootNodeY = layoutRoot.y

      // Add connection between node index card and tree root
      treeGroup
        .append('path')
        .attr(
          'd',
          `M${treeWidth / 2},65C${treeWidth / 2},${(65 + rootNodeY) / 2} ${rootNodeX},${
            (65 + rootNodeY) / 2
          } ${rootNodeX},${rootNodeY}`
        )
        .attr('fill', 'none')
        .attr('stroke', 'var(--border-color)')
        .attr('stroke-width', 2)
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
        .html((d) => renderNode(d, nodeIndex))
    })

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
      box-shadow: 0 0 8px var(--hover-brand-color);
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

      .node-index-link {
        stroke: var(--brand-color);
        stroke-width: 2px;
      }
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
      stroke-width: 2px;
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
