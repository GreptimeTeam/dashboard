<template lang="pug">
.chart-container
  Chart(ref="chart" :options="chartOptions" @dataZoom="handleZoom")
</template>

<script setup name="CountChart" lang="ts">
  import { nextTick, shallowRef, ref, computed, watch } from 'vue'
  import { watchOnce } from '@vueuse/core'
  import { storeToRefs } from 'pinia'
  import { useI18n } from 'vue-i18n'
  import Chart from '@/components/chart/index.vue'
  import editorAPI from '@/api/editor'
  import useLogsQueryStore from '@/store/modules/logs-query'
  import { getWhereClause, toMs, toObj, addTsCondition, calculateInterval, TimeTypes } from './until'

  import type { TSColumn, ColumnType } from './types'

  interface Props {
    rows?: any[]
    columns?: ColumnType[]
    tsColumn?: TSColumn | null
  }

  const props = defineProps<Props>()

  const emit = defineEmits(['update:rows', 'query'])

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
        formatter: (value) => {
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

  const { currentTableName, timeRangeValues, unixTimeRange, queryNum, sql, editorType } = storeToRefs(
    useLogsQueryStore()
  )

  const intervalSeconds = computed(() => {
    if (unixTimeRange.value.length === 2 && unixTimeRange.value[0] !== unixTimeRange.value[1]) {
      return calculateInterval(unixTimeRange.value[0], unixTimeRange.value[1])
    }
    return 60
  })

  const countSql = computed(() => {
    if (!props.tsColumn || !currentTableName.value) {
      return ''
    }

    // Extract WHERE clause from the generated SQL (works for both text and builder modes)
    const whereClause = getWhereClause(sql.value)
    const condition = whereClause ? `WHERE ${whereClause}` : ''

    return `SELECT
            date_bin('${intervalSeconds.value} seconds',${props.tsColumn.name})  AS time_bucket,
            COUNT(*) AS event_count
        FROM "${currentTableName.value}"
        ${condition}
        GROUP BY time_bucket
        ORDER BY time_bucket DESC
        limit 200
        `
  })

  function countQuery() {
    if (!countSql.value) {
      data.value = []
      return
    }
    editorAPI.runSQL(countSql.value).then((result) => {
      const {
        rows: countRows,
        schema: { column_schemas: columnSchemas },
      } = result.output[0].records
      const countTs = columnSchemas[0].data_type
      const multiple = TimeTypes[countTs]
      const tmpData: [number, number][] = countRows.map((v: any[]) => [toMs(Number(v[0]), multiple), v[1]])
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
      emit('query')
      return
    }
    const xAxisPoints = chart.value.chart.getOption().series[0].data
    const visiblePoints = xAxisPoints
      .filter((point) => point && point[0] >= start && point[0] <= end)
      .sort((a, b) => {
        if (a[0] > b[0]) {
          return 1
        }
        if (a[0] < b[0]) {
          return -1
        }
        return 0
      })
    if (!props.tsColumn || !visiblePoints.length) return

    // Use simple timestamp values for zoom range
    const dataStart = Math.floor(visiblePoints[0][0] / 1000)
    const dataEnd = Math.floor(visiblePoints[visiblePoints.length - 1][0] / 1000) + intervalSeconds.value

    // Replace time placeholders with zoom range values - no multiple conversion needed
    const pageSql = sql.value.replace(/\$timestart/g, dataStart.toString()).replace(/\$timeend/g, dataEnd.toString())

    editorAPI.runSQL(pageSql).then((result) => {
      const columns = result.output[0].records.schema.column_schemas
      const newRows = result.output[0].records.rows.map((row, index) => {
        return toObj(row, columns, index, props.tsColumn)
      })
      emit('update:rows', newRows)
    })
  }
</script>

<style scoped lang="less"></style>
