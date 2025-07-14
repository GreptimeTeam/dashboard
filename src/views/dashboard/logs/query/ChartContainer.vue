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
      :sql="sqlForChart"
      :table-name="currentTableName"
      :ts-column="props.tsColumn"
      :refresh-trigger="props.refreshTrigger"
      @update:rows="$emit('update:rows', $event)"
      @query="$emit('query')"
      @timeRangeUpdate="handleTimeRangeUpdate"
    )
    FunnelChart(v-if="currChart == 'frequency'" :key="frequencyField" :column="frequencyField")
</template>

<script setup name="ChartContainer" lang="ts">
  import { ref, computed, watch, nextTick } from 'vue'
  import { storeToRefs } from 'pinia'
  import { useLocalStorage } from '@vueuse/core'
  import { IconDown, IconRight } from '@arco-design/web-vue/es/icon'
  import useLogsQueryStore from '@/store/modules/logs-query'
  import CountChart from '@/components/count-chart/index.vue'
  import FunnelChart from './FunnelChart.vue'
  import { getWhereClause } from './until'
  import type { ColumnType, TSColumn } from './types'

  interface Props {
    columns?: ColumnType[]
    rows?: any[]
    tsColumn?: TSColumn | null
    refreshTrigger?: number
  }

  const props = withDefaults(defineProps<Props>(), {
    columns: () => [],
    rows: () => [],
    tsColumn: null,
    refreshTrigger: 0,
  })

  const emit = defineEmits(['timeRangeUpdate'])

  const currChart = ref('count')
  const { currentTableName, finalQuery } = storeToRefs(useLogsQueryStore())
  const frequencyField = ref('')

  // Chart expanded state with localStorage persistence
  const chartExpanded = useLocalStorage('logs-chart-expanded', true)

  // Computed SQL for chart (extracts the main query)
  const sqlForChart = computed(() => finalQuery.value)
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

  // Handle chart expansion/collapse
  function toggleChart() {
    chartExpanded.value = !chartExpanded.value

    // Trigger chart data fetch when expanding
    if (chartExpanded.value && sqlForChart.value) {
      nextTick(() => {
        emit('query')
      })
    }
  }

  watch(currentTableName, () => {
    currChart.value = 'count'
  })

  function handleTimeRangeUpdate(timeRange: string[]) {
    emit('timeRangeUpdate', timeRange)
  }
</script>

<style scoped lang="less">
  :deep(.arco-btn) {
    font-size: 15px;
    padding: 0;
  }
</style>
