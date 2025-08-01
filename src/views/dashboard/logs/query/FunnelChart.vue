<template lang="pug">
VCharts(
  ref="chart"
  style="width: 100%; height: 120px"
  :option="chartOptions"
  :autoresize="true"
)
</template>

<script setup name="LogCountChart" lang="ts">
  import VCharts from 'vue-echarts'
  import { useI18n } from 'vue-i18n'
  import * as echarts from 'echarts'
  import { watchOnce } from '@vueuse/core'
  import editorAPI from '@/api/editor'
  import type { QueryState } from '@/types/query'
  import { replaceTimePlaceholders } from '@/utils/sql'
  import { getWhereClause } from './until'

  interface Props {
    queryState: QueryState
    column: string
  }

  const props = withDefaults(defineProps<Props>(), {
    column: '',
  })

  const data = shallowRef([])
  const { t } = useI18n()
  const chart = ref()
  const chartOptions = computed(() => ({
    grid: {
      left: '55px',
      bottom: '20px',
      right: '55px',
      top: '10px',
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    xAxis: {
      type: 'category',
      position: 'bottom',
      show: !!data.value.length,
    },
    yAxis: {
      type: 'value',
    },
    series: [
      {
        type: 'bar',
        data: data.value,
        itemStyle: {
          color: '#bdc4cd',
        },
        barMaxWidth: 50,
      },
    ],
    graphic: {
      elements: [
        {
          type: 'text',
          left: 'center',
          top: 'middle',
          style: {
            text: data.value.length ? '' : 'No Chart data',
            fill: '#999',
            fontSize: 18,
          },
        },
      ],
    },
  }))

  const chartSql = computed(() => {
    const { timeRangeValues } = props.queryState
    if (!props.queryState.table || !props.column) {
      return ''
    }
    // Extract WHERE clause from the generated SQL (works for both text and builder modes)
    const [startTs, endTs] = timeRangeValues
    const currentSql = replaceTimePlaceholders(props.queryState.sql, [startTs, endTs])
    const whereClause = getWhereClause(currentSql)
    const condition = whereClause ? `WHERE ${whereClause}` : ''
    return `SELECT ${props.column} ,count(*) AS c FROM ${props.queryState.table} ${condition} GROUP BY ${props.column} ORDER BY c DESC`
  })

  function chartQuery() {
    if (!chartSql.value) {
      return
    }
    editorAPI.runSQL(chartSql.value).then((result) => {
      const {
        rows: countRows,
        schema: { column_schemas: columnSchemas },
      } = result.output[0].records
      data.value = countRows
    })
  }

  // Expose method to trigger chart query
  function executeChartQuery() {
    chartQuery()
  }

  // Initial query if SQL is available
  if (chartSql.value) {
    chartQuery()
  }

  // Expose the method to parent component
  defineExpose({
    executeChartQuery,
  })
</script>

<style scoped lang="less"></style>
