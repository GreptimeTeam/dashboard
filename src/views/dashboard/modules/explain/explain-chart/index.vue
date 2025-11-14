<template lang="pug">
.explain-chart(:id="`explain-chart-stage-${index}`")
  .header
    div(style="display: flex; align-items: center; justify-content: space-between; flex-direction: row")
      .stage-navigation
        a-radio-group(v-model="localStageIndex" type="button" @change="onStageChange")
          a-radio(v-for="i in totalStages" :key="i - 1" :value="i - 1") Stage {{ i - 1 }}
      .root-plan-selector(v-if="availableRootPlans.length > 1")
        a-select(v-model="selectedRootPlan" size="mini" style="width: 200px; margin-left: 8px")
          a-option(v-for="root in availableRootPlans" :key="root" :value="root") {{ root }}
    ChartControls(
      v-model:highlight-type="highlightType"
      v-model:selected-metric="selectedMetric"
      v-model:metrics-expanded="metricsExpanded"
      :available-nodes="availableNodes"
      :active-node-index="activeNodeIndex"
      :available-metrics="availableMetrics"
      :stage-index="index"
    )
  .chart-scroll-container
    .chart-container.grab-bing(ref="chartContainer")
      TreeView(
        ref="treeView"
        :data="filteredData"
        :active-node-index="activeNodeIndex"
        :highlight-type="highlightType"
        :selected-metric="selectedMetric"
        :metrics-expanded="metricsExpanded"
        :stage-index="index"
        @update:active-node-index="updateActiveNode"
        @nodes-data-updated="updateNodesData"
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
  import { formatMetricName } from '../utils'

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
  const selectedRootPlan = ref<string>('')

  // Computed property for treeContainer to pass to zoom controls
  const treeContainerRef = computed(() => treeView.value?.treeContainer || null)

  // Extract available root plan names from props.data
  const availableRootPlans = computed(() => {
    if (!props.data || props.data.length === 0) return []
    const rootNames = new Set<string>()
    props.data.forEach((row) => {
      const [, , planStr] = row
      if (!planStr || typeof planStr !== 'string' || !planStr.startsWith('{')) {
        return
      }
      try {
        const plan = JSON.parse(planStr)
        if (plan?.name) {
          rootNames.add(plan.name)
        }
      } catch {
        // Ignore invalid JSON
      }
    })
    return Array.from(rootNames).sort()
  })

  // Filter data based on selected root plan
  const filteredData = computed(() => {
    if (!props.data || props.data.length === 0) return []
    if (availableRootPlans.value.length <= 1) {
      // If only one root plan, return all data
      return props.data
    }
    // Filter by selected root plan (watcher ensures selectedRootPlan is always set)
    return props.data.filter((row) => {
      const [, , planStr] = row
      if (!planStr || typeof planStr !== 'string' || !planStr.startsWith('{')) {
        return false
      }
      try {
        const plan = JSON.parse(planStr)
        return plan?.name === selectedRootPlan.value
      } catch {
        return false
      }
    })
  })

  const availableMetrics = computed(() => {
    const metricKeys = new Set<string>()

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

  // Initialize selected root plan when available root plans change
  watch(
    () => availableRootPlans.value,
    (newRootPlans) => {
      if (newRootPlans.length > 0 && !selectedRootPlan.value) {
        selectedRootPlan.value = newRootPlans[0]
      }
    },
    { immediate: true }
  )

  // Watch filteredData to update chart when data or root plan changes
  watch(
    () => filteredData.value,
    () => {
      activeNodeIndex.value = 0
      zoomControls.value?.handleResetZoom()
    },
    { immediate: true }
  )

  // Watch props.data to reset state when stage changes (not when root plan changes)
  watch(
    () => props.data,
    (newData, oldData) => {
      // Only reset state if the data content actually changed (stage change)
      if (!oldData || !areDataArraysEqual(newData, oldData)) {
        selectedMetric.value = ''
        highlightType.value = 'DURATION'
        metricsExpanded.value = false
        // Chart update is handled by filteredData watch
      }
    }
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
    width: auto;
    min-width: 200px;
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
      font-size: 13px;
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
      font-size: 13px;
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
