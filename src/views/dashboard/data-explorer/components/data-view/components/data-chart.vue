<template lang="pug">
pre {{option}}
a-spin(style="width: 100%")
  //- a-row
  //-   a-form.form(:model="chartForm" layout="inline")
  //-     a-form-item(label="Chart Type")
  //-       a-select(v-model="chartForm.chartType" :style="{ width: '320px' }" placeholder="Please select ...")
  //-         a-option(v-for="item of chartTypeOptions" :key="item.key" :value="item.value" :label="item.value")
  //-     a-form-item(label="Y Types")
  //-       a-select(v-model="chartForm.ySelectedTypes" :style="{ width: '320px' }" placeholder="Select" multiple :filter-option="false")
  //-         a-option(v-for="item of yOptions[activeTabKey]" :key="item.value" :value="item.value") {{ item.value }}
  //-     a-button(type="primary" @click="drawChart") Draw
  //- a-row
  //-   Chart(height="400px" :option="option" :update-options="updateOptions")
</template>

<script lang="ts" setup>
  import { chartTypeOptions, updateOptions } from '../config'

  const { makeOption } = useDataExplorer()
  // const { loading, setLoading } = useLoading(true)
  const chartForm = reactive({
    chartType: 'line',
    ySelectedTypes: [],
  })
  const option = computed(() => makeOption([chartForm.chartType, chartForm.ySelectedTypes]))
</script>

<style scoped lang="stylus">
  .form
    margin-left 20px
</style>
