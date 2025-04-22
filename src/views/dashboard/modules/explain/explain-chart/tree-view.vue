<template>
  <div ref="treeContainer" class="tree-container"></div>
</template>

<script lang="ts" setup>
  import * as d3 from 'd3'
  import { flextree } from 'd3-flextree'
  import { createVNode, render, h } from 'vue'
  import PlanCard from './plan-card.vue'
  import { CARD_DIMENSIONS, NODE_INDEX_CARD, getProgressColor } from '../utils'

  // Define interfaces (moved from parent)
  interface FlexHierarchyPointNode extends d3.HierarchyPointNode<any> {
    xSize: number
    ySize: number
  }

  interface FlexHierarchyPointLink {
    source: FlexHierarchyPointNode
    target: FlexHierarchyPointNode
  }

  // Props definition
  const props = defineProps({
    stageIndex: {
      type: Number,
      required: true,
    },
    data: {
      type: Array,
      required: true,
    },
    activeNodeIndex: {
      type: Number,
      default: null,
    },
    highlightType: {
      type: String,
      default: 'NONE',
    },
    selectedMetric: {
      type: String,
      default: '',
    },
    metricsExpanded: {
      type: Boolean,
      default: false,
    },
    maxRows: {
      type: Number,
      default: 0,
    },
    maxDuration: {
      type: Number,
      default: 0,
    },
  })

  // Emits
  const emit = defineEmits(['update:activeNodeIndex', 'nodePositionsUpdated', 'nodesDataUpdated'])
  const componentId = computed(() => `tree-view-stage-${props.stageIndex}`)

  // Refs
  const treeContainer = ref<HTMLDivElement | null>(null)
  const nodePositions = ref<Map<number, number>>(new Map())
  const nodesData = ref([])

  // Zoom and pan states
  const transform = ref('translate(0,0) scale(1)')
  const scale = ref(1)
  const minScale = 0.1
  const maxScale = 3

  // Create a line generator function
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
        const g = d3.select(treeContainer.value).select('svg > g')
        g.attr('transform', event.transform)
        transform.value = event.transform
        scale.value = event.transform.k
      })
  })

  // Helper functions moved from parent component
  function applyZoom(svg) {
    // Set explicit dimensions first
    svg
      .attr('width', treeContainer.value?.clientWidth || 800)
      .attr('height', treeContainer.value?.clientHeight || 600)
      .attr('viewBox', null)

    // Apply zoom behavior with a reasonable initial scale
    svg.call(zoomListener.value)

    // Set an initial transform with scale 0.7
    svg.call(zoomListener.value.transform, d3.zoomIdentity.translate(svg.attr('width') / 4, 50).scale(0.7))
  }

  function getSvgAndGroup() {
    if (!treeContainer.value) return { svg: null, group: null }
    const svg = d3.select(treeContainer.value).select('svg')
    const group = svg.select('g') // Main transform group
    return { svg, group }
  }

  // Zoom control functions
  function zoomIn() {
    const { svg } = getSvgAndGroup()
    if (!svg) return

    svg.transition().duration(300).call(zoomListener.value.scaleBy, 1.3)
  }

  function zoomOut() {
    const { svg } = getSvgAndGroup()
    if (!svg) return

    svg
      .transition()
      .duration(300)
      .call(zoomListener.value.scaleBy, 1 / 1.3)
  }

  function resetZoom() {
    if (!treeContainer.value) return

    // Get container dimensions
    const containerWidth = treeContainer.value.clientWidth
    const containerHeight = treeContainer.value.clientHeight

    // Get SVG selections
    const { svg, group } = getSvgAndGroup()
    if (!svg || !group) return

    // Update SVG dimensions
    svg.attr('width', containerWidth).attr('height', containerHeight)

    // If there's an active node, center on it (existing code)
    if (props.activeNodeIndex !== null) {
      try {
        // Existing code for centering on active node
        const activeNodeGroup = svg.select(`g .tree-group.node-${props.activeNodeIndex}`)
        if (!activeNodeGroup.empty()) {
          const groupNode = activeNodeGroup.node()
          if (!groupNode) return
          const groupBBox = groupNode.getBBox()

          // Use minimal padding
          const padding = 20
          const scaleX = containerWidth / (groupBBox.width + padding * 2)
          const scaleY = containerHeight / (groupBBox.height + padding * 2)
          const newScale = Math.min(scaleX, scaleY, maxScale)

          // Calculate translation to center the tree
          const tx = containerWidth / 2 - (groupBBox.x + groupBBox.width / 2) * newScale
          const ty = containerHeight / 2 - (groupBBox.y + groupBBox.height / 2) * newScale

          // Create a proper transform object and apply it
          const transform2 = d3.zoomIdentity.translate(tx, ty).scale(newScale)

          // Apply transform
          svg.transition().duration(750).call(zoomListener.value.transform, transform2)
          return
        }
      } catch (e) {
        console.warn('Failed to center on active node, using improved centering', e)
      }
    }

    // Center and scale all trees
    try {
      // Select all tree groups
      const allTreeGroups = svg.selectAll('g .tree-group')
      if (!allTreeGroups.empty()) {
        // Calculate overall bounding box for all trees
        const totalBBox = { x: Infinity, y: Infinity, width: 0, height: 0, right: 0, bottom: 0 }

        allTreeGroups.each(function () {
          const groupBBox = this.getBBox()
          totalBBox.x = Math.min(totalBBox.x, groupBBox.x)
          totalBBox.y = Math.min(totalBBox.y, groupBBox.y)
          totalBBox.right = Math.max(totalBBox.right, groupBBox.x + groupBBox.width)
          totalBBox.bottom = Math.max(totalBBox.bottom, groupBBox.y + groupBBox.height)
        })

        // Complete the bounding box calculation
        totalBBox.width = totalBBox.right - totalBBox.x
        totalBBox.height = totalBBox.bottom - totalBBox.y

        // Add padding for better visualization
        const padding = 20

        // Calculate scale to fit all trees with padding
        const scaleX = (containerWidth - padding * 2) / totalBBox.width
        const scaleY = (containerHeight - padding * 2) / totalBBox.height

        // Use the smaller scale to ensure everything fits
        const newScale = Math.min(scaleX, scaleY, 1.0) // Cap at 1.0 to avoid too much zoom

        // Calculate translation to center all trees
        const tx = containerWidth / 2 - (totalBBox.x + totalBBox.width / 2) * newScale
        const ty = containerHeight / 2 - (totalBBox.y + totalBBox.height / 2) * newScale

        // Create transform and apply it
        const optimalTransform = d3.zoomIdentity.translate(tx, ty).scale(newScale)
        svg.transition().duration(750).call(zoomListener.value.transform, optimalTransform)
        return
      }
    } catch (e) {
      console.warn('Failed to calculate optimal transform, using default', e)
    }

    // Fallback to a more reasonable default if all else fails
    const defaultTransform = d3.zoomIdentity.translate(containerWidth / 2, containerHeight / 4).scale(0.7)
    svg.transition().duration(750).call(zoomListener.value.transform, defaultTransform)
  }

  // Add these functions to the script section

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
    if (!props.metricsExpanded || !nodeMetrics) {
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
      if (props.metricsExpanded) {
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

  // Add these functions to the script section

  function updateTreeLayout() {
    // Get each tree group
    const availableNodes = [...nodePositions.value.keys()]
    availableNodes.forEach((nodeIdx) => {
      const treeGroup = d3.select(treeContainer.value).select(`svg.${componentId.value} g .tree-group.node-${nodeIdx}`)
      if (treeGroup.empty()) return

      // Get the tree container
      const treeContainer2 = treeGroup.select('g:last-of-type')
      if (treeContainer2.empty()) return

      // Get all nodes
      const nodes = treeContainer2.selectAll('.node').data()
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
      treeContainer2.selectAll('.node').each(function (d, i) {
        if (i >= root.descendants().length) return

        const newPos = root.descendants()[i]
        if (!newPos) return

        const xSize = (newPos as unknown as FlexHierarchyPointNode).xSize || CARD_DIMENSIONS.width
        d3.select(this).attr('transform', `translate(${newPos.x - xSize / 2},${newPos.y})`)
      })

      // Update links with the new positions
      treeContainer2.selectAll('.link').each(function (d, i) {
        if (i >= root.links().length) return

        const links = root.links()
        if (links[i]) {
          d3.select(this).attr('d', lineGen.value(links[i] as unknown as FlexHierarchyPointLink))
        }
      })
    })
  }

  function scrollToNode(nodeIdx) {
    // Emit event to update parent's activeNodeIndex
    emit('update:activeNodeIndex', nodeIdx)

    // Only update what's necessary in the DOM directly
    d3.selectAll(`.${componentId.value}.tree-group .plan-card`).classed('active-card', false)
    d3.selectAll(`.${componentId.value}.tree-group`).classed('active-tree', false)
    d3.selectAll(`.${componentId.value}.tree-group .node-index-rect`).classed('active', false)

    // Add highlight to new node
    d3.selectAll(`.${componentId.value}.tree-group.node-${nodeIdx} .plan-card`).classed('active-card', true)
    d3.selectAll(`.${componentId.value}.tree-group.node-${nodeIdx}`).classed('active-tree', true)
    d3.selectAll(`.${componentId.value}.tree-group.node-${nodeIdx} .node-index-rect`).classed('active', true)

    // Handle scrolling to the node
    const position = nodePositions.value.get(nodeIdx)
    if (position !== undefined && treeContainer.value) {
      const containerRect = treeContainer.value.getBoundingClientRect()
      const svg = d3.select(treeContainer.value).select('svg').node()
      const currentTransform = d3.zoomTransform(svg)

      // Calculate the translation needed to center on this node
      const desiredTransX = containerRect.width / 2 - position * currentTransform.k

      // Apply new transform that preserves vertical position and scale
      d3.select(treeContainer.value)
        .select('svg')
        .transition()
        .duration(500)
        .call(
          zoomListener.value.transform,
          d3.zoomIdentity.translate(desiredTransX, currentTransform.y).scale(currentTransform.k)
        )
    }
  }

  function renderTree() {
    if (!treeContainer.value || !props.data || props.data.length === 0) return

    // Clear previous content
    treeContainer.value.innerHTML = ''

    // Create container for zoomable content with explicit dimensions
    const svg = d3
      .select(treeContainer.value)
      .append('svg')
      .attr('width', treeContainer.value.clientWidth)
      .attr('height', treeContainer.value.clientHeight)
      .attr('class', `explain-svg ${componentId.value}`)
      .attr('viewBox', `0 0 ${treeContainer.value.clientWidth} ${treeContainer.value.clientHeight}`)

    // Apply zoom behavior safely
    applyZoom(svg)

    // Add main group for transformation during zoom/pan
    const mainGroup = svg.append('g').attr('class', componentId.value) // Add class to main group

    // Process all node data - we need one tree per node
    nodesData.value = processNodesData(props.data)

    // Add this line to emit the processed data
    emit('nodesDataUpdated', nodesData.value)

    // If no nodes, return early
    if (!nodesData.value.length) return

    // Calculate total width based on number of trees
    const treeWidth = 250 // Smaller width per tree
    const spacing = 50 // Smaller spacing

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

      // Create a group for this tree with appropriate class
      const treeGroup = mainGroup
        .append('g')
        .attr(
          'class',
          `tree-group node-${nodeIndex} ${componentId.value} ${
            props.activeNodeIndex === nodeIndex ? 'active-tree' : ''
          }`
        )
        .attr('transform', `translate(${index * (treeWidth + spacing)}, 0)`)
        .style('overflow', 'visible')

      // Add node index card
      const nodeIndexCard = treeGroup
        .append('g')
        .attr('class', `node-index-card ${props.activeNodeIndex === nodeIndex ? 'active-node-index' : ''}`)
        .attr('transform', `translate(${treeWidth / 2 - NODE_INDEX_CARD.width / 2}, 20)`) // Centered with new width

      // Card rectangle
      nodeIndexCard
        .append('rect')
        .attr('width', NODE_INDEX_CARD.width)
        .attr('height', NODE_INDEX_CARD.height)
        .attr('rx', 4) // Slightly smaller corner radius
        .attr('ry', 4)
        .attr('class', props.activeNodeIndex === nodeIndex ? 'node-index-rect active' : 'node-index-rect')
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
      const hierarchy = d3.hierarchy(rootData, (d) => d.children || [])
      hierarchy.each((d) => {
        const nodeMetrics = d.data.metrics || {}
        const hasMetrics =
          props.metricsExpanded || (props.selectedMetric && nodeMetrics[props.selectedMetric] !== undefined)
        const hasProgressBar = props.highlightType !== 'NONE'
        const metricsLines = calculateMetricsLines(nodeMetrics, hasMetrics)
        const cardHeight = calculateCardHeight(hasProgressBar, hasMetrics, metricsLines)

        // Set size in node data for layout
        d.data.size = [CARD_DIMENSIONS.width, cardHeight]
      })

      // Create the tree layout
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
      const treeContainer2 = treeGroup
        .append('g')
        .attr('transform', `translate(${offsetX}, 60)`)
        .style('overflow', 'visible')

      const rootNodeX = layoutRoot.x + offsetX
      const rootNodeY = layoutRoot.y

      // Calculate the bottom of the node index card
      const cardBottom = 20 + NODE_INDEX_CARD.height
      // Add connection between node index card and tree root
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
      treeContainer2
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
      const nodeElements = treeContainer2
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
            props.metricsExpanded || (props.selectedMetric && nodeMetrics[props.selectedMetric] !== undefined)
          const hasProgressBar = props.highlightType !== 'NONE'
          const metricsLines = calculateMetricsLines(nodeMetrics, hasMetrics)
          const cardHeight = calculateCardHeight(hasProgressBar, hasMetrics, metricsLines)
          return cardHeight + 10
        })
        .each(function (d) {
          // Create a div to mount the Vue component
          const container = document.createElement('div')
          this.appendChild(container)

          // Mount the PlanCard component
          render(
            h(PlanCard, {
              nodeData: d.data,
              highlightType: props.highlightType,
              maxRows: props.maxRows,
              maxDuration: props.maxDuration,
              selectedMetric: props.selectedMetric,
              metricsExpanded: props.metricsExpanded,
              isActive: props.activeNodeIndex === nodeIndex,
              stageIndex: props.stageIndex,
            }),
            container
          )
        })
      // (Continue with the tree rendering code)

      // This section should be completed with the rest of the tree rendering logic
    })

    // Notify parent about node positions
    emit('nodePositionsUpdated', nodePositions.value)
  }

  // Call renderTree when component mounts
  onMounted(() => {
    if (treeContainer.value) {
      // Short delay to ensure container is properly sized
      setTimeout(renderTree, 100)
    }
  })

  // Watch for prop changes
  watch(() => props.data, renderTree)
  watch(
    () => props.activeNodeIndex,
    (newValue, oldValue) => {
      if (newValue !== oldValue && newValue !== null) {
        nextTick(() => {
          // Scope the selections to this component only
          d3.selectAll(`.${componentId.value}.tree-group`).classed('active-tree', false)
          d3.selectAll(`.${componentId.value}.tree-group .plan-card`).classed('active-card', false)
          d3.selectAll(`.${componentId.value}.tree-group .node-index-rect`).classed('active', false)

          d3.selectAll(`.${componentId.value}.tree-group.node-${newValue}`).classed('active-tree', true)
          d3.selectAll(`.${componentId.value}.tree-group.node-${newValue} .plan-card`).classed('active-card', true)
          d3.selectAll(`.${componentId.value}.tree-group.node-${newValue} .node-index-rect`).classed('active', true)
        })
      }
    }
  )

  function updateNodeVisualization() {
    if (!treeContainer.value) return

    // Update all nodes with current props
    d3.selectAll(`svg.${componentId.value} g.${componentId.value} .tree-group .node foreignObject`).each(function () {
      const nodeData = d3.select(this.parentNode).datum()
      if (!nodeData || !nodeData.data) return

      // Get container div
      const container = this.querySelector('div')
      if (!container) return

      // Get node index from tree group
      const treeGroupElement = this.closest(`.tree-group.${componentId.value}`)
      if (!treeGroupElement) return

      const nodeIdxMatch = treeGroupElement.className.baseVal.match(/node-(\d+)/)
      const nodeIndex = nodeIdxMatch ? parseInt(nodeIdxMatch[1], 10) : null

      // Re-render PlanCard with updated props
      render(
        h(PlanCard, {
          nodeData: nodeData.data,
          highlightType: props.highlightType,
          maxRows: props.maxRows,
          maxDuration: props.maxDuration,
          selectedMetric: props.selectedMetric,
          metricsExpanded: props.metricsExpanded,
          isActive: props.activeNodeIndex === nodeIndex,
          stageIndex: props.stageIndex,
        }),
        container
      )

      // Calculate new height
      const hasMetrics =
        props.metricsExpanded ||
        (props.selectedMetric && nodeData.data.metrics && nodeData.data.metrics[props.selectedMetric] !== undefined)
      const hasProgressBar = props.highlightType !== 'NONE'
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

  watch(
    () => props.highlightType,
    (newValue) => {
      nextTick(() => {
        updateNodeVisualization()
      })
    }
  )

  watch(
    () => props.selectedMetric,
    (newValue) => {
      nextTick(() => {
        updateNodeVisualization()
      })
    }
  )

  watch(
    () => props.metricsExpanded,
    (newValue) => {
      nextTick(() => {
        updateNodeVisualization()
      })
    }
  )

  // Expose methods for parent component
  defineExpose({
    zoomIn,
    zoomOut,
    resetZoom,
    updateTreeLayout,
    renderTree,
  })
</script>

<style lang="less" scoped>
  .tree-container {
    width: 100%;
    height: 100%;
    position: relative;
  }

  :deep(.tree-group) {
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

  :deep(.node-index-rect) {
    fill: var(--card-bg-color);
    stroke: var(--border-color);
    stroke-width: 1px;

    &.active {
      fill: var(--light-brand-color);
      stroke: var(--brand-color);
    }
  }

  :deep(.node-index-link) {
    stroke-linecap: round;
    stroke-dasharray: 4 2;
  }

  :deep(.link) {
    stroke: var(--border-color);
    stroke-width: 2px !important;
    stroke-linecap: square;
    stroke-linejoin: round;
    pointer-events: none;
    z-index: 1;
  }

  :deep(.node) {
    z-index: 2;
    overflow: visible !important;
  }

  :deep(svg) {
    overflow: visible !important;
  }

  :deep(.node-index-card) {
    cursor: pointer;
  }

  :deep(foreignObject) {
    overflow: visible !important;
  }
</style>
