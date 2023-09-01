<template lang="pug">
a-card(v-if="hasChart" :bordered="false")
  template(v-if="hasHeader" #title)
    a-space(size="mini")
      svg.icon-18
        use(href="#chart")
      | {{ $t('dashboard.chart') }}
  a-spin(style="width: 100%")
    a-row
      a-form.chart-form(layout="inline" :model="chartForm")
        a-form-item(:label="$t('dashboard.chartType')")
          a-select(v-model="chartForm.chartType" :trigger-props="triggerProps")
            a-option(
              v-for="item of chartTypeOptions"
              :key="item.key"
              :value="item.value"
              :label="item.value"
            )
        a-form-item.select-y(:label="$t('dashboard.yType')")
          a-select(
            v-model="chartForm.selectedYTypes"
            multiple
            :placeholder="$t('dashboard.pleaseSelect')"
            :allow-search="false"
            :trigger-props="triggerProps"
          )
            a-option(v-for="item of yOptions" :value="item" :label="item") {{ item }}
        a-form-item.select-y(:label="$t('dashboard.xType')")
          a-select(
            v-model="chartForm.xAxisType"
            value-key="name"
            :placeholder="$t('dashboard.pleaseSelect')"
            :allow-search="false"
            :trigger-props="triggerProps"
          )
            a-option(v-for="item of xOptions" :value="item") {{ item.name }}
        a-form-item.select-y(:label="$t('dashboard.groupBy')")
          a-select(
            v-model="chartForm.groupBySelectedTypes"
            multiple
            allow-clear
            :disabled="isGroupByDisabled"
            :trigger-props="triggerProps"
          )
            a-option(v-for="item of groupByOptions" :key="item.index" :value="item.name") {{ item.name }}
    a-spin(style="width: 100%" :loading="isChartLoading")
      template(#element)
        a-space(direction="vertical" :size="30")
          a-space(:size="10")
            icon-exclamation-circle-fill.warning-color
            span.loading-tip {{ $tc('dashboard.chartLoadingTip', seriesCount, { count: seriesCount }) }}
          a-button(type="primary" @click="showChart")
            | {{ $t('dashboard.ok') }}
      Chart.chart-area(height="330px" :option="chartOptions" :update-options="updateOptions")
</template>

<script lang="ts" setup>
  import type { PropType } from 'vue'
  import type { datasetType, ResultType, ChartFormType, SeriesType } from '@/store/modules/code-run/types'
  import useDataChart from '@/hooks/data-chart'
  import dayjs from 'dayjs'
  import { chartTypeOptions, updateOptions } from '../../../config'

  const props = defineProps({
    data: {
      type: Object as PropType<ResultType>,
      default: () => ({
        records: { rows: [], schema: { column_schemas: [] } },
        dimensionsAndXName: {
          dimensions: [],
          xAxis: '',
        },
        key: -1,
        type: '',
      }),
    },
    defaultChartForm: {
      type: Object as PropType<ChartFormType>,
      default: () => ({
        chartType: 'line',
        selectedYTypes: [],
        groupBySelectedTypes: [],
      }),
    },

    hasHeader: {
      type: Boolean,
      default: true,
    },
  })

  const isGroupByDisabled = ref(false)
  const isChartLoading = ref(false)
  const chartOptions = ref({})
  const seriesCount = ref(0)

  const { yOptions, hasChart, groupByOptions, chartForm, xOptions } = useDataChart(props.data)
  // TODO: To add this props in every select should not be the best option.
  const triggerProps = {
    'update-at-scroll': true,
  }

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
    // TODO: not sure this `isGroup` is the best way

    const series: SeriesType = {
      name,
      type: chartForm.chartType,
      smooth: false,
      encode: {
        x: chartForm.xAxisType.name,
        y: name,
        label: [name],
      },
      symbolSize: 4,
      datasetIndex: 1,
    }
    if (isGroup) {
      series.datasetIndex = datasetIndex
      series.encode.label = [name, chartForm.selectedYTypes[0]]
      series.encode.y = chartForm.selectedYTypes[0]
    }
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
    const dataset: Array<datasetType> = []
    if (chartForm.groupBySelectedTypes.length === 0) {
      dataset.push({
        dimensions: props.data.dimensionsAndXName.dimensions,
        source: props.data.records.rows,
      })
      dataset.push({
        transform: {
          type: 'sort',
          config: { dimension: chartForm.xAxisType.name, order: 'asc' },
        },
      })
      yAxisTypes.forEach((yAxisName: string) => {
        series.push(generateSeries(yAxisName))
        legendNames.push(yAxisName)
      })
      isChartLoading.value = false
    } else {
      const dataWithGroup = groupByToMap(props.data.records.rows, (value: any) => {
        let string = ``
        chartForm.groupBySelectedTypes.forEach((typeName: string, index: number) => {
          const typeIndex: number = groupByOptions.value.find(({ name }) => name === typeName)?.index ?? -1
          string = index === 0 ? `${value[typeIndex]}` : `${string}, ${value[typeIndex]}`
        })
        return string
      })
      seriesCount.value = dataWithGroup.size
      if (seriesCount.value > 20) {
        isChartLoading.value = true
      } else {
        isChartLoading.value = false
      }
      let datasetIndex = -1
      dataWithGroup.forEach((groupResults: [][], key: string) => {
        legendNames.push(key)
        dataset.push({
          dimensions: props.data.dimensionsAndXName.dimensions,
          source: groupResults,
        })
        dataset.push({
          transform: {
            type: 'sort',
            config: { dimension: chartForm.xAxisType.name, order: 'asc' },
          },
          fromDatasetIndex: (datasetIndex += 1),
        })
        series.push(generateSeries(key, true, (datasetIndex += 1)))
      })
    }
    return { series, legendNames, dataset }
  }

  const makeOptions = () => {
    const { series, legendNames, dataset } = getChartConfig(chartForm.selectedYTypes)
    const xAxis: any = {
      axisLine: {
        lineStyle: {
          type: 'solid',
        },
      },
      axisLabel: {},
      type: 'time',
    }

    const dataType = chartForm.xAxisType.data_type
    if (dataType === 'Date') {
      xAxis.axisLabel.formatter = (value: number) => {
        const date = dayjs(0).add(value, 'day').format('YYYY-MM-DD')
        return date
      }
      xAxis.axisPointer = {
        label: {
          formatter: (params: any) => {
            const { value } = params
            const date = dayjs(0).add(value, 'day').format('YYYY-MM-DD')
            return date
          },
        },
      }
    } else if (dataType === 'DateTime') {
      xAxis.axisLabel.formatter = (value: number) => {
        const date = dayjs.unix(value).format('YYYY-MM-DD HH:mm:ss')
        return date
      }
      xAxis.axisPointer = {
        label: {
          formatter: (params: any) => {
            const { value } = params
            const date = dayjs.unix(value).format('YYYY-MM-DD HH:mm:ss')
            return date
          },
        },
      }
    }

    return {
      legend: {
        data: legendNames,
      },
      tooltip: {
        trigger: 'axis',
      },
      dataset,
      xAxis,
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
    if (hasChart.value) {
      chartForm.selectedYTypes = [yOptions.value[0]]
      chartForm.xAxisType = xOptions.value[0]

      Object.entries(props.defaultChartForm).forEach(([key, value]) => {
        ;(chartForm as any)[key] = (chartForm as any)[key] || value
      })
      chartForm.chartType = props.defaultChartForm.chartType || 'line'
      chartForm.selectedYTypes = props.defaultChartForm.selectedYTypes?.length
        ? props.defaultChartForm.selectedYTypes
        : [yOptions.value[0]]
      chartForm.groupBySelectedTypes = [
        ...props.defaultChartForm.groupBySelectedTypes,
        ...chartForm.groupBySelectedTypes,
      ]
    }
  })

  const drawChart = () => {
    chartOptions.value = makeOptions()
  }

  const showChart = () => {
    isChartLoading.value = false
  }

  watchEffect(() => {
    if (chartForm.selectedYTypes.length !== 1) {
      isGroupByDisabled.value = true
      chartForm.groupBySelectedTypes = []
    } else {
      isGroupByDisabled.value = false
    }
  })

  watch(
    chartForm,
    () => {
      drawChart()
    },
    {
      deep: true,
    }
  )

  defineExpose({
    hasChart,
  })
</script>
