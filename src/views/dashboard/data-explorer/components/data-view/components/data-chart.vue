<template lang="pug">
a-spin(style="width: 100%")
  a-row
    a-form.form(:model="chartForm" layout="inline")
      a-form-item(:label="$t('dataExplorer.chartType')")
        a-select(v-model="chartForm.chartType" :style="{ width: '320px' }")
          a-option(v-for="item of chartTypeOptions" :key="item.key" :value="item.value" :label="item.value")
      a-form-item(:label="$t('dataExplorer.yType')")
        a-select(v-model="chartForm.ySelectedTypes" :style="{ width: '320px' }" :placeholder="$t('dataExplorer.select')" multiple :filter-option="false")
          a-option(v-for="item of yOptions" :key="item.value" :value="item.value") {{ item.value }}
      a-button(type="primary" @click="drawChart") {{$t('dataExplorer.draw')}}
  a-row
    Chart(height="400px" :option="option" :update-options="updateOptions")
</template>

<script lang="ts" setup>
  import { chartTypeOptions, updateOptions } from '../config'

  const option = ref({})
  const { makeOption, yOptions } = useDataExplorer()
  console.log(yOptions.value)
  // const { loading, setLoading } = useLoading(true)
  const chartForm = reactive({
    chartType: 'line',
    ySelectedTypes: [],
  })
  const drawChart = () => {
    option.value = useDataExplorer().makeOption([chartForm.chartType, chartForm.ySelectedTypes])
  }
</script>

<style scoped lang="stylus">
  .form
    margin-left 20px
</style>
