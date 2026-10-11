<template lang="pug">
.chart-controls
  .control-group
    span.control-label Highlight
    a-radio-group.highlight-radio(
      v-model="localHighlightType"
      direction="vertical"
      type="button"
      size="small"
      :id="`${inputPrefix}-highlight`"
    )
      a-radio(value="NONE") None
      a-radio(value="ROWS") Rows
      a-radio(value="DURATION") Duration
  .control-group
    span.control-label Metric
    a-select.metric-select(
      v-model="localSelectedMetric"
      size="small"
      placeholder="Select"
      allow-clear
      :id="`${inputPrefix}-metric`"
      :trigger-props="{ autoFitPopupMinWidth: true }"
    )
      a-option(v-for="metric in availableMetrics" :key="metric.value" :value="metric.value") {{ metric.label }}
  a-button.expand-btn(
    type="outline"
    size="small"
    long
    @click="onToggleMetricsExpanded"
  )
    template(#icon)
      icon-expand(v-if="!metricsExpanded")
      icon-shrink(v-else)
    | {{ metricsExpanded ? 'Collapse' : 'Expand' }}
</template>

<script lang="ts" setup>
  import { ref, watch, computed } from 'vue'
  import { IconExpand, IconShrink } from '@arco-design/web-vue/es/icon'

  const props = defineProps<{
    availableNodes: number[]
    activeNodeIndex: number
    highlightType: string
    selectedMetric: string
    metricsExpanded: boolean
    availableMetrics: Array<{ label: string; value: string }>
    stageIndex: number
  }>()

  const emit = defineEmits<{
    (e: 'update:highlightType', value: string): void
    (e: 'update:selectedMetric', value: string): void
    (e: 'update:metricsExpanded', value: boolean): void
    (e: 'nodeSelected', nodeIndex: number): void
  }>()
  const inputPrefix = computed(() => `chart-control-stage-${props.stageIndex}`)

  const localHighlightType = ref(props.highlightType)
  const localSelectedMetric = ref(props.selectedMetric)

  watch(
    () => props.highlightType,
    (val) => {
      localHighlightType.value = val
    }
  )
  watch(
    () => props.selectedMetric,
    (val) => {
      localSelectedMetric.value = val
    }
  )

  watch(localHighlightType, (val) => emit('update:highlightType', val))
  watch(localSelectedMetric, (val) => emit('update:selectedMetric', val))

  const onToggleMetricsExpanded = () => {
    emit('update:metricsExpanded', !props.metricsExpanded)
  }
</script>

<style lang="less" scoped>
  .chart-controls {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-md);
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-xs);
  }

  .control-label {
    flex-shrink: 0;
    font-size: var(--gpt-font-sm);
    font-weight: 500;
    color: var(--gpt-text-secondary);
    line-height: 1.2;
  }

  .highlight-radio {
    width: 100%;

    :deep(&.arco-radio-group-button) {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: auto !important;
      overflow: visible;
    }

    :deep(.arco-radio-button) {
      width: 100%;
      height: var(--gpt-control-height-sm);
      margin: -1px 0 0;
      justify-content: flex-start;

      &:first-of-type {
        margin-top: 0;
        border-radius: var(--gpt-radius-sm) var(--gpt-radius-sm) 0 0;
      }

      &:last-of-type {
        border-radius: 0 0 var(--gpt-radius-sm) var(--gpt-radius-sm);
      }
    }

    :deep(.arco-radio-button-content) {
      width: 100%;
      justify-content: flex-start;
    }
  }

  .metric-select {
    width: 100%;
  }

  .expand-btn {
    width: 100%;
  }
</style>
