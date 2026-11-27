<template lang="pug">
.explain-controls.gpt-results-toolbar
  .control-item
    span.control-label {{ $t('explain.stage') }}
    a-radio-group(v-model="stage" type="button" size="small")
      a-radio(v-for="i in stageCount" :key="i - 1" :value="i - 1") {{ i - 1 }}
  .control-item(v-if="view === 'chart' && rootPlans.length > 1")
    span.control-label {{ $t('explain.rootPlan') }}
    a-select.control-select(v-model="rootPlan" size="small")
      a-option(v-for="name in rootPlans" :key="name" :value="name") {{ name }}
  .control-item
    span.control-label {{ $t('explain.nodes') }}
    a-select.control-select(
      v-model="selectedNodes"
      size="small"
      multiple
      allow-clear
      :max-tag-count="2"
      :placeholder="$t('explain.nodesAll')"
    )
      a-option(v-for="nodeId in nodes" :key="nodeId" :value="nodeId") {{ $t('explain.nodeN', { n: nodeId }) }}
  .control-item
    span.control-label {{ $t('explain.metric') }}
    a-select.control-select(
      size="small"
      allow-clear
      :model-value="selectedMetric"
      :placeholder="$t('explain.metricPlaceholder')"
      :trigger-props="{ autoFitPopupMinWidth: true }"
      @change="onMetricChange"
    )
      a-option(v-for="metric in metrics" :key="metric.value" :value="metric.value") {{ metric.label }}
  a-button(type="outline" size="small" @click="metricsExpanded = !metricsExpanded")
    template(#icon)
      icon-expand(v-if="!metricsExpanded")
      icon-shrink(v-else)
    | {{ metricsExpanded ? $t('explain.collapse') : $t('explain.expand') }}
</template>

<script lang="ts" setup name="ExplainControls">
  // Controls shared by the explain table and chart views, so both expose the same
  // options with the same names. State lives in the parent and is applied to the active stage.
  defineProps<{
    view: 'table' | 'chart'
    stageCount: number
    nodes: number[]
    metrics: Array<{ label: string; value: string }>
    rootPlans: string[]
  }>()

  const stage = defineModel<number>('stage', { required: true })
  const rootPlan = defineModel<string>('rootPlan', { default: '' })
  const selectedNodes = defineModel<number[]>('selectedNodes', { default: () => [] })
  const selectedMetric = defineModel<string>('selectedMetric', { default: '' })
  const metricsExpanded = defineModel<boolean>('metricsExpanded', { default: false })

  const onMetricChange = (value: unknown) => {
    selectedMetric.value = typeof value === 'string' ? value : ''
    // Picking a single metric switches back from the "show everything" mode.
    metricsExpanded.value = false
  }
</script>

<style lang="less" scoped>
  .explain-controls {
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: var(--gpt-gap-md) var(--gpt-gap-lg);
  }

  .control-item {
    display: flex;
    align-items: center;
    gap: var(--gpt-gap-md);
    min-width: 0;
  }

  .control-label {
    flex-shrink: 0;
    font-size: var(--gpt-font-sm);
    font-weight: 500;
    color: var(--gpt-text-secondary);
    line-height: 1.2;
  }

  .control-select {
    min-width: 160px;
    width: fit-content;
    max-width: 320px;
  }
</style>
