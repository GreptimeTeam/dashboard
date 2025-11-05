<template lang="pug">
VCharts(
  ref="chart"
  style="width: 100%; height: 120px"
  :option="chartOptions"
  :autoresize="true"
  @datazoom="handleZoom"
)
</template>

<script setup name="CountChart" lang="ts">
  import { ref, computed, watch, shallowRef, nextTick } from 'vue'
  import VCharts from 'vue-echarts'
  import * as echarts from 'echarts'
  import editorAPI from '@/api/editor'
  import type { QueryState } from '@/types/query'
  import { replaceTimePlaceholders } from '@/utils/sql'
  import { convertTimestampToMilliseconds } from '@/utils/date-time'
  import { useDateTimeFormat } from '@/hooks'

  interface Props {
    queryState: QueryState
  }

  const props = defineProps<Props>()

  const emit = defineEmits(['timeRangeUpdate', 'update:rows', 'query'])

  const data = shallowRef<Array<any>>([])
  const chart = ref()

  // Use timezone-aware date formatting
  const { formatDateTime } = useDateTimeFormat()

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
        // Use timezone-aware formatting (assuming timestamp is in milliseconds)
        const time = formatDateTime(param.value[0], 'TimestampMillisecond') || new Date(param.value[0]).toLocaleString()
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
      axisLabel: {
        formatter: (value: number) => {
          return formatDateTime(value, 'TimestampMillisecond') ?? String(value)
        },
      },
      axisPointer: {
        label: {
          formatter: (params: any) => {
            const { value } = params
            return formatDateTime(value, 'TimestampMillisecond') ?? String(value)
          },
        },
      },
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

  // Default interval calculation (traces style)
  const defaultIntervalCalculator = (timeLength?: number, timeRange?: string[]) => {
    if (timeLength && timeLength > 0) {
      // Calculate interval based on time length
      const minutes = timeLength
      if (minutes <= 60) return 60 // 1 minute intervals for <= 1 hour
      if (minutes <= 720) return 300 // 5 minute intervals for <= 12 hours
      if (minutes <= 1440) return 900 // 15 minute intervals for <= 24 hours
      return 3600 // 1 hour intervals for > 24 hours
    }
    if (timeRange && timeRange.length === 2) {
      const start = new Date(timeRange[0]).getTime()
      const end = new Date(timeRange[1]).getTime()
      const diffMinutes = (end - start) / (1000 * 60)
      if (diffMinutes <= 60) return 60
      if (diffMinutes <= 720) return 300
      if (diffMinutes <= 1440) return 900
      return 3600
    }
    return 60
  }

  const intervalSeconds = computed(() => {
    return defaultIntervalCalculator(props.queryState.time, props.queryState.rangeTime)
  })

  const countSql = computed(() => {
    const { table, sql, tsColumn, timeRangeValues } = props.queryState
    if (!table || !sql || !tsColumn?.name) {
      return ''
    }

    // Extract WHERE clause from the original SQL
    const [startTs, endTs] = timeRangeValues
    const currentSql = replaceTimePlaceholders(sql, [startTs, endTs])
    const whereMatch = currentSql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER\s+BY|\s+LIMIT\s+|\s*$)/i)

    const whereClause = whereMatch ? `WHERE ${whereMatch[1]}` : ''

    return `SELECT
            date_bin('${intervalSeconds.value} seconds', ${tsColumn.name}) AS time_bucket,
            COUNT(*) AS event_count
        FROM "${table}"
        ${whereClause}
        GROUP BY time_bucket
        ORDER BY time_bucket DESC
        LIMIT 200`
  })

  // Helper function to update chart cursor state
  function updateChartCursor(hasData: boolean) {
    nextTick(() => {
      chart.value?.dispatchAction({
        type: 'takeGlobalCursor',
        key: 'dataZoomSelect',
        dataZoomSelectActive: hasData,
      })
    })
  }

  async function countQuery() {
    if (!countSql.value) {
      data.value = []
      return
    }

    try {
      const result = await editorAPI.runSQL(countSql.value)
      if (result.output?.[0]?.records) {
        const { rows } = result.output[0].records

        // Convert timestamps using tsColumn multiple
        const tmpData = rows.map((row: any[]) => [
          convertTimestampToMilliseconds(row[0], props.queryState.tsColumn.data_type),
          row[1],
        ])
        data.value = tmpData.reverse() // Reverse to show chronological order

        // Update chart cursor state based on data availability
        updateChartCursor(rows.length > 0)
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
      // For logs compatibility - emit query event when no valid zoom range
      emit('query')
      return
    }

    // Convert to timestamp values for time range update
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()

    // Emit the time range update (traces style)
    emit('timeRangeUpdate', [startTime / 1000, endTime / 1000])

    // For logs compatibility - also emit rows update if needed
    // This would need to be handled by the parent component
  }

  if (countSql.value) {
    countQuery()
  }
  // Expose the method to parent component
  defineExpose({
    executeCountQuery,
  })
</script>

<style scoped lang="less"></style>
