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

  // Type for tree node data
  interface TreeNodeData {
    name: string
    nodeIndex?: number
    isNodeLabel?: boolean
    children?: TreeNodeData[]
    [key: string]: any // Allow additional properties
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
  const emit = defineEmits(['update:activeNodeIndex', 'nodePositionsUpdated', 'nodesDataUpdated', 'svgCreated'])
  const componentId = computed(() => `tree-view-stage-${props.stageIndex}`)

  // Refs
  const treeContainer = ref<HTMLDivElement | null>(null)
  const nodePositions = ref<Map<number, number>>(new Map())
  const nodesData = ref([])
  const backgroundMeasureContainer = ref<HTMLDivElement | null>(null)
  const nodeTreeBoundsMap = ref<Map<number, { minX: number; maxX: number }>>(new Map())
  const treeOffsetX = ref<number>(0)

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
      isNodeLabel: false, // Plan nodes are not node labels
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
      container.style.width = 'auto' // Let cards determine their own width
      container.style.minWidth = `${CARD_DIMENSIONS.width}px` // Minimum width fallback
      container.style.top = '-9999px'
      container.style.left = '-9999px'
      document.body.appendChild(container)
      backgroundMeasureContainer.value = container
    }

    // Create a div for this specific card
    const cardContainer = document.createElement('div')
    cardContainer.style.width = 'auto' // Let card expand based on content
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
        const width = cardElement?.offsetWidth || cardElement?.scrollWidth || CARD_DIMENSIONS.width
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
  // Filters out fake root and node label names, keeping only plan operator names
  function getNodePath(node: d3.HierarchyNode<TreeNodeData>): string[] {
    const path: string[] = []
    let current: d3.HierarchyNode<TreeNodeData> | null = node
    while (current) {
      const name = current.data?.name || ''
      // Skip fake root and node labels - only include actual plan operators
      if (name !== 'FakeRoot' && !current.data?.isNodeLabel) {
        path.unshift(name)
      }
      current = current.parent
    }
    return path
  }

  // Note: Scrolling and highlighting are handled by parent component.

  async function renderTree() {
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

    // Emit event for zoom controls to apply zoom behavior
    // The preservedTransform will be retrieved by the parent/zoom-controls
    emit('svgCreated', { svg })

    // Add main group for transformation during zoom/pan
    const mainGroup = svg.append('g').attr('class', componentId.value)

    // Process all node data
    nodesData.value = processNodesData(props.data)
    emit('nodesDataUpdated', nodesData.value)

    // If no nodes, return early
    if (!nodesData.value.length) return

    // Clear node positions and bounds maps
    nodePositions.value.clear()
    nodeTreeBoundsMap.value.clear()

    // Map to store rendered HTML strings and sizes by unique key (nodeIndex + node path)
    const renderedCardsMap = new Map<string, { size: [number, number]; html: string }>()
    // Build merged tree structure with fake root
    // FakeRoot -> Node Label -> Plan Tree
    const mergedTreeData = {
      name: 'FakeRoot',
      nodeIndex: -1,
      isNodeLabel: false,
      children: nodesData.value
        .filter((nodeData) => !Number.isNaN(nodeData.nodeIndex))
        .map((nodeData) => {
          const { nodeIndex, plan } = nodeData
          const planTree = toHierarchy(plan, nodeIndex)
          return {
            name: `Node ${nodeIndex}`,
            nodeIndex,
            isNodeLabel: true, // Mark as node label
            children: [planTree], // Plan tree as child of node label
          }
        }),
    }

    // Create hierarchy from merged tree first
    const hierarchy = d3.hierarchy<TreeNodeData>(mergedTreeData, (d) => d.children || [])

    // First pass: Render all plan cards in background and store HTML strings
    // Use hierarchy.descendants() to get all nodes directly
    const allRenderPromises: Promise<void>[] = []

    hierarchy.descendants().forEach((d) => {
      const node = d.data

      // Skip fake root and node labels - they'll be rendered as SVG elements
      if (node.name === 'FakeRoot' || node.isNodeLabel) {
        return
      }

      // Render all plan nodes that have a valid nodeIndex
      if (node.nodeIndex !== undefined && node.nodeIndex !== -1) {
        // Get path from hierarchy node (getNodePath filters out fake root and node labels)
        const nodePath = getNodePath(d)
        const key = getNodeKey(node.nodeIndex, nodePath)
        const promise = renderCardInBackground(node, node.nodeIndex).then(({ size, html }) => {
          renderedCardsMap.set(key, { size, html })
        })
        allRenderPromises.push(promise)
      }
    })

    // Wait for all cards to render
    if (allRenderPromises.length > 0) {
      await Promise.all(allRenderPromises)
    }

    // Create the tree layout with dynamic sizing
    const treeLayout = flextree({
      nodeSize: (node: d3.HierarchyNode<TreeNodeData>) => {
        const { data } = node

        // Skip fake root - don't calculate size for it
        if (data.name === 'FakeRoot') {
          return [0, 0] // No size for fake root
        }

        // Node label nodes need special sizing
        if (data.isNodeLabel) {
          return [
            NODE_INDEX_CARD.width + CARD_DIMENSIONS.horizontalPadding,
            NODE_INDEX_CARD.height + CARD_DIMENSIONS.padding,
          ]
        }

        // Regular plan nodes - get size from rendered map
        if (data.nodeIndex !== undefined && data.nodeIndex !== -1) {
          const nodePath = getNodePath(node)
          const key = getNodeKey(data.nodeIndex, nodePath)
          const cardData = renderedCardsMap.get(key)

          if (cardData) {
            return [cardData.size[0] + CARD_DIMENSIONS.horizontalPadding, cardData.size[1] + CARD_DIMENSIONS.padding]
          }
        }

        // Fallback
        return [
          CARD_DIMENSIONS.width + CARD_DIMENSIONS.horizontalPadding,
          CARD_DIMENSIONS.minHeight + CARD_DIMENSIONS.padding,
        ]
      },
    })

    // Apply layout to get positioned nodes
    const layoutRoot = treeLayout(hierarchy) // eslint-disable-line @typescript-eslint/no-explicit-any

    // Calculate tree bounds and nodeTree bounds in a single pass
    // Get leftmost and rightmost edges considering node widths
    let minX = Infinity
    let maxX = -Infinity
    layoutRoot.each((d) => {
      // Skip fake root when calculating bounds
      if (d.data.name === 'FakeRoot') return

      let leftEdge = d.x
      let rightEdge = d.x

      // For node labels, use fixed width
      if (d.data.isNodeLabel) {
        leftEdge = d.x - NODE_INDEX_CARD.width / 2
        rightEdge = d.x + NODE_INDEX_CARD.width / 2
      } else if (d.data.nodeIndex !== undefined && d.data.nodeIndex !== -1) {
        // For plan nodes, get width from rendered map
        const nodePath = getNodePath(d)
        const key = getNodeKey(d.data.nodeIndex, nodePath)
        const cardData = renderedCardsMap.get(key)
        const nodeWidth = cardData?.size[0] ?? CARD_DIMENSIONS.width
        leftEdge = d.x - nodeWidth / 2
        rightEdge = d.x + nodeWidth / 2
      }

      // Update overall tree bounds
      if (leftEdge < minX) {
        minX = leftEdge
      }
      if (rightEdge > maxX) {
        maxX = rightEdge
      }

      // Update bounds for each nodeTree (in local coordinate space)
      const { nodeIndex } = d.data
      if (nodeIndex !== undefined && nodeIndex !== -1) {
        const existing = nodeTreeBoundsMap.value.get(nodeIndex)
        if (existing) {
          existing.minX = Math.min(existing.minX, leftEdge)
          existing.maxX = Math.max(existing.maxX, rightEdge)
        } else {
          nodeTreeBoundsMap.value.set(nodeIndex, { minX: leftEdge, maxX: rightEdge })
        }
      }
    })

    // Calculate tree center and center it in SVG
    if (minX === Infinity || maxX === -Infinity) {
      // Fallback if no nodes found
      minX = 0
      maxX = 0
    }
    // Left-align the tree with 20px padding from the left edge
    const offsetX = -minX + 20
    treeOffsetX.value = offsetX

    // Create container for the entire tree
    const treeContainerGroup = mainGroup
      .append('g')
      .attr('transform', `translate(${offsetX}, 20)`)
      .style('overflow', 'visible')

    // Get all nodes to render (excluding fake root)
    const nodesToRender = layoutRoot.descendants().filter((d: any) => d.data.name !== 'FakeRoot')

    // Draw links first (so they appear behind nodes)
    const links = layoutRoot.links().filter((link: any) => {
      // Don't draw links from fake root
      return link.source.data.name !== 'FakeRoot'
    })

    // Create line generator with access to rendered cards map
    const createLineGen = (renderedMap: Map<string, { size: [number, number]; html: string }>) => {
      return (link: FlexHierarchyPointLink) => {
        const { source, target } = link

        // Get source node size
        let sourceHeight = 40 // fallback
        if (source.data) {
          if (source.data.isNodeLabel) {
            sourceHeight = NODE_INDEX_CARD.height
          } else if (source.data.nodeIndex !== undefined && source.data.nodeIndex !== -1) {
            const nodePath = getNodePath(source)
            const key = getNodeKey(source.data.nodeIndex, nodePath)
            const cardData = renderedMap.get(key)
            sourceHeight = cardData?.size[1] ?? CARD_DIMENSIONS.minHeight
          }
        }

        const sourceBottom = source.y + sourceHeight
        const path = d3.path()
        path.moveTo(source.x, sourceBottom)
        path.lineTo(target.x, target.y)
        return path.toString()
      }
    }

    const lineGenWithMap = createLineGen(renderedCardsMap)

    // Draw links
    treeContainerGroup
      .selectAll('.link')
      .data(links)
      .join('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', 'var(--border-color)')
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'square')
      .attr('stroke-linejoin', 'round')
      .attr('d', (d) => lineGenWithMap(d as unknown as FlexHierarchyPointLink))

    // Render node labels as simple SVG elements
    const nodeLabels = nodesToRender.filter((d: any) => d.data.isNodeLabel)

    const nodeLabelElements = treeContainerGroup
      .selectAll('.node-label-group')
      .data(nodeLabels)
      .join('g')
      .attr('class', (d: any) => {
        const classes = ['node-label-group', `node-${d.data.nodeIndex}`]
        if (props.activeNodeIndex === d.data.nodeIndex) {
          classes.push('active-node-label')
        }
        return classes.join(' ')
      })
      .attr('transform', (d: any) => {
        return `translate(${d.x - NODE_INDEX_CARD.width / 2},${d.y})`
      })
      .style('cursor', 'pointer')
      .on('click', (event, d: any) => {
        emit('update:activeNodeIndex', d.data.nodeIndex)
      })

    // Store node positions for scrolling (x position of node label)
    nodeLabels.forEach((d: any) => {
      if (d.data.nodeIndex !== undefined) {
        nodePositions.value.set(d.data.nodeIndex, d.x)
      }
    })

    // Add rectangle for node label
    nodeLabelElements
      .append('rect')
      .attr('width', NODE_INDEX_CARD.width)
      .attr('height', NODE_INDEX_CARD.height)
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('class', (d: any) => {
        return props.activeNodeIndex === d.data.nodeIndex ? 'node-label-rect active' : 'node-label-rect'
      })

    // Add text for node label
    nodeLabelElements
      .append('text')
      .attr('x', NODE_INDEX_CARD.width / 2)
      .attr('y', NODE_INDEX_CARD.height / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', NODE_INDEX_CARD.fontSize)
      .attr('font-weight', 'bold')
      .attr('fill', 'var(--main-font-color)')
      .text((d: any) => d.data.name)

    // Render plan nodes (non-label nodes)
    const planNodes = nodesToRender.filter((d: any) => !d.data.isNodeLabel)

    const nodeElements = treeContainerGroup
      .selectAll('.node')
      .data(planNodes)
      .join('g')
      .attr('class', (d: any) => {
        return `node node-${d.data.nodeIndex}`
      })
      .attr('transform', (d: any) => {
        const nodePath = getNodePath(d)
        const key = getNodeKey(d.data.nodeIndex, nodePath)
        const cardData = renderedCardsMap.get(key)
        const nodeWidth = cardData?.size[0] ?? CARD_DIMENSIONS.width
        return `translate(${d.x - nodeWidth / 2},${d.y})`
      })

    // Add foreignObject with pre-rendered HTML for plan nodes
    nodeElements
      .selectAll('foreignObject')
      .data((d: any) => [d])
      .join('foreignObject')
      .attr('width', (d: any) => {
        const nodePath = getNodePath(d)
        const key = getNodeKey(d.data.nodeIndex, nodePath)
        const cardData = renderedCardsMap.get(key)
        return (cardData?.size[0] ?? CARD_DIMENSIONS.width) + 10
      })
      .attr('height', (d: any) => {
        const nodePath = getNodePath(d)
        const key = getNodeKey(d.data.nodeIndex, nodePath)
        const cardData = renderedCardsMap.get(key)
        return (cardData?.size[1] ?? CARD_DIMENSIONS.minHeight) + 10
      })
      .each(function renderCardHTML(d: any) {
        const nodePath = getNodePath(d)
        const key = getNodeKey(d.data.nodeIndex, nodePath)
        const cardData = renderedCardsMap.get(key)
        if (cardData) {
          ;(this as SVGForeignObjectElement).innerHTML = cardData.html
          renderedCardsMap.delete(key)
        }
      })

    // Clean up background measurement container
    if (backgroundMeasureContainer.value) {
      document.body.removeChild(backgroundMeasureContainer.value)
      backgroundMeasureContainer.value = null
    }

    // Notify parent about node positions
    emit('nodePositionsUpdated', nodePositions.value)
  }

  // Get node tree bounding rect by node index
  // Returns coordinates in SVG coordinate space (accounting for tree container group transform)
  function getNodeTreeRect(nodeIndex: number): { minX: number; maxX: number; width: number } | null {
    // Get bounds from stored layout data (in local coordinate space)
    const bounds = nodeTreeBoundsMap.value.get(nodeIndex)
    if (!bounds) return null

    // Convert from local coordinate space to SVG coordinate space
    // The 20px padding is already included in offsetX, so we just add it
    const minXInSVG = bounds.minX + treeOffsetX.value
    const maxXInSVG = bounds.maxX + treeOffsetX.value

    return { minX: minXInSVG, maxX: maxXInSVG, width: maxXInSVG - minXInSVG }
  }

  // Watch all props that affect tree rendering
  watch(
    () => [props.data, props.highlightType, props.selectedMetric, props.metricsExpanded],
    () => {
      nextTick(() => {
        renderTree()
      })
    },
    { immediate: true }
  )

  // Expose methods and treeContainer for parent component
  // Only exposes position/data methods, no scrolling or transform logic
  defineExpose({
    treeContainer,
    renderTree,
    getNodeTreeRect,
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
