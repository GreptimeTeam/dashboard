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
      span.metric-key {{ key }}:
      span.metric-value {{ formatMetricValue(key, value) }}</template
>

<script lang="ts" setup name="PlanCard">
  import { computed } from 'vue'

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
      // Fix: Check for metrics in both places - directly and in metrics object
      const outputRows =
        props.nodeData.output_rows || (props.nodeData.metrics && props.nodeData.metrics.output_rows) || 0
      return Math.min(100, (outputRows / props.maxRows) * 100)
    }
    if (props.highlightType === 'DURATION' && props.maxDuration > 0) {
      // Fix: Check for metrics in both places - directly and in metrics object
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

  function formatNumber(value) {
    return new Intl.NumberFormat().format(value)
  }

  function formatDuration(nanoseconds) {
    if (nanoseconds < 1000) return `${nanoseconds}ns`
    const microseconds = nanoseconds / 1000
    if (microseconds < 1000) return `${Math.round(microseconds)}µs`
    const milliseconds = microseconds / 1000
    if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`
    const seconds = milliseconds / 1000
    return `${seconds.toFixed(2)}s`
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes}B`
    const kb = bytes / 1024
    if (kb < 1024) return `${Math.round(kb)}KB`
    const mb = kb / 1024
    if (mb < 1024) return `${Math.round(mb)}MB`
    const gb = mb / 1024
    return `${gb.toFixed(2)}GB`
  }

  const formattedProgressValue = computed(() => {
    if (props.highlightType === 'ROWS') {
      // Fix: Check for metrics in both places
      const outputRows =
        props.nodeData.output_rows || (props.nodeData.metrics && props.nodeData.metrics.output_rows) || 0
      return formatNumber(outputRows)
    }
    if (props.highlightType === 'DURATION') {
      // Fix: Check for metrics in both places
      const elapsedCompute =
        props.nodeData.elapsed_compute || (props.nodeData.metrics && props.nodeData.metrics.elapsed_compute) || 0
      return formatDuration(elapsedCompute)
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
  // Helper functions
  // function formatMetricName(key) {
  //   return key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  // }

  function formatMetricValue(key, value) {
    if (typeof value === 'number') {
      if (key.includes('time') || key.includes('duration') || key.includes('elapsed')) {
        return formatDuration(value)
      }
      if (key.includes('bytes')) {
        return formatBytes(value)
      }

      return formatNumber(value)
    }
    return value
  }
</script>
