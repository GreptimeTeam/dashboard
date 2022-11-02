<template>
  <a-spin :loading="loading" style="width: 100%">
    <a-card
      class="general-card"
      :header-style="{ paddingBottom: 0 }"
      :body-style="{
        paddingTop: '20px',
      }"
    >
      <a-space direction="vertical" size="large">
        <a-select v-model="chartType" :style="{ width: '320px' }" placeholder="Please select ...">
          <a-option v-for="item of chartTypeOptions" :key="item.key" :value="item.value" :label="item.value">
          </a-option>
        </a-select>
        <a-select
          @change="yChanged()"
          v-model="ySelectedTypes"
          :style="{ width: '320px' }"
          :loading="loading"
          placeholder="Please select ..."
          multiple
          :filter-option="false"
        >
          <a-option v-for="item of yOptions" :key="item.value" :value="item.value">{{ item.value }}</a-option>
        </a-select>
        <a-button type="primary" @click="drawChart()"> Draw </a-button>
      </a-space>
      <Chart height="400px" width="800px" :option="option" :update-options="updateOptions" />
    </a-card>
  </a-spin>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { graphic } from 'echarts'
  import useLoading from '@/hooks/loading'
  import { queryChartData } from '@/api/dashboard'
  import { computed } from 'vue'
  import DefaultLayout from '@/layout/default-layout.vue'
  import { computedInject } from '@vueuse/core'

  const { loading, setLoading } = useLoading(true)
  // todo: move to config
  const chartTypeOptions: any = [
    {
      key: 1,
      value: 'scatter',
    },
    {
      key: 2,
      value: 'line',
    },
    {
      key: 3,
      value: 'bar',
    },
  ]
  const chartType = ref('line')

  const yOptions = ref<any>([])
  const ySelectedTypes = ref<any>([])

  const dimensions = ref<any>([])
  const source = ref<any>([])

  const seriesAndLegendNames = computed(() => {
    console.log('series is being computed')
    const tempSeries: any = []
    const tempLegendNames: any = []
    ySelectedTypes.value.forEach((item: any) => {
      const oneSeries = {
        name: item,
        type: chartType.value,
        encode: {
          x: 'ts',
          y: item,
        },
      }
      tempSeries.push(oneSeries)
      tempLegendNames.push(item)
    })
    return [tempSeries, tempLegendNames]
  })

  const option = ref({})
  const updateOptions = { notMerge: true }

  const drawChart = () => {
    // todo: makeOption()
    option.value = {
      legend: {
        data: seriesAndLegendNames.value[1],
        orient: 'vertical',
        right: 10,
        top: 'center',
      },
      tooltip: {},
      dataset: {
        dimensions: dimensions.value,
        source: source.value,
      },
      xAxis: { type: 'time' },
      yAxis: {},
      series: seriesAndLegendNames.value[0],
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const data = queryChartData()
      console.log(data.output.records)
      const {
        output: { records },
      } = data
      records.schema.column_schemas.forEach((element) => {
        const tempElement = {}

        ;(tempElement as any).name = element.name
        switch (element.data_type) {
          case 'Timestamp':
            ;(tempElement as any).type = 'time'
            break
          case 'String':
            ;(tempElement as any).type = 'ordinal'
            break
          case 'Float64':
            ;(tempElement as any).type = 'float'
            break
          case 'Int':
            ;(tempElement as any).type = 'int'
            break
          default:
            ;(tempElement as any).type = 'ordinal'
        }
        dimensions.value.push(tempElement)
        if (element.data_type === 'Int' || element.data_type === 'Float64') {
          const item = {
            value: element.name,
          }
          yOptions.value.push(item)
        }
      })
      source.value = records.rows
      console.log(source.value)
    } catch (err) {
      // some error
    } finally {
      setLoading(false)
    }
  }

  fetchData()
</script>

<style scoped lang="less"></style>
