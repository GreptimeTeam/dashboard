<template lang="pug">
.explain-grid(:style="gridStyle")
  .grid-header
    | Stage {{ props.index }}
    .header-controls
      a-select(
        v-model="selectedNodes"
        size="mini"
        style="margin-right: 8px"
        placeholder="Nodes select"
        multiple
        allow-clear
      )
        a-option(v-for="nodeId in availableNodes" :key="nodeId" :value="nodeId") Node {{ nodeId }}

      a-select(
        v-model="selectedMetric"
        size="mini"
        style="width: 150px; margin-right: 8px"
        placeholder="Metric select"
        allow-clear
        @change="selectMetric"
      )
        a-option(v-for="metric in availableMetrics" :key="metric.value" :value="metric.value") {{ metric.label }}
      a-button(type="text" size="mini" @click="toggleMetricsExpanded")
        template(#icon)
          icon-expand(v-if="!metricsExpanded")
          icon-shrink(v-else)
        | {{ metricsExpanded ? 'Collapse Metrics' : 'Expand Metrics' }}
  a-table(
    size="mini"
    :data="tableData"
    :pagination="false"
    :bordered="false"
    :scroll="tableScroll"
  )
    template(#columns)
      a-table-column(
        title="Step"
        data-index="step"
        fixed="left"
        :width="220"
      )
        template(#cell="{ record }")
          .step-cell {{ record.step }}
      template(v-for="nodeIndex in filteredNodeIndices" :key="nodeIndex")
        a-table-column(
          :title="`Node ${nodeIndex}`"
          :data-index="`node${nodeIndex}`"
          :width="metricsExpanded ? 220 : 150"
        ) 
          template(#cell="{ record }")
            .metrics(v-if="record[`node${nodeIndex}`]")
              template(v-if="metricsExpanded")
                .metric(v-for="(value, key) in getImportantMetrics(record[`node${nodeIndex}`])" :key="key")
                  span.metric-key {{ key }}:
                  span.metric-value {{ value }}
              template(v-else)
                .metric(v-if="record[`node${nodeIndex}`] && record[`node${nodeIndex}`][getActiveMetric] !== undefined")
                  span.metric-key {{ getActiveMetric }}:
                  span.metric-value {{ record[`node${nodeIndex}`][getActiveMetric] }}
                //- .more-metrics(v-if="Object.keys(record[`node${nodeIndex - 1}`]).length > 1") ...
</template>

<script lang="ts" setup name="ExplainGrid">
  import { ref, computed } from 'vue'

  const props = defineProps<{
    data: [number, number, string][]
    index: number
  }>()

  const metricsExpanded = ref(false)
  const selectedMetric = ref<string | null>(null)

  // Update the first most important metric lookup
  const getActiveMetric = computed(() => {
    // Use selected metric if specified, otherwise use default
    return selectedMetric.value || 'output_rows'
  })

  const toggleMetricsExpanded = () => {
    metricsExpanded.value = !metricsExpanded.value
  }

  const availableNodes = computed(() => {
    if (!props.data || props.data.length === 0) return []
    const nodeIds = [...new Set(props.data.map((row) => row[1]))]
    return nodeIds.sort((a, b) => a - b)
  })

  const selectedNodes = ref([])

  const filteredNodeIndices = computed(() => {
    if (!selectedNodes.value || selectedNodes.value.length === 0) {
      return availableNodes.value
    }
    return selectedNodes.value
  })

  watch(
    availableNodes,
    (newNodes) => {
      if (newNodes.length > 0 && selectedNodes.value.length === 0) {
        // Default to showing all nodes
        selectedNodes.value = []
      }
    },
    { immediate: true }
  )

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

  const selectMetric = (value: string) => {
    metricsExpanded.value = false
  }

  const getImportantMetrics = (metrics: Record<string, any>) => {
    if (!metrics) return {}

    // Define the order of importance for metrics

    // Sort the metrics by importance
    const sortedMetrics: Record<string, any> = {}

    // First add metrics in our importance order
    importanceOrder.forEach((key) => {
      if (metrics[key] !== undefined) {
        sortedMetrics[key] = metrics[key]
      }
    })

    // Then add any remaining metrics in their original order
    Object.keys(metrics).forEach((key) => {
      if (sortedMetrics[key] === undefined) {
        sortedMetrics[key] = metrics[key]
      }
    })

    return sortedMetrics
  }

  const getFirstImportantMetric = (metrics: Record<string, any>, preferredMetric?: string): [string, any] => {
    if (!metrics) return ['', '']

    // Return preferred metric if specified and available
    if (preferredMetric && metrics[preferredMetric] !== undefined) {
      return [preferredMetric, metrics[preferredMetric]]
    }

    // Return output_rows if available
    if (metrics.output_rows !== undefined) {
      return ['output_rows', metrics.output_rows]
    }

    // Otherwise return first metric by importance order
    const sortedMetrics = getImportantMetrics(metrics)
    const firstKey = Object.keys(sortedMetrics)[0]
    return firstKey ? [firstKey, sortedMetrics[firstKey]] : ['', '']
  }

  const flattenPlan = (
    plan: any,
    result: any[] = [],
    depth = 0,
    path: string[] = [],
    isLast = true,
    treePrefix = ''
  ): any[] => {
    // Build the current line's prefix
    let linePrefix = ''
    if (depth > 0) {
      linePrefix = isLast ? `${treePrefix}└─ ` : `${treePrefix}├─ `
    }

    const currentPath = [...path, plan.name]

    const row = {
      key: currentPath.join('/'),
      step: `${linePrefix}${plan.name}`,
      path: currentPath,
    }

    result.push(row)

    if (plan.children && plan.children.length > 0) {
      // Prepare the prefix for children
      let childPrefix = ''
      if (depth > 0) {
        childPrefix = isLast ? `${treePrefix}   ` : `${treePrefix}│  `
      }

      // Process children
      plan.children.forEach((child: any, index: number) => {
        const isLastChild = index === plan.children.length - 1
        flattenPlan(child, result, depth + 1, currentPath, isLastChild, childPrefix)
      })
    }

    return result
  }
  const maxNodeIndex = computed(() => {
    if (!props.data || props.data.length === 0) return 0
    return Math.max(...props.data.map((row) => row[1]))
  })

  const tableData = computed(() => {
    if (!props.data || props.data.length === 0) return []

    // Find max node index

    // Use first node's plan structure as template
    const firstPlan = JSON.parse(props.data[0][2])
    const flattened = flattenPlan(firstPlan)

    // Create a map of plans by node index
    const plansByNode = new Map()
    props.data.forEach((row) => {
      const nodeIndex = row[1]
      const plan = JSON.parse(row[2])
      plansByNode.set(nodeIndex, plan)
    })

    // Add metrics from each node to the flattened structure
    flattened.forEach((row) => {
      plansByNode.forEach((nodePlan, nodeIndex) => {
        let currentNode = nodePlan
        const { path } = row

        // Navigate through the path
        for (let i = 0; i < path.length && currentNode; i += 1) {
          if (currentNode.name !== path[i]) {
            currentNode = null
            break
          }
          if (i < path.length - 1) {
            currentNode = currentNode.children?.find((child: any) => child.name === path[i + 1])
          }
        }

        if (currentNode) {
          row[`node${nodeIndex}`] = {
            ...currentNode.metrics,
            output_rows: currentNode.output_rows,
            elapsed_compute: currentNode.elapsed_compute,
          }
        }
      })
    })
    return flattened
  })

  // Calculate appropriate table scroll settings
  const tableScroll = computed(() => {
    const nodeCount = maxNodeIndex.value + 1
    // Use x scroll only if we have multiple nodes
    return {
      x: nodeCount > 1 ? `${Math.min(220 * (nodeCount + 1), 1000)}px` : undefined,
    }
  })

  // Calculate grid container style
  const gridStyle = computed(() => {
    const nodeCount = maxNodeIndex.value + 1
    // Limit max width for many nodes, fit content for few nodes
    const width = nodeCount <= 2 ? 'min-content' : '100%'
    return {
      width,
      // maxWidth: nodeCount <= 2 ? `${(nodeCount + 1) * 220}px` : '100%',
    }
  })
</script>

<style lang="less" scoped>
  .explain-grid {
    overflow: hidden;
    margin-bottom: 16px;
  }

  .grid-header {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    margin-bottom: 8px;
  }

  .header-controls {
    display: flex;
    align-items: center;
  }

  .more-metrics {
    color: var(--color-text-3);
    font-size: 12px;
    font-style: italic;
  }

  .metrics {
    display: flex;
    flex-direction: column;
    gap: 4px;
    // max-width: metricsExpanded ? 200px : 'none';
  }

  .metric {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    overflow: hidden;

    .metric-key {
      color: var(--color-text-3);
      margin-right: 8px;
      flex-shrink: 0;
    }

    .metric-value {
      color: var(--color-text-1);
      font-family: monospace;
      text-overflow: ellipsis;
      overflow: hidden;
    }
  }

  :deep(.arco-table-container) {
    overflow-x: auto;
  }

  :deep(.arco-table-td) {
    white-space: pre; // Preserve whitespace for tree structure
    overflow: visible;
  }

  .step-cell {
    white-space: pre; // Preserve whitespace for tree structure
    font-family: monospace; // Use monospace for better tree alignment
    align-self: flex-start; // Align at the top
    padding-top: 4px; // Add some top padding
  }

  // Add a background color to the step column
  :deep(.arco-table-col-fixed-left) {
    // background-color: var(--th-bg-color);
  }

  :deep(.arco-table-td) {
    vertical-align: top; // Align all cell content to the top
    padding-top: 8px; // Add padding at the top of all cells
  }
</style>
