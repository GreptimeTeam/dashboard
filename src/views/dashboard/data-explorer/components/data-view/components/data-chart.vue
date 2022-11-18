<template>
  <a-spin style="width: 100%">
    <a-row style="margin-bottom: 16px">
      <a-col flex="auto">
        <Chart height="250px" width="800px" :option="option" :update-options="updateOptions" />
      </a-col>
      <a-col flex="100px">
        <a-form :model="chartForm" layout="vertical">
          <a-form-item label="chart Type">
            <a-select v-model="chartForm.chartType" :style="{ width: '320px' }" placeholder="Please select ...">
              <a-option v-for="item of chartTypeOptions" :key="item.key" :value="item.value" :label="item.value">
              </a-option>
            </a-select>
          </a-form-item>
          <a-form-item label="Y Types">
            <a-select
              v-model="chartForm.ySelectedTypes"
              :style="{ width: '320px' }"
              placeholder="Select"
              multiple
              :filter-option="false"
            >
              <a-option v-for="item of yOptions" :key="item.value" :value="item.value">{{ item.value }}</a-option>
            </a-select>
          </a-form-item>
        </a-form>
        <a-button type="primary" @click="drawChart()"> Draw </a-button>
      </a-col>
    </a-row>
  </a-spin>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import useDataExplorer from '@/hooks/data-explorer'

  const { yOptions } = useDataExplorer()
  // const { loading, setLoading } = useLoading(true)
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
  const chartForm = ref({
    chartType: 'line',
    ySelectedTypes: [],
  })
  const option = ref({})

  const updateOptions = { notMerge: true }

  const drawChart = () => {
    option.value = useDataExplorer().makeOption([chartForm.value.chartType, chartForm.value.ySelectedTypes])
  }
</script>

<style scoped lang="less"></style>
