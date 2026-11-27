<template lang="pug">
a-card.explain-grid(:bordered="false" :class="`explain-grid-${props.index}`")
  a-table(
    size="small"
    column-resizable
    stripe
    :data="tableData"
    :pagination="false"
    :bordered="false"
    :expandable="{ expandedRowRender: expandedRowRender, rowExpandable: rowExpandable, fixed: true }"
    :scroll="{ x: scrollWidth }"
    :row-class="getRowClass"
    @row-click="handleRowClick"
  )
    template(#columns)
      a-table-column(
        title="Plan"
        data-index="step"
        fixed="left"
        :width="PLAN_COLUMN_WIDTH"
      )
        template(#cell="{ record }")
          .step-cell
            .step-line
              span.step-name {{ record.step }}
              template(v-if="record.root")
                span.root-ordinal(v-if="record.root.ordinal") {{ '#' + record.root.ordinal }}
                span.root-coverage(v-if="record.root.coverage < record.root.total") {{ record.root.coverage }}/{{ record.root.total }} {{ $t('explain.nodes') }}
            .root-param(v-if="record.root && record.root.param" :title="record.root.param") {{ record.root.param }}
      template(v-for="nodeIndex in filteredNodeIndices" :key="nodeIndex")
        a-table-column(:title="`Node ${nodeIndex}`" :data-index="`node${nodeIndex}`" :width="NODE_COLUMN_WIDTH")
          template(#cell="{ record }")
            .metrics(v-if="record[`node${nodeIndex}`]")
              .key-metrics
                .key-duration {{ getKeyMetrics(record, nodeIndex).duration }}
                .key-metrics-bar
                  .key-metrics-bar-fill(
                    :style="{ width: `${getKeyMetrics(record, nodeIndex).percentage}%`, backgroundColor: getKeyMetrics(record, nodeIndex).color }"
                  )
                .key-rows {{ getKeyMetrics(record, nodeIndex).rows }} rows
              template(v-if="metricsExpanded")
                template(v-for="(value, key) in getExtraMetrics(record[`node${nodeIndex}`])" :key="key")
                  .metric
                    .metric-header
                      span.metric-key {{ formatMetricName(key) }}:
                      span.metric-value {{ formatMetricValue(key, value) }}
              template(v-else-if="extraMetricKey && record[`node${nodeIndex}`][extraMetricKey] !== undefined")
                .metric
                  .metric-header
                    span.metric-key {{ formatMetricName(extraMetricKey) }}:
                    span.metric-value {{ formatMetricValue(extraMetricKey, record[`node${nodeIndex}`][extraMetricKey]) }}
</template>

<script lang="ts" setup name="ExplainGrid">
  import { h } from 'vue'
  import i18n from '@/locale'
  import {
    formatMetricName,
    formatMetricValue,
    FIXED_EXPLAIN_METRICS,
    keyBarColor,
    alignStagePlans,
    getSlotOperators,
    groupNodeParams,
  } from './utils'

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
  const props = withDefaults(
    defineProps<{
      data: [number, number, string][]
      index: number
      // Node ids to show as columns; empty means all nodes.
      selectedNodes?: number[]
      // Metric shown in each node cell (falls back to output rows when empty).
      selectedMetric?: string
      // Show every metric of each node instead of just the selected one.
      metricsExpanded?: boolean
    }>(),
    { selectedNodes: () => [], selectedMetric: '', metricsExpanded: false }
  )

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

  // Rows / Duration live on the key-metrics line; the selected metric is shown only when it is an extra one.
  const extraMetricKey = computed(() => {
    const key = props.selectedMetric
    return key && !FIXED_EXPLAIN_METRICS.includes(key) ? key : ''
  })

  const availableNodes = computed(() => {
    if (!props.data || props.data.length === 0) return []
    const nodeIds = [...new Set(props.data.map((row) => row[1]))]
    return nodeIds.sort((a, b) => a - b)
  })

  const filteredNodeIndices = computed(() => {
    if (!props.selectedNodes || props.selectedNodes.length === 0) {
      return availableNodes.value
    }
    return [...props.selectedNodes].sort((a, b) => a - b)
  })

  // Plan and node columns have fixed widths so the Plan column can stay pinned while nodes scroll.
  const PLAN_COLUMN_WIDTH = 300
  const NODE_COLUMN_WIDTH = 220
  const scrollWidth = computed(() => PLAN_COLUMN_WIDTH + filteredNodeIndices.value.length * NODE_COLUMN_WIDTH)

  // Metrics other than Rows / Duration (those are on the key-metrics line), alphabetically.
  const getExtraMetrics = (metrics: Record<string, any> | undefined) => {
    if (!metrics) return {}
    const sortedMetrics: Record<string, any> = {}
    Object.keys(metrics)
      .filter((key) => !FIXED_EXPLAIN_METRICS.includes(key))
      .sort((a, b) => a.localeCompare(b))
      .forEach((key) => {
        sortedMetrics[key] = metrics[key]
      })
    return sortedMetrics
  }

  // Determine if a row has additional details to show
  const rowExpandable = (record: any) => {
    return record.paramGroups.length > 0
  }

  // Render expanded row content
  // Param can differ per node (a scan's region and files, dynamic filters), so it is listed per node:
  // nodes sharing a value are grouped on one line, and a single "Param" line is used only when every
  // shown node that ran this operator has the same value.
  const expandedRowRender = (record: any) => {
    const shown = new Set(filteredNodeIndices.value)
    const groups = (record.paramGroups as Array<{ nodes: number[]; param: string }>)
      .map((group) => ({ ...group, nodes: group.nodes.filter((node) => shown.has(node)) }))
      .filter((group) => group.nodes.length > 0)
    const ranOperator = filteredNodeIndices.value.filter((node) => record[`node${node}`] !== undefined)
    const sameForAll = groups.length === 1 && groups[0].nodes.length === ranOperator.length

    const details = groups.map((group) => {
      if (sameForAll) return { label: 'Param', value: group.param }
      const label =
        group.nodes.length === 1
          ? i18n.global.t('explain.nodeN', { n: group.nodes[0] })
          : `${i18n.global.t('explain.nodes')} ${group.nodes.join(', ')}`
      return { label, value: group.param }
    })

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

  // Plans of the whole stage, aligned across nodes (see alignStagePlans). Always built from the whole
  // stage so the node and root filters never change the plan numbering.
  const alignment = computed(() => alignStagePlans(props.data ?? []))

  // One row per operator position of every plan, in plan order. A node that did not run an operator has
  // no `node<N>` entry, so its cell stays empty.
  const tableData = computed(() => {
    const { slots, nodeIds } = alignment.value
    const rows: any[] = []

    slots.forEach((slot, slotPosition) => {
      getSlotOperators(slot).forEach((operator) => {
        const record: any = {
          key: operator.key,
          step: operator.step,
          path: operator.path,
          paramGroups: groupNodeParams(operator.byNode),
          startsPlan: operator.depth === 0 && slotPosition > 0,
        }
        if (operator.depth === 0) {
          record.root = {
            param: slot.label.param,
            ordinal: slot.label.ordinal,
            coverage: slot.byNode.size,
            total: nodeIds.length,
          }
        }
        operator.byNode.forEach((cell, nodeIndex) => {
          record[`node${nodeIndex}`] = {
            ...cell.metrics,
            output_rows: cell.output_rows,
            elapsed_compute: cell.elapsed_compute,
          }
        })
        rows.push(record)
      })
    })

    return rows
  })

  const getRowClass = (record: any) =>
    [record.root ? 'plan-root-row' : '', record.startsPlan ? 'plan-start-row' : ''].filter(Boolean).join(' ')

  // Row click handler
  const handleRowClick = (record: any) => {
    if (rowExpandable(record)) {
      toggleRowExpansion(record)
    }
  }

  // Largest value of every numeric metric over the whole stage (all plans, nodes and operators), computed
  // once per data change. The bars then mean the same thing whatever the node or root filter shows, and
  // they match the chart.
  const stageMax = computed(() => {
    const max: Record<string, number> = {}
    const note = (key: string, value: unknown) => {
      if (typeof value === 'number' && value > (max[key] ?? 0)) max[key] = value
    }
    const walk = (operator: any) => {
      note('output_rows', operator.output_rows)
      note('elapsed_compute', operator.elapsed_compute)
      Object.entries(operator.metrics ?? {}).forEach(([key, value]) => note(key, value))
      operator.children?.forEach(walk)
    }
    alignment.value.slots.forEach((slot) => slot.byNode.forEach((plan) => walk(plan)))
    return max
  })

  const getPercentage = (record: any, nodeIndex: number, metric: string | null): number => {
    const value = metric ? record[`node${nodeIndex}`]?.[metric] : undefined
    if (value === undefined) return 0

    const maxValue = stageMax.value[metric as string] ?? 0
    return maxValue > 0 ? (value / maxValue) * 100 : 0
  }

  const getKeyMetrics = (record: any, nodeIndex: number) => {
    const cell = record[`node${nodeIndex}`]
    const percentage = getPercentage(record, nodeIndex, 'elapsed_compute')
    return {
      rows: cell?.output_rows !== undefined ? formatMetricValue('output_rows', cell.output_rows) : '-',
      duration: cell?.elapsed_compute !== undefined ? formatMetricValue('elapsed_compute', cell.elapsed_compute) : '-',
      percentage,
      color: keyBarColor(percentage),
    }
  }
</script>

<style lang="less" scoped>
  .explain-grid {
    --color-text-2: var(--gpt-text-primary);
    overflow: auto;
    padding: var(--gpt-page-padding-y) var(--gpt-page-padding-x);
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-md);
    background: var(--gpt-bg-panel);
    width: 100%;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;

    :deep(.arco-btn-icon .arco-icon) {
      color: var(--gpt-text-primary);
      stroke: currentColor;
    }
  }

  .metrics {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    overflow: hidden; // never spill into the next node column
    white-space: nowrap;
  }

  .key-metrics {
    font-size: var(--gpt-font-base);

    // Duration is what answers "where did the time go", so it leads; rows are context.
    .key-duration {
      font-family: var(--font-mono);
      font-weight: 600;
      color: var(--gpt-text-primary);
      white-space: nowrap;
    }

    .key-rows {
      margin-top: 2px;
      font-family: var(--font-mono);
      font-size: var(--gpt-font-sm);
      color: var(--gpt-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .key-metrics-bar {
      height: 3px;
      margin-top: 4px;
      background-color: var(--gpt-table-head-bg);
      border-radius: 2px;
      overflow: hidden;
    }

    .key-metrics-bar-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.3s ease;
    }
  }

  .metric {
    display: flex;
    flex-direction: column;
    margin-bottom: 4px;

    .metric-header {
      display: flex;
      justify-content: flex-start;
      font-size: var(--gpt-font-base);
    }

    .metric-key {
      color: var(--gpt-text-muted);
      margin-right: 8px;
      flex-shrink: 0;
    }

    .metric-value {
      color: var(--gpt-text-primary);
      font-family: var(--font-mono);
      text-overflow: ellipsis;
      overflow: hidden;
    }
  }

  :deep(.arco-table-container) {
    overflow-x: auto;
  }

  // A thin rule above every plan after the first, so a second root does not read as a sibling operator.
  :deep(.plan-start-row td) {
    border-top: 1px solid var(--gpt-border-default);
  }

  :deep(.arco-table-td) {
    white-space: pre; // Preserve whitespace for tree structure
    overflow: visible;
  }

  // Each plan's root row is shaded and bold, so the operators under it read as that plan's tree.
  :deep(.plan-root-row td) {
    background-color: var(--gpt-bg-surface);
  }

  .root-ordinal,
  .root-coverage {
    margin-left: 8px;
    color: var(--gpt-text-muted);
  }

  .root-param {
    max-width: 100%;
    margin-top: 2px;
    color: var(--gpt-text-muted);
    font-size: var(--gpt-font-sm);
    white-space: normal;
    word-break: break-all;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .step-cell {
    white-space: pre; // Preserve whitespace for tree structure
    font-family: var(--font-mono); // Use var(--font-mono) for better tree alignment
    color: var(--gpt-text-primary);
    align-self: flex-start; // Align at the top

    .step-line {
      white-space: pre;
    }
  }

  :deep(.plan-root-row) .step-name {
    font-weight: 600;
  }

  :deep(.arco-table-td) {
    .expanded-row {
      padding: var(--gpt-gap-md) 0;
      background-color: var(--gpt-bg-surface);
    }

    .expanded-row-details {
      padding: 0 var(--gpt-page-padding-x) 0 36px;
      font-size: var(--gpt-font-base);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .detail-item {
      display: flex;
      align-items: center;
    }
    .detail-label {
      color: var(--gpt-text-muted);
      margin-right: var(--gpt-gap-md);
      font-weight: 500;
    }
    .detail-value {
      color: var(--gpt-text-primary);
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

  :deep(.arco-table-expand-btn) {
    color: var(--gpt-text-primary) !important;
    background-color: transparent !important;

    &:hover {
      color: var(--gpt-text-primary) !important;
      background-color: var(--gpt-nav-active-bg) !important;
    }

    .arco-icon,
    svg {
      color: var(--gpt-text-primary) !important;
      stroke: currentColor;
    }
  }
</style>
