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
        a-form-item.select-y(label="Group By")
          a-select(
            v-model="chartForm.groupByTypes"
            multiple
            allow-clear
            :disabled="chartForm.ySelectedTypes.length === 0"
          )
            a-option(v-for="item of groupByOptions" :key="item.index" :value="item.index") {{ item.name }}
    a-row
      Chart.chart-area(height="330px" :option="option" :update-options="updateOptions")
</template>

<script lang="ts" setup>
  import type { DimensionType, ResultType, SchemaType } from '@/store/modules/code-run/types'
  import type { SeriesOption } from 'echarts'
  import { chartTypeOptions, updateOptions, numberTypes, dateTypes } from '../../../config'

  const props = defineProps({
    data: {
      type: Object,
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

  const option = ref({})
  const chartForm = reactive({
    chartType: 'line(smooth)',
    ySelectedTypes: [''],
    groupByTypes: [],
  })
  const hasTimestamp = props.data.dimensionsAndXName[1] !== ''
  const schemaInRecords = computed(() => props.data.records.schema)

  // TODO: Add support for more data types not just numbers.
  const yOptions = computed(() => {
    if (!schemaInRecords.value || !hasTimestamp) return []
    return schemaInRecords.value.column_schemas
      .filter((item: SchemaType) => numberTypes.find((type: string) => type === item.data_type))
      .map((item: SchemaType) => ({
        value: item.name,
      }))
  })

  const groupByOptions = computed(() => {
    return schemaInRecords.value.column_schemas
      .map((item: SchemaType, index: number) => ({
        ...item,
        index,
      }))
      .filter(
        (item: SchemaType) =>
          !dateTypes.find((type: string) => type === item.data_type) && item.name !== chartForm.ySelectedTypes[0]
      )
  })

  const hasChart = computed(() => {
    return yOptions.value.length > 0
  })

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

  const getSeriesAndLegendNames = ([chartType, ySelectedTypes]: any) => {
    const series: Array<SeriesOption> = []
    const legendNames: Array<string> = []
    const dataset: Array<{ dimensions: DimensionType[]; source: [][] }> = []
    if (chartForm.groupByTypes.length === 0) {
      dataset.push({
        dimensions: props.data.dimensionsAndXName[0],
        source: props.data.records.rows,
      })
      ySelectedTypes.forEach((item: string) => {
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
        const oneSeries = {
          name: key,
          type: chartType,
          smooth: false,
          encode: {
            x: props.data.dimensionsAndXName[1],
            y: chartForm.ySelectedTypes[0],
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
        legendNames.push(key)
        dataset.push({
          dimensions: props.data.dimensionsAndXName[0],
          source: groupResults,
        })
      })
    }
    return { series, legendNames, dataset }
  }

  const makeOption = (item: any) => {
    const { series, legendNames, dataset } = getSeriesAndLegendNames(item)
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
