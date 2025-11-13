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
      // Center the tree vertically with some padding
      const initial = d3.zoomIdentity.translate(0, 50).scale(0.7)
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
    // Reset to the same initial transform used in applyZoom (centered)
    const initial = d3.zoomIdentity.translate(0, 50).scale(0.7)
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
  // Filters out fake root and node label names, keeping only plan operator names
  function getNodePath(node: any): string[] {
    const path: string[] = []
    let current: any = node
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
    const mainGroup = svg.append('g').attr('class', componentId.value)
    if (preservedTransform) {
      mainGroup.attr('transform', preservedTransform)
    }

    // Process all node data
    nodesData.value = processNodesData(props.data)
    emit('nodesDataUpdated', nodesData.value)

    // If no nodes, return early
    if (!nodesData.value.length) return

    // Clear node positions map
    nodePositions.value.clear()

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
    const hierarchy = d3.hierarchy(mergedTreeData, (d) => d.children || [])

    // First pass: Render all plan cards in background and store HTML strings
    // Use hierarchy.descendants() to get all nodes directly
    const allRenderPromises: Promise<void>[] = []

    hierarchy.descendants().forEach((d: any) => {
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
      nodeSize: (node: any) => {
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
    const layoutRoot = treeLayout(hierarchy as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    // Calculate tree bounds by iterating all descendant nodes
    // Get leftmost and rightmost edges considering node widths
    let minX = Infinity
    let maxX = -Infinity
    layoutRoot.each((d: any) => {
      // Skip fake root when calculating bounds
      if (d.data.name === 'FakeRoot') return

      let leftEdge = d.x
      let rightEdge = d.x

      // For node labels, use their width
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

      if (leftEdge < minX) {
        minX = leftEdge
      }
      if (rightEdge > maxX) {
        maxX = rightEdge
      }
    })

    // Calculate tree center and center it in SVG
    if (minX === Infinity || maxX === -Infinity) {
      // Fallback if no nodes found
      minX = 0
      maxX = 0
    }
    const treeCenter = (minX + maxX) / 2

    // Get SVG width and current scale
    const svgWidth = Number(svg.attr('width')) || treeContainer.value.clientWidth
    const currentScale = preservedTransform?.k || 0.7
    const svgCenter = svgWidth / 2

    // Transform SVG center to tree coordinate space and align tree center to SVG center
    const svgCenterInTreeSpace = svgCenter / currentScale
    const offsetX = svgCenterInTreeSpace - treeCenter

    // Create container for the entire tree
    const treeContainerGroup = mainGroup
      .append('g')
      .attr('transform', `translate(${offsetX}, 0)`)
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

    // Draw custom connection from node label to plan root (curved line)
    layoutRoot.children?.forEach((nodeLabelNode: any) => {
      if (nodeLabelNode.data.isNodeLabel) {
        const labelBottom = nodeLabelNode.y + NODE_INDEX_CARD.height
        const planRoot = nodeLabelNode.children?.[0]
        if (planRoot) {
          const planTop = planRoot.y
          const midY = (labelBottom + planTop) / 2

          treeContainerGroup
            .append('path')
            .attr(
              'd',
              `M${nodeLabelNode.x},${labelBottom}C${nodeLabelNode.x},${midY} ${planRoot.x},${midY} ${planRoot.x},${planTop}`
            )
            .attr('fill', 'none')
            .attr('stroke', 'var(--border-color)')
            .attr('stroke-width', 1)
            .attr('class', 'node-label-link')
        }
      }
    })

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
