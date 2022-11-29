<template lang="pug">
a-spin(style="width: 100%")
  a-row(style="margin-bottom: 16px")
    a-col(flex="auto")
      Chart(height="400px" :option="option" :update-options="updateOptions")
    a-col(flex="100px")
      a-form(:model="chartForm" layout="vertical")
        a-form-item(label="Chart Type")
          a-select(v-model="chartForm.chartType" :style="{ width: '320px' }" placeholder="Please select ...")
            a-option(v-for="item of chartTypeOptions" :key="item.key" :value="item.value" :label="item.value")
        a-form-item(label="Y Types")
          a-select(v-model="chartForm.ySelectedTypes" :style="{ width: '320px' }" placeholder="Select" multiple :filter-option="false")
            a-option(v-for="item of yOptions[activeTabKey]" :key="item.value" :value="item.value")
              .
                {{
                item.value
                }}
      a-button(type="primary" @click="drawChart()")
        | Draw
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import useDataExplorer from '@/hooks/data-explorer'
  import { useCodeRunStore } from '@/store'
  import { storeToRefs } from 'pinia'

  const codeRunStore = useCodeRunStore()
  const { activeTabKey } = storeToRefs(codeRunStore)

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
