<template lang="pug">
a-card(:bordered="false")
  template(#title)
    .chart-header
      a-dropdown(size="small" :popup-max-height="false" @select="select")
        a-button(type="text" style="color: var(--main-font-color)")
          | {{ menuStr }} &nbsp;
          icon-down
        template(#content)
          a-doption(value="count") Row Count Over Time
          a-dsubmenu(trigger="hover" position="lt")
            template(#default)
              | Frequency Distribution
            template(#content)
              a-doption(v-for="field in filterFields" :value="`frequency_${field}`") {{ field }}
      a-button(type="text" size="small" @click="toggleChart")
        template(#icon)
          icon-down(v-if="chartExpanded")
          icon-right(v-else)

  template(v-if="chartExpanded")
    CountChart(
      v-if="currChart == 'count'"
      ref="countChartRef"
      :query-state="queryState"
      @timeRangeUpdate="handleTimeRangeUpdate"
    )
    FunnelChart(
      v-if="currChart == 'frequency'"
      :key="frequencyField"
      ref="funnelChartRef"
      :column="frequencyField"
      :query-state="queryState"
    )
</template>

<script setup name="ChartContainer" lang="ts">
  import { ref, computed, watch, nextTick } from 'vue'
  import { useLocalStorage } from '@vueuse/core'
  import { IconDown, IconRight } from '@arco-design/web-vue/es/icon'
  import type { ColumnType, TSColumn, QueryState } from '@/types/query'
  import CountChart from '@/components/count-chart/index.vue'
  import FunnelChart from './FunnelChart.vue'

  interface Props {
    columns?: ColumnType[]
    rows?: any[]
    queryState?: QueryState | null
  }

  const props = withDefaults(defineProps<Props>(), {
    columns: () => [],
    rows: () => [],
    queryState: null,
  })

  const emit = defineEmits(['timeRangeUpdate'])

  const currChart = ref('count')

  const frequencyField = ref('')
  const countChartRef = ref()
  const funnelChartRef = ref()

  // Chart expanded state with localStorage persistence
  const chartExpanded = useLocalStorage('logquery-chart-expanded', true)

  const filterFields = computed(() => {
    try {
      if (!props.columns || !Array.isArray(props.columns)) return []
      return props.columns
        .filter((column) => column && column.data_type === 'String')
        .map((column) => column.name)
        .filter((name) => name)
    } catch (error) {
      return []
    }
  })

  function select(action) {
    currChart.value = action.split('_')[0]
    if (currChart.value === 'frequency') {
      frequencyField.value = action.substring('frequency'.length + 1)
    }
  }

  const menuStr = computed(() => {
    if (currChart.value === 'count') {
      return 'Row Count Over Time'
    }
    return 'Frequency Distribution'
  })

  // Method to trigger the current chart query based on chart type
  function triggerCurrentChartQuery() {
    if (!chartExpanded.value || !props.queryState.sql) return

    if (currChart.value === 'count' && countChartRef.value) {
      nextTick(() => {
        countChartRef.value.executeCountQuery()
      })
    } else if (currChart.value === 'frequency' && funnelChartRef.value) {
      nextTick(() => {
        funnelChartRef.value.executeChartQuery()
      })
    }
  }

  // Handle chart expansion/collapse
  function toggleChart() {
    chartExpanded.value = !chartExpanded.value

    // Trigger chart data fetch when expanding
    if (chartExpanded.value && props.queryState.sql) {
      nextTick(() => {
        triggerCurrentChartQuery()
      })
    }
  }

  function handleTimeRangeUpdate(timeRange: string[]) {
    emit('timeRangeUpdate', timeRange)
  }

  // Expose the methods to parent component
  defineExpose({
    triggerCurrentChartQuery,
  })
</script>

<style scoped lang="less">
  :deep(.arco-btn) {
    font-size: 15px;
    padding: 0;
  }
</style>
