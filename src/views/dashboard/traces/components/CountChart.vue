<template lang="pug">
VCharts(
  ref="chart"
  style="width: 100%; height: 120px"
  :option="chartOptions"
  :autoresize="true"
  @datazoom="handleZoom"
)
</template>

<script setup name="TraceCountChart" lang="ts">
  import { ref, computed, watch, shallowRef, nextTick } from 'vue'
  import VCharts from 'vue-echarts'
  import * as echarts from 'echarts'
  import editorAPI from '@/api/editor'

  interface Props {
    sql: string
    timeLength: number
    timeRange: string[]
    tableName: string
  }

  const props = defineProps<Props>()
  const emit = defineEmits(['timeRangeUpdate'])

  const data = shallowRef<Array<any>>([])
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
      formatter: (params: any) => {
        const param = params[0]
        const time = new Date(param.value[0]).toLocaleString()
        return `${time}<br/>Count: ${param.value[1]}`
      },
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

  const intervalSeconds = computed(() => {
    if (props.timeLength > 0) {
      // Calculate interval based on time length
      const minutes = props.timeLength
      if (minutes <= 60) return 60 // 1 minute intervals for <= 1 hour
      if (minutes <= 720) return 300 // 5 minute intervals for <= 12 hours
      if (minutes <= 1440) return 900 // 15 minute intervals for <= 24 hours
      return 3600 // 1 hour intervals for > 24 hours
    }
    if (props.timeRange.length === 2) {
      const start = new Date(props.timeRange[0]).getTime()
      const end = new Date(props.timeRange[1]).getTime()
      const diffMinutes = (end - start) / (1000 * 60)
      if (diffMinutes <= 60) return 60
      if (diffMinutes <= 720) return 300
      if (diffMinutes <= 1440) return 900
      return 3600
    }
    return 60
  })

  const countSql = computed(() => {
    if (!props.tableName || !props.sql) {
      return ''
    }

    // Extract WHERE clause from the original SQL
    const whereMatch = props.sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER\s+BY|\s+LIMIT\s+|\s*$)/i)
    const whereClause = whereMatch ? `WHERE ${whereMatch[1]}` : ''

    return `SELECT
            date_bin('${intervalSeconds.value} seconds', timestamp) AS time_bucket,
            COUNT(*) AS event_count
        FROM ${props.tableName}
        ${whereClause}
        GROUP BY time_bucket
        ORDER BY time_bucket DESC
        LIMIT 200`
  })

  async function countQuery() {
    if (!countSql.value) {
      data.value = []
      return
    }

    try {
      const result = await editorAPI.runSQL(countSql.value)
      if (result.output?.[0]?.records) {
        const { rows } = result.output[0].records
        const tmpData = rows.map((row: any[]) => [new Date(row[0] / 1000 / 1000).getTime(), row[1]])
        data.value = tmpData.reverse() // Reverse to show chronological order

        nextTick(() => {
          chart.value.dispatchAction({
            type: 'takeGlobalCursor',
            key: 'dataZoomSelect',
            dataZoomSelectActive: true,
          })
        })
      }
    } catch (error) {
      console.error('Failed to fetch count data:', error)
      data.value = []
    }
  }

  // Expose method to trigger count query
  function executeCountQuery() {
    countQuery()
  }

  function handleZoom(e: any) {
    const start = e.batch[0].startValue
    const end = e.batch[0].endValue

    if (!start || !end) {
      return
    }

    // Convert to ISO strings for time range
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()

    // Emit the time range update
    emit('timeRangeUpdate', [startTime / 1000, endTime / 1000])
  }

  // Expose the method to parent component
  defineExpose({
    executeCountQuery,
  })
</script>

<style scoped lang="less"></style>
