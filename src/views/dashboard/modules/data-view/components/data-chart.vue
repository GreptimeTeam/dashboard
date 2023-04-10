<template lang="pug">
a-card(:bordered="false" v-if="schemaInRecords && hasTimestamp")
  template(#title)
    a-space(size="mini")
      svg.icon-18
        use(href="#chart")
      | {{$t('dataExplorer.chart')}}
  a-spin(style="width: 100%")
    a-row
      a-form.chart-form(:model="chartForm" layout="inline" :onChange="drawChart()")
        a-form-item(:label="$t('dataExplorer.chartType')")
          a-select(v-model="chartForm.chartType" :trigger-props="triggerProps")
            a-option(v-for="item of chartTypeOptions" :key="item.key" :value="item.value" :label="item.value")
        a-form-item.select-y(:label="$t('dataExplorer.yType')")
          a-select(v-model="chartForm.ySelectedTypes" :placeholder="$t('dataExplorer.selectY')" multiple :allow-search="false" :trigger-props="triggerProps")
            a-option(v-for="item of yOptions" :key="item.value" :value="item.value") {{ item.value }}
    a-row
      Chart.chart-area(height="330px" :option="option" :update-options="updateOptions" )
</template>

<script lang="ts" setup>
  import { chartTypeOptions, updateOptions, numberTypes } from '../../../config'

  // TODO: To add this props in every select should not be the best option.
  const triggerProps = {
    'update-at-scroll': true,
  }

  const { currentResult } = storeToRefs(useCodeRunStore())
  const option = ref({})
  const chartForm = reactive({
    chartType: 'line',
    ySelectedTypes: [],
  })
  const { schema: schemaInRecords } = currentResult.value.records
  const { dimensionsAndXName } = currentResult.value
  const hasTimestamp = dimensionsAndXName[1] !== ''

  // TODO: Add support for more data types not just numbers.
  const yOptions = computed(() => {
    if (!schemaInRecords) return []
    return schemaInRecords.column_schemas
      .filter((item: any) => numberTypes.find((type: string) => type === item.data_type))
      .map((item: any) => ({
        value: item.name,
      }))
  })

  const getSeriesAndLegendNames = ([chartType, ySelectedTypes = []]: any) => {
    const series: any = []
    const legendNames: any = []
    ySelectedTypes.forEach((item: any) => {
      const oneSeries = {
        name: item,
        type: chartType,
        smooth: false,
        encode: {
          x: dimensionsAndXName[1],
          y: item,
        },
        symbolSize: 4,
      }
      if (chartType === 'line(smooth)') {
        oneSeries.type = 'line'
        oneSeries.smooth = true
        oneSeries.symbolSize = 0
      }
      series.push(oneSeries)
      legendNames.push(item)
    })
    return { series, legendNames }
  }

  const makeOption = (item: any) => {
    const { series, legendNames } = getSeriesAndLegendNames(item)
    return {
      legend: {
        data: legendNames,
      },
      tooltip: {
        trigger: 'axis',
      },
      dataset: {
        dimensions: dimensionsAndXName[0],
        source: currentResult.value.records.rows,
      },
      xAxis: {
        type: 'time',
        name: 'Time',
        axisLine: {
          lineStyle: {
            type: 'solid',
          },
        },
      },
      yAxis: {
        axisLine: {
          lineStyle: {
            type: 'solid',
          },
        },
      },
      series,
    }
  }

  const drawChart = () => {
    option.value = makeOption([chartForm.chartType, chartForm.ySelectedTypes])
  }
</script>
