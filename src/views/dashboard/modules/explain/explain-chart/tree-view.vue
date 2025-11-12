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
      default: 0,
    },
    highlightType: {
      type: String,
      default: 'DURATION',
    },
    selectedMetric: {
      type: String,
      default: '',
    },
    metricsExpanded: {
      type: Boolean,
      default: false,
    },
  })

  // Emits
  const emit = defineEmits(['update:activeNodeIndex', 'nodePositionsUpdated', 'nodesDataUpdated'])
  const componentId = computed(() => `tree-view-stage-${props.stageIndex}`)

  // Refs
  const treeContainer = ref<HTMLDivElement | null>(null)
  const nodePositions = ref<Map<number, number>>(new Map())
  const nodesData = ref([])
  const backgroundMeasureContainer = ref<HTMLDivElement | null>(null)

  // Single traversal for all max stats (extensible for future metrics)
  type MaxStats = {
    maxRows: number
    maxDuration: number
  }

  function traverseNodeForMax(node, acc: MaxStats) {
    const outputRows = node.output_rows ?? node.outputRows ?? 0
    const elapsedCompute = node.elapsed_compute ?? node.elapsedCompute ?? 0
    if (typeof outputRows === 'number') acc.maxRows = Math.max(acc.maxRows, outputRows)
    if (typeof elapsedCompute === 'number') acc.maxDuration = Math.max(acc.maxDuration, elapsedCompute)

    if (node.metrics) {
      const m = node.metrics
      const mRows = m.output_rows ?? m.outputRows
      const mDuration = m.elapsed_compute ?? m.elapsedCompute
      if (typeof mRows === 'number') acc.maxRows = Math.max(acc.maxRows, mRows)
      if (typeof mDuration === 'number') acc.maxDuration = Math.max(acc.maxDuration, mDuration)
    }

    if (node.children && Array.isArray(node.children)) {
      node.children.forEach((child) => traverseNodeForMax(child, acc))
    }
  }

  const maxStats = computed<MaxStats>(() => {
    const acc: MaxStats = { maxRows: 0, maxDuration: 0 }
    props.data.forEach((row) => {
      try {
        const planData = JSON.parse(row[2])
        traverseNodeForMax(planData, acc)
      } catch {
        // Ignore invalid JSON
      }
    })
    return acc
  })

  // Zoom and pan states
  const transform = ref('translate(0,0) scale(1)')
  const scale = ref(1)
  const minScale = 0.1
  const maxScale = 3
  const lastTransform = ref<any>(null)

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
        lastTransform.value = event.transform
      })
  })

  // Helper functions moved from parent component
  function applyZoom(svg, preservedTransform: any = null) {
    // Set explicit dimensions first
    svg
      .attr('width', treeContainer.value?.clientWidth || 800)
      .attr('height', treeContainer.value?.clientHeight || 600)
      .attr('viewBox', null)

    // Apply zoom behavior with a reasonable initial scale
    svg.call(zoomListener.value)

    // Restore preserved transform or set an initial transform
    if (preservedTransform) {
      svg.call(zoomListener.value.transform, preservedTransform)
      lastTransform.value = preservedTransform
    } else {
      const initial = d3.zoomIdentity.translate(svg.attr('width') / 4, 50).scale(0.7)
      svg.call(zoomListener.value.transform, initial)
      lastTransform.value = initial
    }
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
    ;(svg.transition().duration(300) as any).call(zoomListener.value.scaleBy, 1.3) // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  function zoomOut() {
    const { svg } = getSvgAndGroup()
    if (!svg) return
    ;(svg.transition().duration(300) as any).call(zoomListener.value.scaleBy, 1 / 1.3) // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  function resetZoom() {
    if (!treeContainer.value) return
    const { svg } = getSvgAndGroup()
    if (!svg) return
    const containerWidth = treeContainer.value.clientWidth
    // Reset to the same initial transform used in applyZoom
    const initial = d3.zoomIdentity.translate(containerWidth / 4, 50).scale(0.7)
    ;(svg as any).call(zoomListener.value.transform, initial) // eslint-disable-line @typescript-eslint/no-explicit-any
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

  // Render PlanCard in background, get size and HTML string
  // Returns both size and innerHTML string for reuse in foreignObject
  function renderCardInBackground(nodeData: any, nodeIndex: number): Promise<{ size: [number, number]; html: string }> {
    // Create a hidden measurement container (reused for all cards)
    if (!backgroundMeasureContainer.value) {
      const container = document.createElement('div')
      container.style.position = 'absolute'
      container.style.visibility = 'hidden'
      container.style.width = `${CARD_DIMENSIONS.width}px`
      container.style.top = '-9999px'
      container.style.left = '-9999px'
      document.body.appendChild(container)
      backgroundMeasureContainer.value = container
    }

    // Create a div for this specific card
    const cardContainer = document.createElement('div')
    backgroundMeasureContainer.value.appendChild(cardContainer)

    // Render PlanCard in the hidden container
    render(
      h(PlanCard, {
        nodeData,
        highlightType: props.highlightType,
        maxRows: maxStats.value.maxRows,
        maxDuration: maxStats.value.maxDuration,
        selectedMetric: props.selectedMetric,
        metricsExpanded: props.metricsExpanded,
        isActive: props.activeNodeIndex === nodeIndex,
        stageIndex: props.stageIndex,
      }),
      cardContainer
    )

    // Wait for Vue to render, then get size and HTML
    return new Promise<{ size: [number, number]; html: string }>((resolve) => {
      nextTick(() => {
        const cardElement = cardContainer.querySelector('.plan-card') as HTMLElement
        const width = cardElement?.offsetWidth || CARD_DIMENSIONS.width
        const height = cardElement?.offsetHeight || CARD_DIMENSIONS.minHeight

        // Get the innerHTML string from the container
        const html = cardContainer.innerHTML

        // Remove from measurement container
        backgroundMeasureContainer.value?.removeChild(cardContainer)

        resolve({ size: [width, height], html })
      })
    })
  }

  // Helper to create unique key for a node
  function getNodeKey(nodeIndex: number, nodePath: string[]): string {
    return `${nodeIndex}:${nodePath.join('/')}`
  }

  // Helper to get node path from hierarchy node
  function getNodePath(node: any): string[] {
    const path: string[] = []
    let current: any = node
    while (current) {
      path.unshift(current.data?.name || '')
      current = current.parent
    }
    return path
  }

  // Draw connection line from node label to tree root
  function drawNodeIndexLink(
    treeGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    treeWidth: number,
    layoutRoot: any,
    offsetX: number
  ) {
    const rootNodeX = layoutRoot.x + offsetX
    const rootNodeY = layoutRoot.y
    const labelBottom = 20 + NODE_INDEX_CARD.height

    treeGroup
      .append('path')
      .attr(
        'd',
        `M${treeWidth / 2},${labelBottom}C${treeWidth / 2},${(labelBottom + rootNodeY + 60) / 2} ${rootNodeX},${
          (labelBottom + rootNodeY + 60) / 2
        } ${rootNodeX},${rootNodeY + 60}`
      )
      .attr('fill', 'none')
      .attr('stroke', 'var(--border-color)')
      .attr('stroke-width', 1)
      .attr('class', 'node-label-link')
  }

  // Draw links (lines) connecting parent to child nodes
  function drawTreeLinks(container: d3.Selection<SVGGElement, unknown, null, undefined>, layoutRoot: any) {
    container
      .selectAll('.link')
      .data(layoutRoot.links())
      .join('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', 'var(--border-color)')
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'square')
      .attr('stroke-linejoin', 'round')
      .attr('d', (d) => lineGen.value(d as unknown as FlexHierarchyPointLink))
  }

  // Draw tree nodes (plan cards) using pre-rendered HTML
  function drawTreeNodes(
    container: d3.Selection<SVGGElement, unknown, null, undefined>,
    layoutRoot: any,
    nodeIndex: number,
    renderedCardsMap: Map<string, { size: [number, number]; html: string }>
  ) {
    const nodeElements = container
      .selectAll('.node')
      .data(layoutRoot.descendants())
      .join('g')
      .attr('class', 'node')
      .attr('transform', (d: any) => {
        const nodeWidth = d.data.size?.[0] ?? CARD_DIMENSIONS.width
        return `translate(${d.x - nodeWidth / 2},${d.y})`
      })

    // Add foreignObject with pre-rendered HTML for each node
    nodeElements
      .selectAll('foreignObject')
      .data((d: any) => [d])
      .join('foreignObject')
      .attr('width', (d: any) => (d.data.size?.[0] ?? CARD_DIMENSIONS.width) + 10)
      .attr('height', (d: any) => (d.data.size?.[1] ?? CARD_DIMENSIONS.minHeight) + 10)
      .each(function renderCardHTML(d: any) {
        // Get rendered HTML string from Map using unique key
        const nodePath = getNodePath(d)
        const key = getNodeKey(nodeIndex, nodePath)
        const cardData = renderedCardsMap.get(key)

        if (cardData) {
          // Set innerHTML to the pre-rendered HTML string
          // Type assertion needed because 'this' is SVGForeignObjectElement
          ;(this as SVGForeignObjectElement).innerHTML = cardData.html
          // Remove from Map after use to free memory
          renderedCardsMap.delete(key)
        }
      })
  }

  // Note: Scrolling and highlighting are handled by parent component.

  async function renderTree() {
    if (!treeContainer.value || !props.data || props.data.length === 0) return

    // Preserve current zoom transform from ref
    const preservedTransform = lastTransform.value || null

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

    // Apply zoom behavior safely, preserving previous transform if any
    applyZoom(svg, preservedTransform)

    // Add main group for transformation during zoom/pan
    const mainGroup = svg.append('g').attr('class', componentId.value) // Add class to main group
    if (preservedTransform) {
      // Ensure group reflects the preserved transform immediately
      mainGroup.attr('transform', preservedTransform)
    }

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

    // Map to store rendered HTML strings and sizes by unique key (nodeIndex + node path)
    const renderedCardsMap = new Map<string, { size: [number, number]; html: string }>()

    // First pass: Render all cards in background and store HTML strings in Map
    // Collect all render promises first, then await them all at once
    const allRenderPromises: Promise<void>[] = []

    for (let index = 0; index < nodesData.value.length; index += 1) {
      const nodeData = nodesData.value[index]
      const { nodeIndex, plan } = nodeData

      // Convert plan data to hierarchy-friendly format
      const rootData = toHierarchy(plan, nodeIndex)
      // Ensure nodeIndex is valid
      if (Number.isNaN(nodeIndex)) {
        continue
      }

      // Create hierarchy and render all cards in background
      const hierarchy = d3.hierarchy(rootData, (d) => d.children || [])

      hierarchy.each((d: any) => {
        const nodePath = getNodePath(d)
        const key = getNodeKey(nodeIndex, nodePath)
        const promise = renderCardInBackground(d.data, nodeIndex).then(({ size, html }) => {
          renderedCardsMap.set(key, { size, html })
        })
        allRenderPromises.push(promise)
      })
    }

    // Wait for all cards to render (single await outside loop)
    if (allRenderPromises.length > 0) {
      await Promise.all(allRenderPromises)
    }

    // Render trees with measured sizes and use HTML strings
    // Sizes are retrieved directly from map in nodeSize function
    for (let index = 0; index < nodesData.value.length; index += 1) {
      const nodeData = nodesData.value[index]
      const { nodeIndex, plan } = nodeData

      if (Number.isNaN(nodeIndex)) {
        continue
      }

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

      // Add node label
      const nodeLabel = treeGroup
        .append('g')
        .attr('class', `node-label ${props.activeNodeIndex === nodeIndex ? 'active-node-label' : ''}`)
        .attr('transform', `translate(${treeWidth / 2 - NODE_INDEX_CARD.width / 2}, 20)`)

      // Label rectangle
      nodeLabel
        .append('rect')
        .attr('width', NODE_INDEX_CARD.width)
        .attr('height', NODE_INDEX_CARD.height)
        .attr('rx', 4)
        .attr('ry', 4)
        .attr('class', props.activeNodeIndex === nodeIndex ? 'node-label-rect active' : 'node-label-rect')

      // Label text
      nodeLabel
        .append('text')
        .attr('x', NODE_INDEX_CARD.width / 2)
        .attr('y', NODE_INDEX_CARD.height / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', NODE_INDEX_CARD.fontSize)
        .attr('font-weight', 'bold')
        .attr('fill', 'var(--main-font-color)')
        .text(`Node ${nodeIndex}`)

      // Make label clickable
      nodeLabel.style('cursor', 'pointer').on('click', () => {
        emit('update:activeNodeIndex', nodeIndex)
      })

      const rootData = toHierarchy(plan, nodeIndex)
      const hierarchy = d3.hierarchy(rootData, (d) => d.children || [])

      // Create the tree layout
      // Get sizes directly from map since hierarchy is recreated
      const treeLayout = flextree({
        nodeSize: (node: any) => {
          // Get size directly from map using node path
          const nodePath = getNodePath(node)
          const key = getNodeKey(nodeIndex, nodePath)
          const cardData = renderedCardsMap.get(key)

          if (cardData) {
            return [cardData.size[0] + CARD_DIMENSIONS.horizontalPadding, cardData.size[1] + CARD_DIMENSIONS.padding]
          }
          // Fallback if not found in map
          return [
            CARD_DIMENSIONS.width + CARD_DIMENSIONS.horizontalPadding,
            CARD_DIMENSIONS.minHeight + CARD_DIMENSIONS.padding,
          ]
        },
      })

      // Apply layout to get positioned nodes
      const layoutRoot = treeLayout(hierarchy as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      // Calculate offset to center the root node horizontally
      const offsetX = treeWidth / 2 - layoutRoot.x

      // Create tree container group with offset
      const nodeTreeContainer = treeGroup
        .append('g')
        .attr('transform', `translate(${offsetX}, 60)`)
        .style('overflow', 'visible')

      // Draw connection line from node label to tree root
      drawNodeIndexLink(treeGroup, treeWidth, layoutRoot, offsetX)

      // Draw tree links (lines connecting parent to child nodes)
      drawTreeLinks(nodeTreeContainer, layoutRoot)

      // Draw tree nodes (plan cards)
      drawTreeNodes(nodeTreeContainer, layoutRoot, nodeIndex, renderedCardsMap)
    }

    // Clean up background measurement container
    if (backgroundMeasureContainer.value) {
      document.body.removeChild(backgroundMeasureContainer.value)
      backgroundMeasureContainer.value = null
    }

    // Notify parent about node positions
    emit('nodePositionsUpdated', nodePositions.value)
  }

  watch(
    () => props.data,
    () => {
      nextTick(() => {
        renderTree()
      })
    },
    { immediate: true }
  )

  watch(
    () => props.highlightType,
    () => {
      nextTick(() => {
        renderTree()
      })
    }
  )

  watch(
    () => props.selectedMetric,
    () => {
      nextTick(() => {
        renderTree()
      })
    }
  )

  watch(
    () => props.metricsExpanded,
    () => {
      nextTick(() => {
        renderTree()
      })
    }
  )

  // Expose methods for parent component
  defineExpose({
    zoomIn,
    zoomOut,
    resetZoom,
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

  :deep(.node-label-rect) {
    fill: var(--light-brand-color);
    stroke-width: 1px;

    &.active {
      fill: var(--light-brand-color);
    }
  }

  :deep(.node-label-link) {
    stroke-linecap: round;
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

  :deep(.node-label) {
    cursor: pointer;
  }

  :deep(foreignObject) {
    overflow: visible !important;
  }
</style>
