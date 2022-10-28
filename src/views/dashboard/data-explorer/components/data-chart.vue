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
        <a-select defaultValue="Beijing" :style="{ width: '320px' }" placeholder="Please select ..." disabled>
          <a-option>Beijing</a-option>
          <a-option>Shanghai</a-option>
          <a-option>Guangzhou</a-option>
          <a-option disabled>Disabled</a-option>
        </a-select>
        <a-select v-model="chartType" :style="{ width: '320px' }" placeholder="Please select ...">
          <a-option v-for="item of typeData" :key="item.key" :value="item.value" :label="item.value"> </a-option>
        </a-select>
        <a-button type="primary" @click="drawChart()"> Draw </a-button>
      </a-space>
      <Chart height="310px" :option="chartOption" />
    </a-card>
  </a-spin>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { graphic } from 'echarts'
  import useLoading from '@/hooks/loading'
  import { queryContentData, ContentDataRecord } from '@/api/dashboard'
  import useChartOption from '@/hooks/chart-option'
  import { ToolTipFormatterParams } from '@/types/echarts'
  import { AnyObject } from '@/types/global'
  import { computed } from 'vue'

  function graphicFactory(side: AnyObject) {
    return {
      type: 'text',
      bottom: '8',
      ...side,
      style: {
        text: '',
        textAlign: 'center',
        fill: '#4E5969',
        fontSize: 12,
      },
    }
  }
  const typeData: any = [
    {
      key: 1,
      value: 'scatter',
    },
    {
      key: 2,
      value: 'line',
    },
  ]
  const chartType = ref('scatter')

  const { loading, setLoading } = useLoading(true)
  const xAxis = ref<string[]>([])
  const chartsData = ref<number[]>([])
  const graphicElements = ref([graphicFactory({ left: '2.6%' }), graphicFactory({ right: 0 })])
  const options = ref({})
  const { chartOption } = computed(() =>
    useChartOption(() => {
      return options.value
    })
  ).value

  const drawChart = () => {
    options.value = {
      grid: {
        left: '2.6%',
        right: '0',
        top: '10',
        bottom: '30',
      },
      xAxis: {
        type: 'category',
        offset: 2,
        data: xAxis.value,
        boundaryGap: false,
        axisLabel: {
          color: '#4E5969',
          formatter(value: number, idx: number) {
            if (idx === 0) return ''
            if (idx === xAxis.value.length - 1) return ''
            return `${value}`
          },
        },
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        splitLine: {
          show: true,
          interval: (idx: number) => {
            if (idx === 0) return false
            if (idx === xAxis.value.length - 1) return false
            return true
          },
          lineStyle: {
            color: '#E5E8EF',
          },
        },
        axisPointer: {
          show: true,
          lineStyle: {
            color: '#23ADFF',
            width: 2,
          },
        },
      },
      yAxis: {
        type: 'value',
        axisLine: {
          show: false,
        },
        axisLabel: {
          formatter(value: any, idx: number) {
            if (idx === 0) return value
            return `${value}k`
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed',
            color: '#E5E8EF',
          },
        },
      },
      graphic: {
        elements: graphicElements.value,
      },
      series: [
        {
          data: chartsData.value,
          type: chartType.value,
          smooth: true,
          // symbol: 'circle',
          symbolSize: 12,
          emphasis: {
            focus: 'series',
            itemStyle: {
              borderWidth: 2,
            },
          },
          lineStyle: {
            width: 3,
            color: new graphic.LinearGradient(0, 0, 1, 0, [
              {
                offset: 0,
                color: 'rgba(30, 231, 255, 1)',
              },
              {
                offset: 0.5,
                color: 'rgba(36, 154, 255, 1)',
              },
              {
                offset: 1,
                color: 'rgba(111, 66, 251, 1)',
              },
            ]),
          },
          showSymbol: false,
          areaStyle: {
            opacity: 0.8,
            color: new graphic.LinearGradient(0, 0, 0, 1, [
              {
                offset: 0,
                color: 'rgba(17, 126, 255, 0.16)',
              },
              {
                offset: 1,
                color: 'rgba(17, 128, 255, 0)',
              },
            ]),
          },
        },
      ],
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: chartData } = await queryContentData()
      chartData.forEach((el: ContentDataRecord, idx: number) => {
        xAxis.value.push(el.x)
        chartsData.value.push(el.y)
        if (idx === 0) {
          graphicElements.value[0].style.text = el.x
        }
        if (idx === chartData.length - 1) {
          graphicElements.value[1].style.text = el.x
        }
      })
    } catch (err) {
      // you can report use errorHandler or other
    } finally {
      setLoading(false)
    }
  }

  fetchData()
</script>

<style scoped lang="less"></style>
