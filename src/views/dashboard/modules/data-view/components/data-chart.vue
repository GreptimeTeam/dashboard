<template lang="pug">
a-card(v-if="hasChart" :bordered="false")
  template(v-if="hasHeader" #title)
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
        a-form-item.select-y(label="Group By")
          a-select(
            v-model="chartForm.groupByTypes"
            multiple
            allow-clear
            :disabled="chartForm.ySelectedTypes.length === 0"
          )
            a-option(v-for="item of groupByOptions" :key="item.index" :value="item.index") {{ item.name }}
    a-row
      Chart.chart-area(height="330px" :option="chartOptions" :update-options="updateOptions")
</template>

<script lang="ts" setup>
  import type { PropType } from 'vue'
  import type { DimensionType, ResultType, SchemaType, SeriesType } from '@/store/modules/code-run/types'
  import useDataChart from '@/hooks/data-chart'
  import { chartTypeOptions, updateOptions, numberTypes, dateTypes } from '../../../config'

  const props = defineProps({
    data: {
      type: Object as PropType<ResultType>,
      default: () =>
        ({
          records: { rows: [], schema: { column_schemas: [] } },
          dimensionsAndXName: [[], ''],
          key: -1,
          type: '',
        } as ResultType),
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

  const chartOptions = ref({})
  const chartForm = reactive({
    chartType: 'line(smooth)',
    ySelectedTypes: [''],
    groupByTypes: [],
  })

  const { yOptions, hasChart, groupByOptions } = useDataChart(props.data, chartForm.ySelectedTypes[0])

  // TODO: perhaps a better function
  const groupByToMap = <T, Q>(array: T[], predicate: (value: T, index: number, array2: T[]) => Q) =>
    array.reduce((map, value, index, array2) => {
      const key = predicate(value, index, array2)
      const collection = map.get(key)
      if (!collection) {
        map.set(key, [value])
      } else {
        collection.push(value)
      }
      return map
    }, new Map<Q, T[]>())

  const generateSeries = (name: string, isGroup?: boolean, datasetIndex?: number) => {
    const encode = {
      x: props.data.dimensionsAndXName[1],
      y: isGroup ? chartForm.ySelectedTypes[0] : name,
    }
    const series: SeriesType = {
      name,
      type: chartForm.chartType,
      smooth: false,
      encode,
      symbolSize: 4,
    }
    if (isGroup) series.datasetIndex = datasetIndex
    if (chartForm.chartType === 'line(smooth)') {
      series.type = 'line'
      series.smooth = true
      series.symbolSize = 0
    }
    return series
  }

  const getChartConfig = (yAxisTypes: string[]) => {
    const series: Array<SeriesType> = []
    const legendNames: Array<string> = []
    const dataset: Array<{ dimensions: DimensionType[]; source: [][] }> = []
    if (chartForm.groupByTypes.length === 0) {
      dataset.push({
        dimensions: props.data.dimensionsAndXName[0],
        source: props.data.records.rows,
      })
      yAxisTypes.forEach((yAxisName: string) => {
        series.push(generateSeries(yAxisName))
        legendNames.push(yAxisName)
      })
    } else {
      const dataWithGroup = groupByToMap(props.data.records.rows, (value: any) => {
        let string = ``
        chartForm.groupByTypes.forEach((index: number) => {
          string = index === 0 ? `${value[index]}` : `${string}, ${value[index]}`
        })
        return string
      })
      let datasetIndex = -1
      dataWithGroup.forEach((groupResults: [][], key: string) => {
        series.push(generateSeries(key, true, (datasetIndex += 1)))
        legendNames.push(key)
        dataset.push({
          dimensions: props.data.dimensionsAndXName[0],
          source: groupResults,
        })
      })
    }
    return { series, legendNames, dataset }
  }

  const makeOptions = () => {
    const { series, legendNames, dataset } = getChartConfig(chartForm.ySelectedTypes)
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
    chartOptions.value = makeOptions()
  }

  defineExpose({
    hasChart,
  })
</script>
