<template lang="pug">
a-card(v-if="hasChart" :bordered="false")
  template(#title)
    a-space(size="mini")
      svg.icon-18
        use(href="#chart")
      | {{ $t('dataExplorer.chart') }}
  a-spin(style="width: 100%")
    a-row
      a-form.chart-form(layout="inline" :model="chartForm" :onChange="drawChart()")
        a-form-item(:label="$t('dataExplorer.chartType')")
          a-select(v-model="chartForm.chartType" :trigger-props="triggerProps")
            a-option(
              v-for="item of chartTypeOptions"
              :key="item.key"
              :value="item.value"
              :label="item.value"
            )
        a-form-item.select-y(:label="$t('dataExplorer.yType')")
          a-select(
            v-model="chartForm.ySelectedTypes"
            multiple
            :placeholder="$t('dataExplorer.selectY')"
            :allow-search="false"
            :trigger-props="triggerProps"
          )
            a-option(v-for="item of yOptions" :key="item.value" :value="item.value") {{ item.value }}
        a-form-item(label="Filter by")
          a-select(v-model="chartForm.filterBy" :disabled="chartForm.ySelectedTypes.length > 1")
            a-option(v-for="item of filterOptions" :="item") {{ item.value }}
          | =
          a-select(v-model="chartForm.equals" allow-create multiple)
    a-row
      Chart.chart-area(height="330px" :option="option" :update-options="updateOptions")
</template>

<script lang="ts" setup>
  import type { SeriesOption } from 'echarts/types/dist/shared'
  import type { ResultType } from '@/store/modules/code-run/types'
  import { chartTypeOptions, updateOptions, numberTypes } from '../../../config'

  const props = defineProps({
    data: {
      type: Object,
      default: () => ({} as ResultType),
    },
    hasHeader: {
      type: Boolean,
      default: true,
    },
  })

  // TODO: To add this props in every select should not be the best option.
  const triggerProps = {
    'update-at-scroll': true,
  }

  const option = ref({})
  const chartForm = reactive({
    chartType: 'line(smooth)',
    ySelectedTypes: [''],
    filterBy: '',
    equals: [],
  })
  const hasTimestamp = props.data.dimensionsAndXName[1] !== ''
  const schemaInRecords = computed(() => props.data.records.schema)

  // TODO: Add support for more data types not just numbers.
  const yOptions = computed(() => {
    if (!schemaInRecords.value || !hasTimestamp) return []
    return schemaInRecords.value.column_schemas
      .filter((item: any) => numberTypes.find((type: string) => type === item.data_type))
      .map((item: any) => ({
        value: item.name,
      }))
  })

  const hasChart = computed(() => {
    return yOptions.value.length > 0
  })

  const filterOptions = computed(() => {
    return schemaInRecords.value.column_schemas
      .filter(
        (item: any) => item.name !== props.data.dimensionsAndXName[1] && item.name !== chartForm.ySelectedTypes[0]
      )
      .map((item: any) => ({
        value: item.name,
      }))
  })

  const getSeriesAndLegendNames = ([chartType, ySelectedTypes]: any) => {
    const series: Array<SeriesOption> = []
    const legendNames: Array<string> = []
    if (chartForm.filterBy === '') {
      ySelectedTypes.forEach((yAxis: string) => {
        const oneSeries = {
          name: yAxis,
          type: chartType,
          smooth: false,
          encode: {
            x: props.data.dimensionsAndXName[1],
            y: yAxis,
            label: [yAxis],
          },
          symbolSize: 4,
        }

        if (chartType === 'line(smooth)') {
          oneSeries.type = 'line'
          oneSeries.smooth = true
          oneSeries.symbolSize = 0
        }
        series.push(oneSeries)
        legendNames.push(yAxis)
      })
    } else {
      const yAxis = ySelectedTypes[0]
      const { filterBy } = chartForm
      let datasetIndex = 0
      chartForm.equals.forEach((equalItem: string) => {
        const oneSeries = {
          name: equalItem,
          type: chartType,
          smooth: false,
          encode: {
            x: props.data.dimensionsAndXName[1],
            y: yAxis,
            label: [equalItem, yAxis],
          },
          symbolSize: 4,
          datasetIndex: (datasetIndex += 1),
        }
        if (chartType === 'line(smooth)') {
          oneSeries.type = 'line'
          oneSeries.smooth = true
          oneSeries.symbolSize = 0
        }
        series.push(oneSeries)
        legendNames.push(equalItem)
      })
    }

    return { series, legendNames }
  }

  const makeOption = (item: any) => {
    const { series, legendNames } = getSeriesAndLegendNames(item)
    const dataset = []
    const dataset0 = {
      dimensions: props.data.dimensionsAndXName[0],
      source: props.data.records.rows,
    }
    dataset.push(dataset0)
    chartForm.equals.forEach((equalItem: string) => {
      const datasetItem = {
        fromDatasetIndex: 0,
        transform: {
          type: 'filter',
          config: { dimension: chartForm.filterBy, value: equalItem },
        },
      }
      dataset.push(datasetItem)
    })
    return {
      legend: {
        data: legendNames,
      },
      tooltip: {
        trigger: 'axis',
      },
      dataset,
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

  // TODO: Might need to change this
  onMounted(() => {
    if (hasChart.value) chartForm.ySelectedTypes = [yOptions.value[0].value]
  })

  const drawChart = () => {
    option.value = makeOption([chartForm.chartType, chartForm.ySelectedTypes])
  }
</script>
