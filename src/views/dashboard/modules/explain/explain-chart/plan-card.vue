<template lang="pug">
.plan-card(:class="{ 'active-card': isActive }" :id="cardId")
  .plan-header
    .plan-name
      span {{ nodeName }}
      span.plan-ordinal(v-if="nodeData.ordinal") {{ `#${nodeData.ordinal}` }}
    .plan-param(v-if="nodeData.param" :title="nodeData.param") {{ nodeData.param }}
  .key-metrics
    .key-duration {{ keyMetrics.duration }}
    .key-metrics-bar
      .key-metrics-bar-fill(:style="{ width: `${keyMetrics.percentage}%`, backgroundColor: keyMetrics.color }")
    .key-rows {{ keyMetrics.rows }} rows
  .plan-metrics(v-if="showMetrics")
    .metric-item(v-for="(value, key) in filteredMetrics" :key="key")
      span.metric-key {{ formatMetricName(key) }}:
      span.metric-value {{ formatMetricValue(key, value) }}
</template>

<script lang="ts" setup name="PlanCard">
  import { computed } from 'vue'
  import i18n from '@/locale'
  import {
    formatMetricName,
    formatTimeValue,
    formatNumber,
    formatMetricValue,
    FIXED_EXPLAIN_METRICS,
    keyBarColor,
  } from '../utils'

  const props = defineProps({
    nodeData: {
      type: Object,
      required: true,
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
    // Unique position of this card in the chart (node + plan + operator path); keeps DOM ids distinct.
    cardKey: {
      type: String,
      default: '',
    },
  })

  const cardId = computed(() => {
    const key = props.cardKey || String(props.nodeData?.nodeIndex)
    return `plan-card-stage-${props.stageIndex}-${key.replace(/[^A-Za-z0-9_-]/g, '_')}`
  })

  // Node name
  const nodeName = computed(() => {
    return props.nodeData.name || i18n.global.t('explain.unknownOperation')
  })

  const nodeValue = (key: string): number => {
    return props.nodeData[key] || props.nodeData.metrics?.[key] || 0
  }

  const percentOf = (value: number, max: number): number => {
    return max > 0 ? Math.min(100, (value / max) * 100) : 0
  }

  // Same rule as the table: Duration leads with its bar (relative to the slowest operator in the stage); Rows is secondary.
  const keyMetrics = computed(() => {
    const rows = nodeValue('output_rows')
    const duration = nodeValue('elapsed_compute')
    const percentage = percentOf(duration, props.maxDuration)
    return {
      rows: formatNumber(rows),
      duration: formatTimeValue(duration),
      percentage,
      color: keyBarColor(percentage),
    }
  })

  // Selected metric as a separate line. Rows / Duration are already shown above, so they never repeat here.
  const extraMetric = computed(() => {
    if (!props.selectedMetric || FIXED_EXPLAIN_METRICS.includes(props.selectedMetric)) return ''
    return props.nodeData.metrics?.[props.selectedMetric] !== undefined ? props.selectedMetric : ''
  })

  // Metrics display
  const showMetrics = computed(() => props.metricsExpanded || extraMetric.value !== '')

  const filteredMetrics = computed(() => {
    if (!props.nodeData.metrics) return {}

    if (props.metricsExpanded) {
      // Return all metrics except the ones that are already shown as bars
      return Object.fromEntries(
        Object.entries(props.nodeData.metrics).filter(
          ([key]) => !['output_rows', 'elapsed_compute', 'outputRows', 'elapsedCompute'].includes(key)
        )
      )
    }
    if (extraMetric.value) {
      return { [extraMetric.value]: props.nodeData.metrics[extraMetric.value] }
    }

    return {}
  })
</script>
