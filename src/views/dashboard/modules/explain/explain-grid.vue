<template lang="pug">
a-card.explain-grid(:bordered="false" :class="`explain-grid-${props.index}`")
  .grid-header
    .stage-index Stage {{ props.index }}
    a-space.header-controls
      a-select(
        v-model="selectedNodes"
        size="mini"
        style="min-width: 150px; margin-right: 8px"
        placeholder="Nodes select"
        multiple
        allow-clear
      )
        a-option(v-for="nodeId in availableNodes" :key="nodeId" :value="nodeId") Node {{ nodeId }}
      a-select(
        v-model="selectedMetric"
        size="mini"
        style="width: 180px; margin-right: 8px"
        placeholder="Metric select"
        allow-clear
        @change="selectMetric"
      )
        a-option(v-for="metric in availableMetrics" :key="metric.value" :value="metric.value") {{ metric.label }}
      a-button(type="outline" size="mini" @click="toggleMetricsExpanded")
        template(#icon)
          icon-expand(v-if="!metricsExpanded")
          icon-shrink(v-else)
        | {{ metricsExpanded ? 'Collapse Metrics' : 'Expand Metrics' }}
  a-table(
    size="mini"
    column-resizable
    stripe
    :data="tableData"
    :pagination="false"
    :bordered="false"
    :expandable="{ expandedRowRender: expandedRowRender, rowExpandable: rowExpandable }"
    @row-click="handleRowClick"
  )
    template(#columns)
      a-table-column(title="Plan" data-index="step")
        template(#cell="{ record }")
          .step-cell
            span {{ record.step }}
      template(v-for="nodeIndex in filteredNodeIndices" :key="nodeIndex")
        a-table-column(:title="`Node ${nodeIndex}`" :data-index="`node${nodeIndex}`") 
          template(#cell="{ record }")
            .metrics(v-if="record[`node${nodeIndex}`]")
              template(v-if="metricsExpanded")
                template(v-for="(value, key) in getImportantMetrics(record[`node${nodeIndex}`])" :key="key")
                  .metric
                    .metric-header
                      span.metric-key {{ metricKeyMap(key) }}:
                      span.metric-value {{ isTimeMetric(key) ? formatTimeValue(value) : value }}
                    .metric-progress-bar-wrapper(v-if="isProgressMetric(key)")
                      .metric-progress-bar(
                        :style="{ width: `${getNodeMetricPercentage(record, nodeIndex, key)}%`, backgroundColor: getNodeProgressBarColor(record, nodeIndex, key) }"
                      )
              template(v-else)
                .metric(v-if="record[`node${nodeIndex}`] && record[`node${nodeIndex}`][getActiveMetric] !== undefined")
                  .metric-header
                    span.metric-key {{ metricKeyMap(getActiveMetric) }}:
                    span.metric-value {{ isTimeMetric(getActiveMetric) ? formatTimeValue(record[`node${nodeIndex}`][getActiveMetric]) : record[`node${nodeIndex}`][getActiveMetric] }}
                  .metric-progress-bar-wrapper(v-if="isProgressMetric(getActiveMetric)")
                    .metric-progress-bar(
                      :style="{ width: `${getNodeMetricPercentage(record, nodeIndex, getActiveMetric)}%`, backgroundColor: getNodeProgressBarColor(record, nodeIndex, getActiveMetric) }"
                    )
</template>

<script lang="ts" setup name="ExplainGrid">
  import { ref, computed, h, onMounted } from 'vue'

  const props = defineProps<{
    data: [number, number, string][]
    index: number
  }>()

  const expandedKeys = ref<string[]>([])
  const gridId = `grid-${props.index}-${Date.now().toString().slice(-6)}`

  const formatTimeValue = (nanoseconds: number | undefined): string => {
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

  // Add helper to check if a metric is time-based
  const isTimeMetric = (key: string): boolean => {
    return key.includes('time') || key.includes('elapsed')
  }

  // Function to toggle a row's expanded state
  const toggleRowExpansion = (record: any) => {
    const { key } = record
    const index = expandedKeys.value.indexOf(key)
    if (index > -1) {
      // Remove if already expanded
      expandedKeys.value.splice(index, 1)
    } else {
      // Add to expanded keys
      expandedKeys.value.push(key)
    }
  }

  const metricKeyMap = (key: string): string => {
    const map: Record<string, string> = {
      output_rows: 'Rows',
      elapsed_compute: 'Duration',
    }
    return (
      map[key] ||
      key
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    )
  }

  const metricsExpanded = ref(false)
  const selectedMetric = ref<string | null>(null)

  // Auto-select duration metric by default
  onMounted(() => {
    selectedMetric.value = 'elapsed_compute' // Default to duration metric
  })

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

  const selectMetric = (value: string) => {
    metricsExpanded.value = false
  }

  const getImportantMetrics = (metrics: Record<string, any>) => {
    if (!metrics) return {}

    const sortedMetrics: Record<string, any> = {}

    // Always show output_rows and elapsed_compute first if they exist
    if (metrics.output_rows !== undefined) {
      sortedMetrics.output_rows = metrics.output_rows
    }

    if (metrics.elapsed_compute !== undefined) {
      sortedMetrics.elapsed_compute = metrics.elapsed_compute
    }

    // Then add any remaining metrics in alphabetical order
    Object.keys(metrics)
      .sort((a, b) => a.localeCompare(b))
      .forEach((key) => {
        if (key !== 'output_rows' && key !== 'elapsed_compute') {
          sortedMetrics[key] = metrics[key]
        }
      })

    return sortedMetrics
  }

  // Determine if a row has additional details to show
  const rowExpandable = (record: any) => {
    return record.param || record.hasAdditionalDetails
  }

  // Render expanded row content
  const expandedRowRender = (record: any) => {
    const details = []

    // Add param if available
    if (record.param) {
      details.push({
        label: 'Parameters',
        value: record.param,
      })

      // Add other metrics with formatting
      Object.entries(record).forEach(([key, value]) => {
        // Skip already handled properties and non-metrics
        if (
          key === 'param' ||
          key === 'elapsed_compute' ||
          !isTimeMetric(key) ||
          key === 'key' ||
          key === 'step' ||
          key === 'path' ||
          key.startsWith('node') ||
          key === 'hasAdditionalDetails'
        ) {
          return
        }

        details.push({
          label: key,
          value: isTimeMetric(key) ? formatTimeValue(value as number) : value,
        })
      })
    }

    return h('div', { class: 'expanded-row' }, [
      h(
        'div',
        { class: 'expanded-row-details' },
        details.map((item) =>
          h('div', { class: 'detail-item' }, [
            h('span', { class: 'detail-label' }, `${item.label}: `),
            h('span', { class: 'detail-value' }, item.value),
          ])
        )
      ),
    ])
  }

  const flattenPlan = (
    plan: any,
    result: any[] = [],
    depth = 0,
    path = [],
    isLast = true,
    treePrefix = '',
    index = 0
  ): any[] => {
    // Build the current line's prefix
    let linePrefix = ''
    if (depth > 0) {
      linePrefix = isLast ? `${treePrefix}└─ ` : `${treePrefix}├─ `
    }

    const currentPath = [...path, plan.name]

    // Create a more unique key by including depth, index, and path
    const uniqueKey = `${depth}_${index}_${currentPath.join('/')}`

    const row = {
      key: uniqueKey, // Use the more unique key
      step: `${linePrefix}${plan.name}`,
      path: currentPath,
      param: plan.param,
      output_rows: plan.output_rows,
      elapsed_compute: plan.elapsed_compute,
      hasAdditionalDetails: Boolean(plan.param || plan.output_rows !== undefined || plan.elapsed_compute !== undefined),
    }

    result.push(row)

    if (plan.children && plan.children.length > 0) {
      // Prepare the prefix for children
      let childPrefix = ''
      if (depth > 0) {
        childPrefix = isLast ? `${treePrefix}   ` : `${treePrefix}│  `
      }

      // Process children
      plan.children.forEach((child: any, childIndex: number) => {
        const isLastChild = childIndex === plan.children.length - 1
        flattenPlan(child, result, depth + 1, currentPath, isLastChild, childPrefix, childIndex)
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

  const availableMetrics = computed(() => {
    // Use a Set to track unique metrics across all nodes
    const metricsSet = new Set<string>()

    // Process the tableData to extract all available metrics
    tableData.value.forEach((row) => {
      // Check each node
      filteredNodeIndices.value.forEach((nodeIndex) => {
        const nodeData = row[`node${nodeIndex}`]
        if (!nodeData) return

        // Add all metrics from this node
        Object.keys(nodeData).forEach((key) => {
          // Only include numeric metrics that make sense for comparison
          if (typeof nodeData[key] === 'number') {
            metricsSet.add(key)
          }
        })
      })
    })

    // Convert to array and sort
    const metricsList = Array.from(metricsSet)

    // Place output_rows and elapsed_compute first, then alphabetically
    return metricsList
      .sort((a, b) => {
        // Always put output_rows and elapsed_compute first
        if (a === 'output_rows') return -1
        if (b === 'output_rows') return 1
        if (a === 'elapsed_compute') return -1
        if (b === 'elapsed_compute') return 1

        // Then sort alphabetically
        return a.localeCompare(b)
      })
      .map((metric) => ({
        value: metric,
        label: metricKeyMap(metric),
      }))
  })

  // Calculate appropriate table scroll settings
  const tableScroll = computed(() => {
    return { x: 'max-content', y: '100%' }
  })

  // Row click handler
  const handleRowClick = (record: any) => {
    if (rowExpandable(record)) {
      toggleRowExpansion(record)
    }
  }

  const shouldShowProgressBar = (record: any): boolean => {
    return selectedMetric.value && record[selectedMetric.value] !== undefined
  }

  const getMetricLabel = (metric: string | null): string => {
    return metric || ''
  }

  const formatMetricValue = (record: any, metric: string | null): string => {
    if (!metric || record[metric] === undefined) return ''
    return isTimeMetric(metric) ? formatTimeValue(record[metric]) : record[metric].toString()
  }

  const getProgressPercentage = (record: any, metric: string | null): number => {
    if (!metric || record[metric] === undefined) return 0
    const maxValue = Math.max(...tableData.value.map((row) => row[metric] || 0))
    return maxValue > 0 ? (record[metric] / maxValue) * 100 : 0
  }

  const getProgressBarColor = (record: any, metric: string | null): string => {
    if (!metric || record[metric] === undefined) return '#ccc'
    const percentage = getProgressPercentage(record, metric)
    if (percentage > 75) return '#f56c6c'
    if (percentage > 50) return '#e6a23c'
    return '#67c23a'
  }

  const shouldShowNodeProgressBar = (record: any, nodeIndex: number): boolean => {
    if (!selectedMetric.value || !record[`node${nodeIndex}`]) return false

    const nodeMetrics = record[`node${nodeIndex}`]

    // Check if the node has the selected metric
    return nodeMetrics[selectedMetric.value] !== undefined
  }

  const formatNodeMetricValue = (record: any, nodeIndex: number, metric: string | null): string => {
    if (!metric || !record[`node${nodeIndex}`] || record[`node${nodeIndex}`][metric] === undefined) return ''

    const value = record[`node${nodeIndex}`][metric]
    return isTimeMetric(metric) ? formatTimeValue(value) : value.toString()
  }

  const getNodeProgressPercentage = (record: any, nodeIndex: number, metric: string | null): number => {
    if (!metric || !record[`node${nodeIndex}`] || record[`node${nodeIndex}`][metric] === undefined) return 0

    // Find max value for this metric across all nodes
    const maxValue = Math.max(
      ...tableData.value.filter((row) => row[`node${nodeIndex}`]).map((row) => row[`node${nodeIndex}`][metric] || 0)
    )

    return maxValue > 0 ? (record[`node${nodeIndex}`][metric] / maxValue) * 100 : 0
  }

  const getNodeProgressBarColor = (record: any, nodeIndex: number, metric: string | null): string => {
    if (!metric || !record[`node${nodeIndex}`] || record[`node${nodeIndex}`][metric] === undefined) return '#ccc'

    const percentage = getNodeProgressPercentage(record, nodeIndex, metric)
    if (percentage > 75) return '#f56c6c'
    if (percentage > 50) return '#e6a23c'
    return '#67c23a'
  }

  // Helper to determine if a metric should show a progress bar
  const isProgressMetric = (key: string): boolean => {
    return key === 'output_rows' || key === 'elapsed_compute'
  }

  // Calculate percentage for node metric
  const getNodeMetricPercentage = (record: any, nodeIndex: number, metricKey: string): number => {
    if (!record[`node${nodeIndex}`] || record[`node${nodeIndex}`][metricKey] === undefined) return 0

    // Get all values for this metric across all nodes and records
    const allValues = tableData.value
      .filter((row) => row[`node${nodeIndex}`] && row[`node${nodeIndex}`][metricKey] !== undefined)
      .map((row) => row[`node${nodeIndex}`][metricKey])

    const maxValue = Math.max(...allValues, 0)
    if (maxValue <= 0) return 0

    return (record[`node${nodeIndex}`][metricKey] / maxValue) * 100
  }
</script>

<style lang="less" scoped>
  .explain-grid {
    margin: 16px;
    overflow: hidden;
    padding: 16px 16px;
    border-radius: 6px;
    box-shadow: 0 4px 10px 0 var(--border-color);
    width: fit-content;
    max-width: 100%;
  }

  .grid-header {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    margin-bottom: 8px;
    .stage-index {
      font-size: 14px;
      font-weight: 500;
      margin-right: 10px;
      margin-left: 10px;
      width: 80px;
      font-family: 'Gilroy';
    }
  }

  .header-controls {
    display: flex;
    align-items: center;
  }

  .metrics {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .metric {
    display: flex;
    flex-direction: column;
    margin-bottom: 4px;

    .metric-header {
      display: flex;
      justify-content: flex-start;
      font-size: 12px;
    }

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

    .metric-progress-bar-wrapper {
      height: 4px;
      background-color: var(--th-bg-color);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 2px;
      width: 100%;

      .metric-progress-bar {
        height: 100%;
        transition: width 0.3s ease;
        border-radius: 2px;
      }
    }
  }

  .metric-progress-container {
    display: flex;
    flex-direction: column;
    margin-top: 4px;

    .metric-label {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 4px;

      .metric-value {
        font-family: monospace;
        color: var(--color-text-1);
      }
    }

    .metric-progress-bar-wrapper {
      height: 6px;
      background-color: var(--color-bg-2);
      border-radius: 3px;
      overflow: hidden;

      .metric-progress-bar {
        height: 100%;
        border-radius: 3px;
      }
    }
  }

  :deep(.arco-table-container) {
    overflow-x: auto;
  }
  :deep(.arco-table-size-mini .arco-table-cell) {
    padding: 4px 16px;
  }

  :deep(.arco-table-td) {
    white-space: pre; // Preserve whitespace for tree structure
    overflow: visible;
  }

  .step-cell {
    white-space: pre; // Preserve whitespace for tree structure
    font-family: monospace; // Use monospace for better tree alignment
    align-self: flex-start; // Align at the top
  }

  :deep(.arco-table-td) {
    .expanded-row {
      padding: 8px 0;
      background-color: var(--color-bg-1);
    }

    .expanded-row-details {
      padding: 0 16px 0 36px; // Extra left padding for tree alignment
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .detail-item {
      display: flex;
      align-items: center;
    }
    .detail-label {
      color: var(--color-text-3);
      margin-right: 8px;
      font-weight: 500;
    }
    .detail-value {
      color: var(--color-text-1);
      font-family: monospace;
      word-break: normal;
      white-space: pre-line;
    }
  }

  // Add styles to make rows with expandable content look clickable
  :deep(.arco-table-tr) {
    &:hover {
      cursor: default;
    }
  }

  :deep(.arco-table-tr-expand) {
    &:hover {
      cursor: pointer;
    }
  }

  // Add custom class to expandable rows
  :deep(.arco-table-tr[class*='expand']) {
    cursor: pointer;
  }
</style>
