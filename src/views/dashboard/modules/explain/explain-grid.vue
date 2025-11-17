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
      a-space.metric-control(:size="0")
        a-select(
          v-model="selectedMetric"
          size="mini"
          style="width: fit-content; margin-right: 8px"
          placeholder="Select Metric"
          allow-clear
          :trigger-props="{ autoFitPopupMinWidth: true }"
          @change="selectMetric"
        )
          a-option(v-for="metric in availableMetrics" :key="metric.value" :value="metric.value") {{ metric.label }}
        a-button(type="outline" size="mini" @click="toggleMetricsExpanded")
          template(#icon)
            icon-expand(v-if="!metricsExpanded")
            icon-shrink(v-else)
          | {{ metricsExpanded ? 'Collapse' : 'Expand' }}
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
                      span.metric-key {{ formatMetricName(key) }}:
                      span.metric-value {{ formatMetricValue(key, value) }}
                    .metric-progress-bar-wrapper(v-if="isProgressMetric(key)")
                      .metric-progress-bar(
                        :style="{ width: `${getPercentage(record, nodeIndex, key)}%`, backgroundColor: getNodeProgressBarColor(record, nodeIndex, key) }"
                      )
              template(v-else)
                .metric(v-if="record[`node${nodeIndex}`] && record[`node${nodeIndex}`][getActiveMetric] !== undefined")
                  .metric-header
                    span.metric-key {{ formatMetricName(getActiveMetric) }}:
                    span.metric-value {{ formatMetricValue(getActiveMetric, record[`node${nodeIndex}`][getActiveMetric]) }}
                  .metric-progress-bar-wrapper(v-if="isProgressMetric(getActiveMetric)")
                    .metric-progress-bar(
                      :style="{ width: `${getPercentage(record, nodeIndex, getActiveMetric)}%`, backgroundColor: getNodeProgressBarColor(record, nodeIndex, getActiveMetric) }"
                    )
</template>

<script lang="ts" setup name="ExplainGrid">
  import { h } from 'vue'
  import { formatMetricName, formatTimeValue, formatMetricValue } from './utils'

  // Props structure:
  // data: Array of [stage, nodeIndex, plan_json_string] tuples
  //   - stage: Execution stage number (0, 1, 2, ...)
  //   - nodeIndex: Physical compute node/server ID that executed this plan (0, 1, 2, ..., 6, ...)
  //   - plan_json_string: The execution plan tree as a JSON string for this node
  //
  // Example:
  //   [
  //     [1, 0, '{"name": "CoalesceBatchesExec", ...}'],  // Stage 1, Node 0's plan
  //     [1, 1, '{"name": "CoalesceBatchesExec", ...}'],  // Stage 1, Node 1's plan
  //     [1, 2, '{"name": "CoalesceBatchesExec", ...}'],  // Stage 1, Node 2's plan
  //     ...
  //   ]
  //
  // Note: "node" here refers to a PHYSICAL COMPUTE NODE (server) in a distributed system,
  // not an operator node in the plan tree. Each physical node executes the same plan structure
  // but with different metrics (rows processed, time taken, etc.)
  const props = defineProps<{
    data: [number, number, string][]
    index: number
  }>()

  const expandedKeys = ref<string[]>([])

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

  const metricsExpanded = ref(false)
  const selectedMetric = ref<string | null>(null)

  // Auto-select duration metric by default
  onMounted(() => {
    selectedMetric.value = 'elapsed_compute'
  })

  const getActiveMetric = computed(() => {
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
        label: 'Param',
        value: record.param,
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

  // Flatten a nested plan tree into a flat array of rows (one per operator)
  // Recursively traverses the tree and creates a row for each operator
  const flattenPlan = (
    plan: any,
    result: any[] = [],
    depth = 0,
    path: string[] = [],
    isLast = true,
    treePrefix = '',
    index = 0
  ): any[] => {
    // Build visual prefix for tree display (└─ for last child, ├─ for others)
    let linePrefix = ''
    if (depth > 0) {
      linePrefix = isLast ? `${treePrefix}└─ ` : `${treePrefix}├─ `
    }

    // Build the path array: [root, child1, child2, ...]
    const currentPath = [...path, plan.name]

    // Create unique key for this row
    const uniqueKey = `${depth}_${index}_${currentPath.join('/')}`

    // Create row object for this operator
    const row = {
      key: uniqueKey,
      step: `${linePrefix}${plan.name}`,
      path: currentPath,
      param: plan.param || '',
      output_rows: plan.output_rows,
      elapsed_compute: plan.elapsed_compute,
      hasAdditionalDetails: Boolean(plan.param || plan.output_rows !== undefined || plan.elapsed_compute !== undefined),
    }

    result.push(row)

    // Recursively process children
    if (plan.children && plan.children.length > 0) {
      // Build prefix for children (spaces or │ for vertical lines)
      let childPrefix = ''
      if (depth > 0) {
        childPrefix = isLast ? `${treePrefix}   ` : `${treePrefix}│  `
      }

      // Process each child
      plan.children.forEach((child: any, childIndex: number) => {
        const isLastChild = childIndex === plan.children.length - 1
        flattenPlan(child, result, depth + 1, currentPath, isLastChild, childPrefix, childIndex)
      })
    }

    return result
  }

  // Build a map of path -> node for O(1) lookup
  // Key: path.join('/') (e.g., "CoalesceBatchesExec/FilterExec/ProjectionExec")
  // Value: the operator node object
  const buildPathMap = (
    plan: any,
    pathMap: Map<string, any> = new Map(),
    currentPath: string[] = []
  ): Map<string, any> => {
    if (!plan) return pathMap

    const path = [...currentPath, plan.name]
    const pathKey = path.join('/')
    pathMap.set(pathKey, plan)

    // Recursively process children
    if (plan.children && plan.children.length > 0) {
      plan.children.forEach((child: any) => {
        buildPathMap(child, pathMap, path)
      })
    }

    return pathMap
  }

  // Parse plans from props.data and group by physical node index
  // Only includes plans with the same root operator name as the template plan
  //
  // Input: props.data = [[stage, nodeIndex, plan_json_string], ...]
  // Output: Map<nodeIndex, parsed_plan_object>
  //
  // Example:
  //   Input: [
  //     [1, 0, '{"name": "CoalesceBatchesExec", ...}'],
  //     [1, 1, '{"name": "CoalesceBatchesExec", ...}'],
  //     [1, 5, '{"name": "CoalesceBatchesExec", ...}']
  //   ]
  //   Output: Map {
  //     0 => { name: "CoalesceBatchesExec", children: [...], metrics: {...} },
  //     1 => { name: "CoalesceBatchesExec", children: [...], metrics: {...} },
  //     5 => { name: "CoalesceBatchesExec", children: [...], metrics: {...} }
  //   }
  const parsePlansByNode = (templatePlan: any): Map<number, any> => {
    const plansByNode = new Map<number, any>()
    const rootName = templatePlan?.name

    props.data.forEach((row) => {
      // Destructure: [stage, nodeIndex, plan_json_string]
      // We ignore stage (index 0) since we're already filtered by stage in explain-tabs
      const [, nodeIndex, planStr] = row

      if (!planStr || typeof planStr !== 'string' || !planStr.startsWith('{')) {
        return
      }

      try {
        const plan = JSON.parse(planStr)
        if (plan?.name === rootName) {
          plansByNode.set(nodeIndex, plan)
        }
      } catch {
        // Ignore invalid JSON (e.g., footer rows)
      }
    })

    return plansByNode
  }

  // Build path maps for all plans (for O(1) lookup instead of tree traversal)
  // Returns: Map<nodeIndex, pathMap> where pathMap is Map<pathKey, node>
  const buildPathMapsForAllNodes = (plansByNode: Map<number, any>): Map<number, Map<string, any>> => {
    const pathMapsByNode = new Map<number, Map<string, any>>()
    plansByNode.forEach((plan, nodeIndex) => {
      const pathMap = buildPathMap(plan)
      pathMapsByNode.set(nodeIndex, pathMap)
    })
    return pathMapsByNode
  }

  // Attach metrics from each physical node's plan to the corresponding operator row
  //
  // rows: Flattened operator rows (one per operator in the plan tree)
  // pathMapsByNode: Map of physical node index -> path map (pathKey -> operator node)
  //
  // For each operator row, find the matching operator in each physical node's path map
  // and attach that physical node's metrics to the row as row.node0, row.node1, etc.
  //
  // Example:
  //   row = { step: "FilterExec", path: ["CoalesceBatchesExec", "FilterExec"], ... }
  //   pathMapsByNode = Map {
  //     0 => Map { "CoalesceBatchesExec/FilterExec" => {...}, ... },
  //     1 => Map { "CoalesceBatchesExec/FilterExec" => {...}, ... },
  //     5 => Map { "CoalesceBatchesExec/FilterExec" => {...}, ... }
  //   }
  //
  //   Result: row.node0 = { output_rows: 100, elapsed_compute: 50, ... }
  //          row.node1 = { output_rows: 120, elapsed_compute: 60, ... }
  //          row.node5 = { output_rows: 155616, elapsed_compute: 32, ... }
  const attachNodeMetrics = (rows: any[], pathMapsByNode: Map<number, Map<string, any>>) => {
    rows.forEach((row) => {
      // Convert path array to path key for map lookup
      const pathKey = row.path.join('/')

      pathMapsByNode.forEach((pathMap, nodeIndex) => {
        // O(1) lookup instead of tree traversal
        const operatorNode = pathMap.get(pathKey)
        if (operatorNode) {
          // Attach metrics from this physical node's operator to the row
          row[`node${nodeIndex}`] = {
            ...operatorNode.metrics,
            output_rows: operatorNode.output_rows,
            elapsed_compute: operatorNode.elapsed_compute,
          }
        }
      })
    })
  }

  // Group props.data by root plan name
  // Returns: Map<rootName, Array<[stage, nodeIndex, plan_json_string]>>
  const groupByRootName = (): Map<string, Array<[number, number, string]>> => {
    const groups = new Map<string, Array<[number, number, string]>>()

    props.data.forEach((row) => {
      const [, , planStr] = row
      if (!planStr || typeof planStr !== 'string' || !planStr.startsWith('{')) {
        return
      }

      try {
        const plan = JSON.parse(planStr)
        const rootName = plan?.name
        if (!groups.has(rootName)) {
          groups.set(rootName, [])
        }
        const group = groups.get(rootName)
        if (group) {
          group.push(row)
        }
      } catch {
        // Ignore invalid JSON
      }
    })

    return groups
  }

  // Process a single root plan group
  const processRootPlan = (rootName: string, rootData: Array<[number, number, string]>): any[] => {
    // Use first entry as template
    const templatePlan = JSON.parse(rootData[0][2])
    const planRows = flattenPlan(templatePlan)

    // Parse all node plans for this root
    const plansByNode = new Map<number, any>()
    rootData.forEach((row) => {
      const [, nodeIndex, planStr] = row
      try {
        const plan = JSON.parse(planStr)
        if (plan?.name === rootName) {
          plansByNode.set(nodeIndex, plan)
        }
      } catch {
        // Ignore invalid JSON
      }
    })

    // Build path maps and attach metrics
    const pathMapsByNode = buildPathMapsForAllNodes(plansByNode)
    attachNodeMetrics(planRows, pathMapsByNode)

    return planRows
  }

  const tableData = computed(() => {
    if (!props.data || props.data.length === 0) return []
    // Step 1: Group props.data by root plan name
    // This handles cases where there are multiple root plans (e.g., CoalesceBatchesExec and PromInstantManipulateExec)
    const rootGroups = groupByRootName()
    // Step 2: Process each root plan group separately
    const allPlanRows: any[] = []
    rootGroups.forEach((rootData, rootName) => {
      const planRows = processRootPlan(rootName, rootData)
      allPlanRows.push(...planRows)
    })

    return allPlanRows
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
        label: formatMetricName(metric),
      }))
  })

  // Row click handler
  const handleRowClick = (record: any) => {
    if (rowExpandable(record)) {
      toggleRowExpansion(record)
    }
  }

  // Get max value for a metric across all nodes and all operators/rows
  // This shows relative performance across the entire table
  const getMaxMetricValue = (metricKey: string): number => {
    const allValues: number[] = []
    tableData.value.forEach((row) => {
      availableNodes.value.forEach((nodeIdx) => {
        const nodeData = row[`node${nodeIdx}`]
        if (nodeData && nodeData[metricKey] !== undefined) {
          allValues.push(nodeData[metricKey])
        }
      })
    })
    return allValues.length > 0 ? Math.max(...allValues) : 0
  }

  const getPercentage = (record: any, nodeIndex: number, metric: string | null): number => {
    if (!metric || !record[`node${nodeIndex}`] || record[`node${nodeIndex}`][metric] === undefined) return 0

    const maxValue = getMaxMetricValue(metric)
    return maxValue > 0 ? (record[`node${nodeIndex}`][metric] / maxValue) * 100 : 0
  }

  const getNodeProgressBarColor = (record: any, nodeIndex: number, metric: string | null): string => {
    if (!metric || !record[`node${nodeIndex}`] || record[`node${nodeIndex}`][metric] === undefined) return '#ccc'

    const percentage = getPercentage(record, nodeIndex, metric)
    if (percentage > 75) return '#f56c6c'
    if (percentage > 50) return '#e6a23c'
    return '#67c23a'
  }

  // Helper to determine if a metric should show a progress bar
  const isProgressMetric = (key: string): boolean => {
    return key === 'output_rows' || key === 'elapsed_compute'
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
    padding-bottom: 8px;
    border-bottom: 1px solid var(--light-border-color);
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
      font-family: var(--font-mono);
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
        font-family: var(--font-mono);
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
    font-family: var(--font-mono); // Use var(--font-mono) for better tree alignment
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
      font-family: var(--font-mono);
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
