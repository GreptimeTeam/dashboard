<template lang="pug">
.chart-controls
  .highlight-controls
    span.control-label Highlight
    a-radio-group(
      v-model="localHighlightType"
      type="button"
      size="mini"
      :id="`${inputPrefix}-highlight`"
    )
      a-radio(value="NONE") None
      a-radio(value="ROWS") Rows
      a-radio(value="DURATION") Duration
  a-select(
    v-model="localSelectedMetric"
    size="mini"
    style="width: fit-content; margin-left: 16px; margin-right: 8px"
    placeholder="Select Metric"
    allow-clear
    :id="`${inputPrefix}-metric`"
    :trigger-props="{ autoFitPopupMinWidth: true }"
  )
    a-option(v-for="metric in availableMetrics" :key="metric.value" :value="metric.value") {{ metric.label }}
  a-button(type="outline" size="mini" @click="onToggleMetricsExpanded")
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
    maxRows: number
    maxDuration: number
    availableMetrics: Array<string>
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

  const onNodeSelect = (nodeIndex: number) => {
    emit('nodeSelected', nodeIndex)
  }

  const onToggleMetricsExpanded = () => {
    emit('update:metricsExpanded', !props.metricsExpanded)
  }
</script>

<style lang="less" scoped>
  .chart-controls {
    display: flex;
    align-items: center;
    padding: 8px;

    .highlight-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      margin-right: 16px;

      .control-label {
        font-size: 13px;
        color: var(--small-font-color);
      }
    }

    .flex-spacer {
      flex: 1;
    }
  }
</style>
