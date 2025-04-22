<template lang="pug">
.plan-card(:class="{ 'active-card': isActive }" :style="cardStyle" :id="cardId")
  .plan-header
    .plan-name {{ nodeName }}
    .plan-param(v-if="nodeData.param") {{ nodeData.param }}
  .metric-progress-container(v-if="showProgressBar")
    .metric-label
      span {{ progressLabel }} {{ formattedProgressValue }}
    .metric-progress
      .metric-progress-bar(:style="{ width: `${progressPercentage}%`, backgroundColor: progressColor }")
  .plan-metrics(v-if="showMetrics")
    .metric-item(v-for="(value, key) in filteredMetrics" :key="key")
      span.metric-key {{ formatMetricName(key) }}:
      span.metric-value {{ formatMetricValue(key, value) }}
</template>

<script lang="ts" setup name="PlanCard">
  import { computed } from 'vue'
  import { formatMetricName, formatTimeValue, formatNumber, formatMetricValue } from '../utils'

  const props = defineProps({
    nodeData: {
      type: Object,
      required: true,
    },
    highlightType: {
      type: String,
      default: 'NONE',
    },
    maxRows: {
      type: Number,
      default: 0,
    },
    maxDuration: {
      type: Number,
      default: 0,
    },
    selectedMetric: {
      type: String,
      default: '',
    },
    metricsExpanded: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    stageIndex: {
      type: Number,
      required: true,
    },
  })

  const cardId = computed(() => `plan-card-stage-${props.stageIndex}-node-${props.nodeData?.nodeIndex}`)

  // Node name
  const nodeName = computed(() => {
    return props.nodeData.name || 'Unknown Operation'
  })

  // Card style
  const cardStyle = computed(() => {
    return {
      borderColor: props.isActive ? 'var(--brand-color)' : 'var(--border-color)',
    }
  })

  // Progress bar visibility and data
  const showProgressBar = computed(() => props.highlightType !== 'NONE')

  const progressPercentage = computed(() => {
    if (props.highlightType === 'ROWS' && props.maxRows > 0) {
      const outputRows =
        props.nodeData.output_rows || (props.nodeData.metrics && props.nodeData.metrics.output_rows) || 0
      return Math.min(100, (outputRows / props.maxRows) * 100)
    }
    if (props.highlightType === 'DURATION' && props.maxDuration > 0) {
      const elapsedCompute =
        props.nodeData.elapsed_compute || (props.nodeData.metrics && props.nodeData.metrics.elapsed_compute) || 0
      return Math.min(100, (elapsedCompute / props.maxDuration) * 100)
    }
    return 0
  })

  const progressLabel = computed(() => {
    if (props.highlightType === 'ROWS') {
      return 'Rows:'
    }
    if (props.highlightType === 'DURATION') {
      return 'Duration:'
    }
    return ''
  })

  const formattedProgressValue = computed(() => {
    if (props.highlightType === 'ROWS') {
      const outputRows =
        props.nodeData.output_rows || (props.nodeData.metrics && props.nodeData.metrics.output_rows) || 0
      return formatNumber(outputRows)
    }
    if (props.highlightType === 'DURATION') {
      const elapsedCompute =
        props.nodeData.elapsed_compute || (props.nodeData.metrics && props.nodeData.metrics.elapsed_compute) || 0
      return formatTimeValue(elapsedCompute)
    }
    return ''
  })

  const progressColor = computed(() => {
    const percentage = progressPercentage.value
    // Color gradient from green to yellow to red
    if (percentage < 30) return 'var(--success-color)'
    if (percentage < 70) return 'var(--warning-color)'
    return 'var(--danger-color)'
  })

  // Metrics display
  const showMetrics = computed(() => {
    return (
      props.metricsExpanded ||
      (props.selectedMetric && props.nodeData.metrics && props.nodeData.metrics[props.selectedMetric] !== undefined)
    )
  })

  const filteredMetrics = computed(() => {
    if (!props.nodeData.metrics) return {}

    if (props.metricsExpanded) {
      // Return all metrics except the ones that are already shown in the progress bar
      return Object.fromEntries(
        Object.entries(props.nodeData.metrics).filter(
          ([key]) => !['output_rows', 'elapsed_compute', 'outputRows', 'elapsedCompute'].includes(key)
        )
      )
    }
    if (props.selectedMetric && props.nodeData.metrics[props.selectedMetric] !== undefined) {
      // Just return the selected metric
      return { [props.selectedMetric]: props.nodeData.metrics[props.selectedMetric] }
    }

    return {}
  })
</script>
