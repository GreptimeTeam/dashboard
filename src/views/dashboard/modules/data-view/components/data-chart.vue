<template lang="pug">
a-card(v-if="hasChart" :bordered="false")
  template(v-if="hasHeader" #title)
    a-space(size="mini")
      svg.icon-18
        use(href="#chart")
      | {{ $t('dashboard.chart') }}
  a-spin(style="width: 100%")
    a-spin(style="width: 100%" :loading="isChartLoading")
      template(#element)
        a-space(direction="vertical" :size="30")
          a-space(:size="10")
            icon-exclamation-circle-fill.warning-color
            span.loading-tip {{ $tc('dashboard.chartLoadingTip', seriesCount, { count: seriesCount }) }}
          a-button(type="primary" @click="showChart")
            | {{ $t('dashboard.ok') }}
      Chart(:height="chartHeight" :option="chartOptions" :update-options="updateOptions")
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
        a-form-item(:label="$t('dashboard.yType')")
          a-select(
            v-model="chartForm.selectedYTypes"
            multiple
            :placeholder="$t('dashboard.pleaseSelect')"
            :allow-search="false"
            :trigger-props="triggerProps"
          )
            a-option(v-for="item of yOptions" :value="item" :label="item") {{ item }}
        a-form-item(:label="$t('dashboard.xType')")
          a-select(
            v-model="chartForm.xAxisType"
            value-key="name"
            :placeholder="$t('dashboard.pleaseSelect')"
            :allow-search="false"
            :trigger-props="triggerProps"
          )
            a-option(v-for="item of xOptions" :value="item") {{ item.name }}
        a-form-item(:label="$t('dashboard.groupBy')")
          a-select(
            v-model="chartForm.groupBySelectedTypes"
            multiple
            allow-clear
            :disabled="isGroupByDisabled"
            :trigger-props="triggerProps"
          )
            a-option(v-for="item of groupByOptions" :key="item.index" :value="item.name") {{ item.name }}
</template>

<script lang="ts" setup>
  import type { PropType } from 'vue'
  import type { datasetType, ResultType, ChartFormType, SeriesType } from '@/store/modules/code-run/types'
  import useDataChart from '@/hooks/data-chart'
  import { dateFormatter, groupByToMap } from '@/utils'
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
  const chartHeight = ref('330px')
  const chartWidth = ref<number>(596)

  const { yOptions, hasChart, groupByOptions, chartForm, xOptions } = useDataChart(props.data)
  // TODO: To add this props in every select should not be the best option.
  const triggerProps = {
    'update-at-scroll': true,
  }

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
    }

    const dataType = chartForm.xAxisType.data_type

    if (dataType !== 'TimestampMillisecond') {
      xAxis.axisLabel.formatter = (value: number) => {
        return dateFormatter(dataType, value)
      }
      xAxis.axisPointer = {
        label: {
          formatter: (params: any) => {
            const { value } = params
            return dateFormatter(dataType, value)
          },
        },
      }
      xAxis.min = (value: any) => {
        return value.min
      }
    } else {
      xAxis.type = 'time'
    }

    const legendIconHeight = 14
    const legendIconWidth = 30
    const legendItemGap = 12
    const legendTextLineHeight = 15
    const legendToBottom = 2
    const gridHeight = 240
    const legendToGridGap = 24
    // Legend font size: 12px
    // monospace font width: 7.23px

    // TODO: better calculation for legend height
    // legendNames.forEach((name: string) => {
    //   const width = name.length * 7.23 + legendIconWidth + legendItemGap
    // })

    const legendsTotalLength =
      // legend names width
      legendNames.join('').length * 7.23 +
      // legend icons width
      legendIconWidth * legendNames.length +
      // legend gap
      legendItemGap * (legendNames.length - 1)

    const legendsRowCount = Math.ceil(legendsTotalLength / chartWidth.value)
    const legendHight = legendsRowCount * legendTextLineHeight + legendItemGap * (legendsRowCount - 1)
    const gridToBottom = legendHight + legendToGridGap
    chartHeight.value = `${gridToBottom + gridHeight}px`

    return {
      legend: {
        data: legendNames,
        bottom: legendToBottom,
        height: legendHight,
        itemGap: legendItemGap,
        itemWidth: legendIconWidth,
        itemHeight: legendIconHeight,
        borderWidth: 0,
        // TODO: legend width, overflow and tooltip
        textStyle: {
          overflow: 'truncate',
          fontFamily: 'monospace',
          lineHeight: legendTextLineHeight,
        },
      },
      grid: {
        containLabel: true,
        left: 12,
        right: 12,
        top: 12,
        bottom: gridToBottom,
      },
      tooltip: {
        trigger: 'axis',
        appendToBody: true,
      },
      dataset,
      xAxis,
      yAxis: {
        axisLine: {
          lineStyle: {
            type: 'solid',
          },
        },
        min: 'dataMin',
        max: 'dataMax',
      },
      series,
    }
  }

  // TODO: Might need to change this
  onMounted(() => {
    if (hasChart.value) {
      chartForm.chartType = props.defaultChartForm.chartType || 'line'

      chartForm.selectedYTypes = props.defaultChartForm.selectedYTypes?.length
        ? props.defaultChartForm.selectedYTypes
        : [yOptions.value[0]]

      chartForm.xAxisType = props.defaultChartForm.xAxisType?.name
        ? props.defaultChartForm.xAxisType
        : xOptions.value[0]

      if (props.defaultChartForm.groupBySelectedTypes?.length) {
        chartForm.groupBySelectedTypes = props.defaultChartForm.groupBySelectedTypes
      } else if (groupByOptions.value.length) {
        chartForm.groupBySelectedTypes = [groupByOptions.value[0].name]
      }
    }
  })

  const drawChart = () => {
    const MENU_WIDTH = 242
    const modalElement = ref<any>()
    chartWidth.value = 800

    chartOptions.value = JSON.parse(JSON.stringify(makeOptions()))
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
    [chartForm, () => props],
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

<style scoped lang="less">
  .chart-form {
    margin-top: 12px;
    :deep(.arco-select-view-single) {
      min-width: 180px;
    }
    :deep(.arco-select-view-multiple.arco-select-view-size-medium) {
      font-size: 14px;
      min-width: 180px;
    }
    .arco-form-item-layout-inline {
      margin-right: 38px;
    }
  }
</style>
