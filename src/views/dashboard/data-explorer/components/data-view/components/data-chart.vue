<template lang="pug">
a-spin(style="width: 100%")
  a-row
    a-form.form(:model="chartForm" layout="inline")
      a-form-item(:label="$t('dataExplorer.chartType')")
        a-select(v-model="chartForm.chartType" :style="{ width: '320px' }")
          a-option(v-for="item of chartTypeOptions" :key="item.key" :value="item.value" :label="item.value")
      a-form-item(:label="$t('dataExplorer.yType')")
        a-select(v-model="chartForm.ySelectedTypes" :style="{ width: '320px' }" :placeholder="$t('dataExplorer.select')" multiple :filter-option="false")
          a-option(v-for="item of yOptions" :key="item.value" :value="item.value") {{ item.value }}
      a-button(type="primary" @click="drawChart") {{$t('dataExplorer.draw')}}
  a-row
    Chart(height="400px" :option="option" :update-options="updateOptions")
</template>

<script lang="ts" setup>
  import { chartTypeOptions, updateOptions } from '../config'

  const { currentResult } = storeToRefs(useCodeRunStore())
  const option = ref({})
  const chartForm = reactive({
    chartType: 'line',
    ySelectedTypes: [],
  })

  const yOptions = computed(() => {
    return currentResult.value.schema.column_schemas
      .filter((item: any) => item.data_type === 'Int' || item.data_type === 'Float64')
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
          x: currentResult.value.dimensionsAndXName[1],
          y: item,
        },
      }
      if (chartType === 'line(smooth)') {
        oneSeries.type = 'line'
        oneSeries.smooth = true
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
        orient: 'vertical',
      },
      tooltip: {},
      dataset: {
        dimensions: currentResult.value.dimensionsAndXName[0],
        source: currentResult.value.rows,
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

<style scoped lang="stylus">
  .form
    margin-left 20px
</style>
