<template lang="pug">
a-spin(style="width: 100%")
  a-row
    a-form.chart-form(:model="chartForm" layout="inline" :onChange="drawChart()")
      a-form-item(:label="$t('dataExplorer.chartType')")
        a-select(v-model="chartForm.chartType")
          a-option(v-for="item of chartTypeOptions" :key="item.key" :value="item.value" :label="item.value")
      a-form-item.select-y(:label="$t('dataExplorer.yType')")
        a-select(v-model="chartForm.ySelectedTypes" :placeholder="$t('dataExplorer.selectY')" multiple :allow-search="false")
          a-option(v-for="item of yOptions" :key="item.value" :value="item.value") {{ item.value }}
  a-row
    Chart.chart-area(height="330px" :option="option" :update-options="updateOptions" )
</template>

<script lang="ts" setup>
  import { chartTypeOptions, updateOptions, numberTypes } from '../config'

  const props = defineProps({
    data: {
      type: Object,
      default: () => ({}),
    },
  })

  const option = ref({})
  const chartForm = reactive({
    chartType: 'line',
    ySelectedTypes: [],
  })

  // TODO: Add support for more data types not just numbers.
  const yOptions = computed(() => {
    return props.data.records.schema.column_schemas
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
          x: props.data.dimensionsAndXName[1],
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
        dimensions: props.data.dimensionsAndXName[0],
        source: props.data.records.rows,
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
