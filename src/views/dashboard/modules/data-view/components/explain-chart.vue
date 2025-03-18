<template>
  <div class="explain-chart">
    <div class="chart-controls">
      <a-select v-model="selectedNode" size="mini" style="width: 120px; margin-right: 8px" placeholder="Select node">
        <a-option v-for="node in availableNodes" :key="node" :value="node">Node {{ node }}</a-option>
      </a-select>
      <a-select
        v-model="selectedMetric"
        size="mini"
        style="width: 150px; margin-right: 8px"
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
    <div ref="chartContainer" style="padding: 8px"></div>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, ref, watch, computed } from 'vue'
  import * as d3 from 'd3'
  import { flextree } from 'd3-flextree'
  import { IconExpand, IconShrink } from '@arco-design/web-vue/es/icon'

  const props = defineProps<{
    data: any[] // This is an array of rows from getStages
    index: number
  }>()

  const chartContainer = ref<HTMLDivElement | null>(null)
  const metricsExpanded = ref(false)
  const selectedMetric = ref<string>('output_rows')
  const selectedNode = ref<number | null>(null)

  // Define the order of importance for metrics
  const importanceOrder = [
    'output_rows', // How many rows this step produces
    'elapsed_compute', // Processing time for this step
    'fetch_time', // Time spent fetching data
    'elapsed_poll', // Time spent waiting for data
    'repartition_time', // Time spent repartitioning data
    'send_time', // Time spent sending data
    'mem_used', // Memory consumption
    'elapsed_await', // Time spent waiting
  ]

  // Generate available metrics for the dropdown
  const availableMetrics = computed(() => {
    return importanceOrder.map((metric) => ({
      label: metric,
      value: metric,
    }))
  })

  // Get list of available nodes
  const availableNodes = computed(() => {
    if (!props.data || props.data.length === 0) return []
    return [...new Set(props.data.map((row) => row[1]))].sort((a, b) => a - b)
  })

  // Watch for changes in available nodes to set default selection
  watch(
    availableNodes,
    (nodes) => {
      if (nodes.length > 0 && selectedNode.value === null) {
        selectedNode.value = nodes[0]
      }
    },
    { immediate: true }
  )

  // Function to process plans from multiple nodes into a unified tree
  function processNodesData(data) {
    // Each data item is [stageIndex, nodeIndex, planJson]
    const nodeMap = new Map()

    // Group by node
    data.forEach((row) => {
      const nodeIdx = row[1]
      nodeMap.set(nodeIdx, {
        nodeIndex: nodeIdx,
        plan: JSON.parse(row[2]),
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
        output_rows: plan.output_rows,
        elapsed_compute: plan.elapsed_compute,
      },
      children: (plan.children || []).map((child) => toHierarchy(child, nodeIndex)),
    }
  }

  function renderTree() {
    if (!chartContainer.value) return
    chartContainer.value.innerHTML = ''

    const margin = { top: 20, right: 20, bottom: 20, left: 20 }
    const width = 600
    const height = 400

    const svg = d3.select(chartContainer.value).append('svg').attr('width', width).attr('height', height)

    if (!props.data || props.data.length === 0) return

    // Find the selected node's data
    const nodeData = props.data.find((row) => row[1] === selectedNode.value)
    if (!nodeData) return

    const planData = JSON.parse(nodeData[2])
    const rootData = toHierarchy(planData, selectedNode.value)

    const layout = flextree()
      .nodeSize([200, 120])
      .spacing(() => 30)

    const root = layout(d3.hierarchy(rootData))

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    root.each((d) => {
      minX = Math.min(minX, d.x)
      maxX = Math.max(maxX, d.x)
      minY = Math.min(minY, d.y)
      maxY = Math.max(maxY, d.y)
    })

    const treeWidth = maxX - minX + margin.left + margin.right
    const treeHeight = maxY - minY + margin.top + margin.bottom

    const actualWidth = Math.max(treeWidth, 600)
    const actualHeight = Math.max(treeHeight, 400)

    svg.attr('width', actualWidth).attr('height', actualHeight)

    const centerOffsetX = (actualWidth - treeWidth) / 2
    const centerOffsetY = (actualHeight - treeHeight) / 2

    const g = svg
      .append('g')
      .attr(
        'transform',
        `translate(${margin.left + Math.abs(minX) + centerOffsetX}, ${margin.top + Math.abs(minY) + centerOffsetY})`
      )

    g.selectAll('.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#555')
      .attr('stroke-width', 1.5)
      .attr(
        'd',
        d3
          .linkHorizontal()
          .x((d) => d.x)
          .y((d) => d.y)
      )

    const node = g
      .selectAll('.node')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', (d) => `translate(${d.x - 100},${d.y - 40})`) // Adjust center point

    node
      .append('foreignObject')
      .attr('width', 200)
      .attr('height', metricsExpanded.value ? 120 : 80)
      .html((d) => {
        // Create the card header with node info
        const header = `
          <div class="plan-header">
            <div class="plan-name">${d.data.name}</div>
            <div class="node-badge">Node ${d.data.nodeIndex}</div>
          </div>
        `

        // Create metrics section based on expanded state
        let metricsHtml = ''

        if (metricsExpanded.value) {
          // Show all metrics when expanded
          if (d.data.metrics && Object.keys(d.data.metrics).length > 0) {
            const sortedMetrics = {}

            // First add metrics in our importance order
            importanceOrder.forEach((key) => {
              if (d.data.metrics[key] !== undefined) {
                sortedMetrics[key] = d.data.metrics[key]
              }
            })

            // Then add any remaining metrics
            Object.keys(d.data.metrics).forEach((key) => {
              if (sortedMetrics[key] === undefined) {
                sortedMetrics[key] = d.data.metrics[key]
              }
            })

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
        // Show only selected metric when collapsed
        else if (d.data.metrics && d.data.metrics[selectedMetric.value] !== undefined) {
          metricsHtml = `
              <div class="plan-metrics">
                <div class="metric-item">
                  <span class="metric-key">${selectedMetric.value}:</span>
                  <span class="metric-value">${d.data.metrics[selectedMetric.value]}</span>
                </div>
              </div>
            `
        }

        return `
          <div style="width: 200px; height: ${
            metricsExpanded.value ? '120' : '80'
          }px; display: flex; align-items: center; justify-content: center">
            <div class="plan-card">
              ${header}
              ${metricsHtml}
            </div>
          </div>
        `
      })
  }

  const toggleMetricsExpanded = () => {
    metricsExpanded.value = !metricsExpanded.value
    renderTree()
  }

  onMounted(() => {
    renderTree()
  })

  watch([() => props.data, selectedMetric, selectedNode], () => {
    renderTree()
  })
</script>

<style lang="less">
  .explain-chart {
    .chart-controls {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
      padding: 0 8px;
    }
  }

  .plan-card {
    width: 180px;
    background-color: var(--color-bg-2);
    border: 1px solid var(--color-border-2);
    border-radius: 4px;
    padding: 8px;
    cursor: pointer;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);

    .plan-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .plan-name {
      font-weight: bold;
      color: var(--color-text-1);
      font-size: 13px;
    }

    .node-badge {
      font-size: 11px;
      color: var(--color-text-3);
      background-color: var(--color-fill-2);
      padding: 2px 6px;
      border-radius: 10px;
    }

    .plan-metrics {
      font-size: 12px;
      color: var(--color-text-2);
      border-top: 1px solid var(--color-border-2);
      padding-top: 6px;
    }

    .metric-item {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
    }

    .metric-key {
      color: var(--color-text-3);
      margin-right: 8px;
    }

    .metric-value {
      font-family: monospace;
      color: var(--color-text-1);
    }
  }
</style>
