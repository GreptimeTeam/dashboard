<template>
  <a-spin style="width: 100%">
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
          v-model="ySelectedTypes"
          :style="{ width: '320px' }"
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

  import useSqlResult from '@/hooks/data-view'

  const sqlResult = useSqlResult()
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
  const chartType = ref('line')
  const option = ref({})
  const { yOptions } = sqlResult
  const ySelectedTypes = ref<any>([])

  const updateOptions = { notMerge: true }

  const drawChart = () => {
    option.value = sqlResult.makeOption(ySelectedTypes.value)
  }
</script>

<style scoped lang="less"></style>
