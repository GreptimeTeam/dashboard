<template lang="pug">
VCharts(
  ref="chart"
  style="width: 100%; height: 120px"
  :option="chartOptions"
  :autoresize="true"
  @datazoom="handleZoom"
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
    toolbox: {
      orient: 'vertical',
      itemSize: 13,
      top: 15,
      right: 6,
      feature: {
        dataZoom: {
          yAxisIndex: 'none',
        },
      },
    },
    dataZoom: [
      {
        type: 'inside', // Enables zoom by dragging
        xAxisIndex: 0,
        yAxisIndex: 'none',
        start: 0, // Default start percentage (0%)
        end: 100, // Default end percentage (100%)
      },
    ],
    xAxis: {
      type: 'time',
      boundaryGap: false,
      position: 'bottom',
      show: !!data.value.length,
    },
    yAxis: {
      type: 'value',
      position: 20,
      minInterval: 1,
      axisLabel: {
        formatter: (value: number) => {
          if (value >= 1000000) {
            return `${value / 1000000}M`
          }
          if (value >= 1000) {
            return `${value / 1000}K`
          }
          return value
        },
      },
    },
    series: [
      {
        type: 'bar',
        data: data.value,
        barMaxWidth: 25,
        barWidth: '50%',
        itemStyle: {
          color: '#bdc4cd',
        },
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

  const intervalSeconds = computed(() => {
    if (unifiedRange.value.length && unifiedRange.value[0] !== unifiedRange.value[1]) {
      return calculateInterval(unifiedRange.value[0], unifiedRange.value[1])
    }
    return 60
  })

  const countSql = computed(() => {
    if (!tsColumn.value || !inputTableName.value) {
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

    return `SELECT
            date_bin('${intervalSeconds.value} seconds',${tsColumn.value.name})  AS time_bucket,
            COUNT(*) AS event_count
        FROM ${inputTableName.value}
        ${condition}
        GROUP BY time_bucket
        ORDER BY time_bucket DESC
        limit 200
        `
  })

  function countQuery() {
    if (!countSql.value) {
      return
    }
    editorAPI.runSQL(countSql.value).then((result) => {
      const {
        rows: countRows,
        schema: { column_schemas: columnSchemas },
      } = result.output[0].records
      const countTs = columnSchemas[0].data_type as TimeType
      const multiple = TimeTypes[countTs]
      let tmpData = []
      tmpData = countRows.map((v: Array<any>) => [toMs(Number(v[0]), multiple), v[1]])
      data.value = tmpData
      nextTick(() => {
        chart.value.dispatchAction({
          type: 'takeGlobalCursor',
          key: 'dataZoomSelect',
          dataZoomSelectActive: true,
        })
      })
    })
  }

  // watch for init data stat
  if (sql.value) {
    watchOnce(countSql, () => {
      if (countSql.value) {
        countQuery()
      }
    })
  }
  if (countSql.value) {
    countQuery()
  }

  watch(queryNum, () => {
    countQuery()
  })

  function handleZoom(e) {
    const start = e.batch[0].startValue
    const end = e.batch[0].endValue
    if (!start || !end) {
      query()
      return
    }
    const xAxisPoints = chart.value.chart.getOption().series[0].data
    const visiblePoints = xAxisPoints
      .filter((point) => point[0] >= start && point[0] <= end)
      .sort((a, b) => {
        if (a[0] > b[0]) {
          return 1
        }
        if (a[0] < b[0]) {
          return -1
        }
        return 0
      })
    const { name, multiple } = tsColumn.value
    const dataStart = Math.floor(visiblePoints[0][0] / 1000) * multiple
    const dataEnd = (Math.floor(visiblePoints[visiblePoints.length - 1][0] / 1000) + intervalSeconds.value) * multiple
    // console.log(tsColumn.value)
    const pageSql = addTsCondition(sql.value, name, dataStart, dataEnd)
    // console.log(pageSql)
    editorAPI.runSQL(pageSql).then((result) => {
      const columns = result.output[0].records.schema.column_schemas
      rows.value = result.output[0].records.rows.map((row, index) => {
        return toObj(row, columns, index, tsColumn.value)
      })
      tableIndex.value += 1
    })
  }
</script>

<style scoped lang="less"></style>
