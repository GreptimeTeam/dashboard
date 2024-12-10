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
  import useLogQueryStore from '@/store/modules/logquery'
  import { calculateInterval, generateTimeRange, toMs, TimeTypes, getWhereClause, addTsCondition, toObj } from './until'
  import type { TimeType } from './until'

  const props = defineProps(['column'])
  const data = shallowRef<Array<any>>([])
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

  const { inputTableName, unifiedRange, tsColumn, queryNum, sql, editorType, rows, tableIndex } = storeToRefs(
    useLogQueryStore()
  )
  const { getRelativeRange, buildCondition, query } = useLogQueryStore()

  const chartSql = computed(() => {
    if (!tsColumn.value) {
      return ''
    }

    let condition = ''
    if (editorType.value === 'text') {
      condition += getWhereClause(sql.value)
    }
    if (editorType.value === 'builder') {
      condition += buildCondition().join('')
    }
    if (condition !== '') {
      condition = `Where ${condition}`
    }

    return `SELECT ${props.column} ,count(*) AS c FROM ${inputTableName.value} ${condition} GROUP BY ${props.column} ORDER BY c DESC`
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

  if (chartSql.value) {
    chartQuery()
  }

  watch(queryNum, () => {
    chartQuery()
  })
</script>

<style scoped lang="less"></style>
